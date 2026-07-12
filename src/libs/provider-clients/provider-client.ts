import {AnthropicClient} from '@anvia/anthropic';
import type {CompletionModel} from '@anvia/core';
import type {ListedModel, ModelList} from '@anvia/core/model-listing';
import {OpenAIClient} from '@anvia/openai';
import type {ProviderId} from '../provider-definitions/index.js';
import {normalizeDatabricksBaseUrl} from '../provider-definitions/index.js';

export type ProviderClientId = ProviderId;

export type ProviderCredentials = {
	apiKey: string;
	baseUrl?: string;
};

export type ProviderConnection = {
	model(model: string): CompletionModel;
	listModels(): Promise<ModelList>;
};

export type ProviderFactory = (provider: ProviderClientId, credentials: ProviderCredentials) => ProviderConnection;

export const providerBaseUrls = {
	anthropic: 'https://api.anthropic.com',
	'devscale-ai': 'https://ai.devscale.id/api/v1',
	deepseek: 'https://api.deepseek.com',
	'fireworks-ai': 'https://api.fireworks.ai/inference/v1',
	'github-models': 'https://models.github.ai/inference',
	huggingface: 'https://router.huggingface.co/v1',
	minimax: 'https://api.minimax.io/anthropic',
	'opencode-go-anthropic': 'https://opencode.ai/zen/go',
	'opencode-go-openai': 'https://opencode.ai/zen/go/v1',
	openrouter: 'https://openrouter.ai/api/v1',
	'xiaomi-mimo': 'https://token-plan-sgp.xiaomimimo.com/v1',
} as const;

export const minimaxModels: readonly ListedModel[] = [
	{
		contextLength: 1_000_000,
		description: 'MiniMax M3 chat model.',
		id: 'MiniMax-M3',
		name: 'MiniMax-M3',
		ownedBy: 'minimax',
		type: 'chat',
	},
	{
		contextLength: 204_800,
		description: 'MiniMax M2.7 chat model.',
		id: 'MiniMax-M2.7',
		name: 'MiniMax-M2.7',
		ownedBy: 'minimax',
		type: 'chat',
	},
	{
		contextLength: 204_800,
		description: 'MiniMax M2.7 high-speed chat model.',
		id: 'MiniMax-M2.7-highspeed',
		name: 'MiniMax-M2.7-highspeed',
		ownedBy: 'minimax',
		type: 'chat',
	},
];

export const xiaomiMimoModels: readonly ListedModel[] = [
	{
		contextLength: 1_048_576,
		description: 'Flagship reasoning model for text generation and agents.',
		id: 'mimo-v2.5-pro',
		name: 'MiMo-V2.5-Pro',
		ownedBy: 'xiaomi',
		type: 'chat',
	},
	{
		contextLength: 1_048_576,
		description: 'Multimodal model for text, image, audio, and video understanding.',
		id: 'mimo-v2.5',
		name: 'MiMo-V2.5',
		ownedBy: 'xiaomi',
		type: 'chat',
	},
	{
		contextLength: 1_048_576,
		description: 'Flagship reasoning model for text generation and agents.',
		id: 'mimo-v2-pro',
		name: 'MiMo-V2-Pro',
		ownedBy: 'xiaomi',
		type: 'chat',
	},
	{
		contextLength: 262_144,
		description: 'Omni-modal model for multimodal understanding.',
		id: 'mimo-v2-omni',
		name: 'MiMo-V2-Omni',
		ownedBy: 'xiaomi',
		type: 'chat',
	},
];

export type OpencodeGoModelProtocol = 'anthropic' | 'openai-compatible';

