import {randomUUID} from 'node:crypto';
import {chmod, mkdir, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {parse, stringify} from 'smol-toml';
import {z} from 'zod';
import {providerCatalog, providerIds, type ProviderId} from '../provider-definitions/index.js';

export type ConfigProviderId = ProviderId;

const providerIdSchema = z.enum(providerIds);
const apiKeySchema = z.string().trim().min(1).regex(/^\S+$/u);
const baseUrlSchema = z.string().trim().min(1).regex(/^\S+$/u);
const modelIdSchema = z.string().trim().min(1);
const apiKeysSchema = z.partialRecord(providerIdSchema, apiKeySchema).default({});
const baseUrlsSchema = z.partialRecord(providerIdSchema, baseUrlSchema).default({});
const providerModelsSchema = z.partialRecord(providerIdSchema, z.array(modelIdSchema)).default({});
const selectedModelsSchema = z.partialRecord(providerIdSchema, modelIdSchema).default({});

const configSchema = z.object({
	version: z.literal(1),
	activeProvider: providerIdSchema.optional(),
	apiKeys: apiKeysSchema,
	baseUrls: baseUrlsSchema,
	models: providerModelsSchema,
	selectedModels: selectedModelsSchema,
});

const tomlConfigSchema = z.object({
	version: z.literal(1),
	active_provider: providerIdSchema.optional(),
	api_keys: apiKeysSchema,
	base_urls: baseUrlsSchema,
	models: providerModelsSchema,
	selected_models: selectedModelsSchema,
});

export type AvenConfig = z.infer<typeof configSchema>;

export type StoredProviderCredentials = {
	apiKey: string;
	baseUrl?: string;
};

export const defaultConfigDirectory = (): string =>
	join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'aven-ai');

export const defaultConfigPath = (): string => join(defaultConfigDirectory(), 'config.toml');
export const defaultLegacyConfigPath = (): string => join(defaultConfigDirectory(), 'config.json');

const emptyConfig = (): AvenConfig => ({
	version: 1,
	apiKeys: {},
	baseUrls: {},
	models: {},
	selectedModels: {},
});

const fromToml = (value: unknown, path: string): AvenConfig => {
	const parsed = tomlConfigSchema.safeParse(value);
	if (!parsed.success) throw new Error(`Invalid configuration in ${path}`);
	return {
		version: 1,
		...(parsed.data.active_provider ? {activeProvider: parsed.data.active_provider} : {}),
		apiKeys: parsed.data.api_keys,
		baseUrls: parsed.data.base_urls,
		models: parsed.data.models,
		selectedModels: parsed.data.selected_models,
	};
};

const toToml = (config: AvenConfig): string =>
	stringify({
		version: config.version,
		...(config.activeProvider ? {active_provider: config.activeProvider} : {}),
		api_keys: config.apiKeys,
		base_urls: config.baseUrls,
		models: config.models,
		selected_models: config.selectedModels,
	});

export type SaveConnectionOptions = {
	apiKey?: string;
	baseUrl?: string;
	models?: readonly string[];
	selectedModel?: string;
};

export class ConfigStore {
	readonly path: string;
	readonly legacyPath: string;

	constructor(path = defaultConfigPath(), legacyPath = join(dirname(path), 'config.json')) {
		this.path = path;
		this.legacyPath = legacyPath;
	}

	async load(): Promise<AvenConfig> {
		let source: string;
		try {
			source = await readFile(this.path, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return this.migrateLegacy();
			throw error;
		}

		try {
			return fromToml(parse(source), this.path);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('Invalid configuration')) throw error;
			// The parser error may echo configuration values, including API keys.
			// eslint-disable-next-line preserve-caught-error
			throw new Error(`Invalid TOML in ${this.path}`);
		}
	}

	async resolvedCredentials(provider: ConfigProviderId): Promise<StoredProviderCredentials | undefined> {
		const config = await this.load();
		const apiKey = apiKeySchema.safeParse(config.apiKeys[provider]);
		if (!apiKey.success) return undefined;
		const baseUrl = baseUrlSchema.safeParse(config.baseUrls[provider]);
		if (providerCatalog[provider].baseUrl?.required && !baseUrl.success) return undefined;
		return {apiKey: apiKey.data, ...(baseUrl.success ? {baseUrl: baseUrl.data} : {})};
	}

	async hasCredentials(provider: ConfigProviderId): Promise<boolean> {
		return Boolean(await this.resolvedCredentials(provider));
	}

	async saveConnection(provider: ConfigProviderId, options: SaveConnectionOptions = {}): Promise<AvenConfig> {
		const current = await this.load();
		const apiKeys = options.apiKey === undefined ? current.apiKeys : {...current.apiKeys, [provider]: options.apiKey};
		const baseUrls =
			options.baseUrl === undefined ? current.baseUrls : {...current.baseUrls, [provider]: options.baseUrl};
		const models =
			options.models === undefined ? current.models : {...current.models, [provider]: [...new Set(options.models)]};
		const selectedModels =
			options.selectedModel === undefined
				? current.selectedModels
				: {...current.selectedModels, [provider]: options.selectedModel};
		const next: AvenConfig = {version: 1, activeProvider: provider, apiKeys, baseUrls, models, selectedModels};
		await this.write(next);
		return next;
	}

	async selectModel(provider: ConfigProviderId, model: string): Promise<AvenConfig> {
		const normalized = model.trim();
		const current = await this.load();
		if (!current.models[provider]?.includes(normalized)) {
			throw new Error(`Model ${normalized} is not cached for ${providerCatalog[provider].label}`);
		}
		const next: AvenConfig = {
			...current,
			selectedModels: {...current.selectedModels, [provider]: normalized},
		};
		await this.write(next);
		return next;
	}

	private async migrateLegacy(): Promise<AvenConfig> {
		let source: string;
		try {
			source = await readFile(this.legacyPath, 'utf8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyConfig();
			throw error;
		}

		let value: unknown;
		try {
			value = JSON.parse(source);
		} catch {
			throw new Error(`Invalid JSON in ${this.legacyPath}`);
		}
		const parsed = configSchema.safeParse(value);
		if (!parsed.success) throw new Error(`Invalid configuration in ${this.legacyPath}`);
		await this.write(parsed.data);
		await rm(this.legacyPath, {force: true});
		return parsed.data;
	}

	private async write(config: AvenConfig): Promise<void> {
		const directory = dirname(this.path);
		await mkdir(directory, {recursive: true, mode: 0o700});
		await chmod(directory, 0o700);
		const temporary = `${this.path}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporary, toToml(config), {encoding: 'utf8', mode: 0o600});
			await chmod(temporary, 0o600);
			await rename(temporary, this.path);
			await chmod(this.path, 0o600);
		} finally {
			await rm(temporary, {force: true});
		}
	}
}
