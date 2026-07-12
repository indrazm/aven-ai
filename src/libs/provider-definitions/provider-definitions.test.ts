import {describe, expect, it} from 'vitest';
import {isProviderId, normalizeDatabricksBaseUrl, providerCatalog, providerIds} from './provider-definitions.js';

describe('provider definitions', () => {
	it('defines the complete Aven provider set', () => {
		expect(providerIds).toEqual([
			'openai',
			'openrouter',
			'deepseek',
			'fireworks-ai',
			'github-models',
			'huggingface',
			'devscale-ai',
			'sumopod',
			'databricks',
			'anthropic',
			'opencode-go',
			'xiaomi-mimo',
			'minimax',
		]);
		expect(Object.keys(providerCatalog)).toEqual(providerIds);
		expect(isProviderId('opencode-go')).toBe(true);
		expect(isProviderId('unknown')).toBe(false);
		expect(providerCatalog.databricks.baseUrl?.required).toBe(true);
	});

	it('normalizes Databricks workspace hosts and preserves explicit paths', () => {
		expect(normalizeDatabricksBaseUrl('dbc.example.databricks.com')).toBe(
			'https://dbc.example.databricks.com/ai-gateway/mlflow/v1',
		);
		expect(normalizeDatabricksBaseUrl('https://dbc.example.com/custom/path?x=1#section')).toBe(
			'https://dbc.example.com/custom/path',
		);
		expect(() => normalizeDatabricksBaseUrl(' ')).toThrow('workspace URL is required');
	});
});
