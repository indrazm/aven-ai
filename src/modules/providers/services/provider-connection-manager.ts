import type {CompletionModel} from '@anvia/core';
import {providerCatalog as providers, providerIds, type ProviderId} from '../catalog.js';
import type {ConnectionState, ModelStatus, ProviderStatus} from '../types.js';
import {ConfigStore} from '../../../libs/config/index.js';
import {
	defaultProviderFactory,
	type ProviderCredentials,
	type ProviderFactory,
} from '../../../libs/provider-clients/index.js';
import {normalizeProviderBaseUrl} from '../../../libs/provider-definitions/index.js';
import {safeErrorMessage} from '../../../utils/safe-error.js';

const disconnected = (): ConnectionState => ({status: 'disconnected'});

export class MissingProviderKeyError extends Error {
	readonly provider: ProviderId;

	constructor(provider: ProviderId) {
		super(`No credentials configured for ${providers[provider].label}. Run /setup.`);
		this.name = 'MissingProviderKeyError';
		this.provider = provider;
	}
}

export class ProviderConnectionManager {
	readonly #config: ConfigStore;
	readonly #providerFactory: ProviderFactory;
	#connection: ConnectionState = disconnected();
	#model: CompletionModel | undefined;
	#modelFactory: ((model: string) => CompletionModel) | undefined;

	constructor(config = new ConfigStore(), providerFactory = defaultProviderFactory) {
		this.#config = config;
		this.#providerFactory = providerFactory;
	}

	get state(): ConnectionState {
		return this.#connection;
	}

	get model(): CompletionModel | undefined {
		return this.#model;
	}

	async providerStatuses(): Promise<ProviderStatus[]> {
		const config = await this.#config.load();
		return providerIds.map((id) => ({
			id,
			label: providers[id].label,
			...(config.selectedModels[id] ? {model: config.selectedModels[id]} : {}),
			configured: Boolean(config.apiKeys[id] && (!providers[id].baseUrl?.required || config.baseUrls[id])),
			active: this.#connection.status === 'connected' && this.#connection.provider === id,
		}));
	}

	async modelStatuses(): Promise<ModelStatus[]> {
		const provider = this.#connection.provider;
		if (!provider) return [];
		const config = await this.#config.load();
		const selected = config.selectedModels[provider];
		return (config.models[provider] ?? []).map((id) => ({id, active: id === selected}));
	}

	async restore(): Promise<ConnectionState> {
		const config = await this.#config.load();
		if (!config.activeProvider) return this.#setConnection(disconnected());
		try {
			return await this.connect(config.activeProvider);
		} catch (error) {
			return this.#setConnection({
				status: 'error',
				provider: config.activeProvider,
				providerLabel: providers[config.activeProvider].label,
				...(config.selectedModels[config.activeProvider] ? {model: config.selectedModels[config.activeProvider]} : {}),
				error: safeErrorMessage(error),
			});
		}
	}

	async connect(provider: ProviderId): Promise<ConnectionState> {
		const credentials = await this.#config.resolvedCredentials(provider);
		if (!credentials) throw new MissingProviderKeyError(provider);
		return this.#activate(provider, credentials);
	}

	async setup(provider: ProviderId, credentials: ProviderCredentials): Promise<ConnectionState> {
		const apiKey = credentials.apiKey.trim();
		if (!apiKey) throw new Error('API key must not be empty');
		if (/\s/u.test(apiKey)) throw new Error('API key must not contain whitespace');
		const descriptor = providers[provider];
		let baseUrl: string | undefined;
		if (descriptor.baseUrl?.required) {
			if (!credentials.baseUrl) throw new Error(`${descriptor.baseUrl.label} is required.`);
			baseUrl = normalizeProviderBaseUrl(provider, credentials.baseUrl);
		}
		const normalized = {apiKey, ...(baseUrl ? {baseUrl} : {})};
		return this.#activate(provider, normalized, normalized);
	}

	async selectModel(model: string): Promise<ConnectionState> {
		const provider = this.#connection.provider;
		if (this.#connection.status !== 'connected' || !provider || !this.#modelFactory) {
			throw new Error('Connect a provider before selecting a model.');
		}
		await this.#config.selectModel(provider, model);
		this.#model = this.#modelFactory(model);
		return this.#setConnection({...this.#connection, model});
	}

	async #activate(
		provider: ProviderId,
		credentials: ProviderCredentials,
		persistedCredentials?: ProviderCredentials,
	): Promise<ConnectionState> {
		const existing = await this.#config.load();
		const preferredModel = existing.selectedModels[provider];
		this.#setConnection({
			status: 'connecting',
			provider,
			providerLabel: providers[provider].label,
			...(preferredModel ? {model: preferredModel} : {}),
		});
		try {
			const connection = this.#providerFactory(provider, credentials);
			const listing = await connection.listModels();
			const modelIds = [...new Set(listing.data.map((model) => model.id.trim()).filter(Boolean))];
			if (modelIds.length === 0) throw new Error(`${providers[provider].label} returned no supported models.`);
			const selectedModel = preferredModel && modelIds.includes(preferredModel) ? preferredModel : modelIds[0]!;
			const cachedModels = [...modelIds].sort((left, right) => left.localeCompare(right));
			await this.#config.saveConnection(provider, {
				...(persistedCredentials?.apiKey ? {apiKey: persistedCredentials.apiKey} : {}),
				...(persistedCredentials?.baseUrl ? {baseUrl: persistedCredentials.baseUrl} : {}),
				models: cachedModels,
				selectedModel,
			});
			this.#modelFactory = connection.model;
			this.#model = connection.model(selectedModel);
			return this.#setConnection({
				status: 'connected',
				provider,
				providerLabel: providers[provider].label,
				model: selectedModel,
			});
		} catch (error) {
			this.#model = undefined;
			this.#modelFactory = undefined;
			this.#setConnection({
				status: 'error',
				provider,
				providerLabel: providers[provider].label,
				...(preferredModel ? {model: preferredModel} : {}),
				error: safeErrorMessage(error),
			});
			throw error;
		}
	}

	#setConnection(connection: ConnectionState): ConnectionState {
		this.#connection = connection;
		return connection;
	}
}
