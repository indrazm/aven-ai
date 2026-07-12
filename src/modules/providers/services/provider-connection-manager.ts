import type {CompletionModel} from '@anvia/core';
import {providerCatalog as providers, providerIds, type ProviderId} from '../catalog.js';
import type {ConnectionState, ModelStatus, ProviderStatus} from '../types.js';
import {ConfigStore} from '../../../libs/config/index.js';
import {defaultProviderFactory, type ProviderFactory} from '../../../libs/provider-clients/index.js';
import {safeErrorMessage} from '../../../utils/safe-error.js';

const disconnected = (): ConnectionState => ({status: 'disconnected'});

export class MissingProviderKeyError extends Error {
	readonly provider: ProviderId;

	constructor(provider: ProviderId) {
		super(`No API key configured for ${providers[provider].label}. Run /setup.`);
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
		return Promise.all(
			providerIds.map(async (id) => ({
				id,
				label: providers[id].label,
				model: config.selectedModels[id] ?? providers[id].model,
				configured: await this.#config.hasKey(id),
				active: this.#connection.status === 'connected' && this.#connection.provider === id,
			})),
		);
	}

	async modelStatuses(): Promise<ModelStatus[]> {
		const provider = this.#connection.provider;
		if (!provider) return [];
		const config = await this.#config.load();
		const selected = config.selectedModels[provider] ?? providers[provider].model;
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
				model: providers[config.activeProvider].model,
				error: safeErrorMessage(error),
			});
		}
	}

	async connect(provider: ProviderId): Promise<ConnectionState> {
		const key = await this.#config.resolvedKey(provider);
		if (!key) throw new MissingProviderKeyError(provider);
		return this.#activate(provider, key);
	}

	async setup(provider: ProviderId, apiKey: string): Promise<ConnectionState> {
		const normalized = apiKey.trim();
		if (!normalized) throw new Error('API key must not be empty');
		if (/\s/u.test(normalized)) throw new Error('API key must not contain whitespace');
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

	async #activate(provider: ProviderId, key: string, apiKey?: string): Promise<ConnectionState> {
		const existing = await this.#config.load();
		const preferredModel = existing.selectedModels[provider] ?? providers[provider].model;
		this.#setConnection({
			status: 'connecting',
			provider,
			providerLabel: providers[provider].label,
			model: preferredModel,
		});
		try {
			const connection = this.#providerFactory(provider, key);
			const listing = await connection.listModels();
			const modelIds = [...new Set(listing.data.map((model) => model.id).filter(Boolean))].sort();
			const selectedModel =
				modelIds.length === 0 || modelIds.includes(preferredModel) ? preferredModel : providers[provider].model;
			const cachedModels = modelIds.includes(selectedModel) ? modelIds : [selectedModel, ...modelIds];
			await this.#config.saveConnection(provider, {
				...(apiKey ? {apiKey} : {}),
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
				model: preferredModel,
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
