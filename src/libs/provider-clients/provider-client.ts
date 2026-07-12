import {AnthropicClient} from '@anvia/anthropic';
import type {CompletionModel} from '@anvia/core';
import type {ModelList} from '@anvia/core/model-listing';
import {OpenAIClient} from '@anvia/openai';

export type ProviderClientId = 'openai' | 'anthropic';

export type ProviderConnection = {
	model(model: string): CompletionModel;
	listModels(): Promise<ModelList>;
};

export type ProviderFactory = (provider: ProviderClientId, apiKey: string) => ProviderConnection;

export const defaultProviderFactory: ProviderFactory = (provider, apiKey) => {
	if (provider === 'openai') {
		const client = new OpenAIClient({apiKey});
		return {
			model: (model) => client.completionModel(model),
			listModels: () => client.listModels(),
		};
	}
	const client = new AnthropicClient({apiKey});
	return {
		model: (model) => client.completionModel(model),
		listModels: () => client.listModels(),
	};
};