const opencodeGoModelProtocols: Readonly<Record<string, OpencodeGoModelProtocol>> = {
	'deepseek-v4-flash': 'openai-compatible',
	'deepseek-v4-pro': 'openai-compatible',
	'glm-5': 'openai-compatible',
	'glm-5.1': 'openai-compatible',
	'kimi-k2.5': 'openai-compatible',
	'kimi-k2.6': 'openai-compatible',
	'mimo-v2-omni': 'openai-compatible',
	'mimo-v2-pro': 'openai-compatible',
	'mimo-v2.5': 'openai-compatible',
	'mimo-v2.5-pro': 'openai-compatible',
	'minimax-m2.5': 'anthropic',
	'minimax-m2.7': 'anthropic',
	'qwen3.5-plus': 'anthropic',
	'qwen3.6-plus': 'anthropic',
	'qwen3.7-max': 'anthropic',
};

export const opencodeGoModelProtocol = (model: string): OpencodeGoModelProtocol | undefined =>
	opencodeGoModelProtocols[model];

export const requireOpencodeGoModelProtocol = (model: string): OpencodeGoModelProtocol => {
	const protocol = opencodeGoModelProtocol(model);
	if (!protocol) throw new Error(`OpenCode Go model "${model}" is not supported because its protocol is not mapped.`);
	return protocol;
};

const staticModelList = (models: readonly ListedModel[]): ModelList => ({data: [...models]});

const openAiCompatibleConnection = (credentials: ProviderCredentials, baseUrl: string): ProviderConnection => {
	const client = new OpenAIClient({apiKey: credentials.apiKey, baseUrl});
	return {
		model: (model) => client.completionModel(model),
		listModels: () => client.listModels(),
	};
};

const anthropicConnection = (credentials: ProviderCredentials, baseUrl?: string): ProviderConnection => {
	const client = new AnthropicClient({apiKey: credentials.apiKey, ...(baseUrl ? {baseUrl} : {})});
	return {
		model: (model) => client.completionModel(model),
		listModels: () => client.listModels(),
	};
};

const opencodeGoConnection = (credentials: ProviderCredentials): ProviderConnection => {
	const listingClient = new OpenAIClient({apiKey: credentials.apiKey, baseUrl: providerBaseUrls['opencode-go-openai']});
	return {
		model: (model) => {
			const protocol = requireOpencodeGoModelProtocol(model);
			if (protocol === 'anthropic') {
				return new AnthropicClient({
					apiKey: credentials.apiKey,
					baseUrl: providerBaseUrls['opencode-go-anthropic'],
				}).completionModel(model);
			}
			return listingClient.completionModel(model);
		},
		listModels: async () => {
			const listing = await listingClient.listModels();
			return {...listing, data: listing.data.filter((model) => Boolean(opencodeGoModelProtocol(model.id)))};
		},
	};
};

export const defaultProviderFactory: ProviderFactory = (provider, credentials) => {
	if (provider === 'openai') {
		const client = new OpenAIClient({apiKey: credentials.apiKey});
		return {model: (model) => client.completionModel(model), listModels: () => client.listModels()};
	}
	if (provider === 'anthropic') return anthropicConnection(credentials);
	if (provider === 'minimax') {
		const connection = anthropicConnection(credentials, providerBaseUrls.minimax);
		return {...connection, listModels: async () => staticModelList(minimaxModels)};
	}
	if (provider === 'xiaomi-mimo') {
		const client = new OpenAIClient({
			apiKey: credentials.apiKey,
			baseUrl: providerBaseUrls['xiaomi-mimo'],
			headers: {'api-key': credentials.apiKey},
		});
		return {
			model: (model) => client.completionModel(model),
			listModels: async () => staticModelList(xiaomiMimoModels),
		};
	}
	if (provider === 'opencode-go') return opencodeGoConnection(credentials);
	if (provider === 'databricks') {
		if (!credentials.baseUrl) throw new Error('Databricks workspace URL is not configured.');
		return openAiCompatibleConnection(credentials, normalizeDatabricksBaseUrl(credentials.baseUrl));
	}
	return openAiCompatibleConnection(credentials, providerBaseUrls[provider]);
};
