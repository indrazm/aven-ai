import {describe, expect, it} from 'vitest';
import {
	defaultProviderFactory,
	minimaxModels,
	opencodeGoModelProtocol,
	providerBaseUrls,
	requireOpencodeGoModelProtocol,
	xiaomiMimoModels,
} from './provider-client.js';

describe('provider clients', () => {
	it('uses the sibling provider endpoints', () => {
		expect(providerBaseUrls['devscale-ai']).toBe('https://ai.devscale.id/api/v1');
		expect(providerBaseUrls.openrouter).toBe('https://openrouter.ai/api/v1');
		expect(providerBaseUrls.deepseek).toBe('https://api.deepseek.com');
		expect(providerBaseUrls['fireworks-ai']).toBe('https://api.fireworks.ai/inference/v1');
		expect(providerBaseUrls['github-models']).toBe('https://models.github.ai/inference');
		expect(providerBaseUrls.huggingface).toBe('https://router.huggingface.co/v1');
		expect(providerBaseUrls.minimax).toBe('https://api.minimax.io/anthropic');
		expect(providerBaseUrls.sumopod).toBe('https://ai.sumopod.com');
	});

	it('returns curated Xiaomi MiMo and MiniMax models without a network request', async () => {
		const xiaomi = await defaultProviderFactory('xiaomi-mimo', {apiKey: 'test'}).listModels();
		const minimax = await defaultProviderFactory('minimax', {apiKey: 'test'}).listModels();
		expect(xiaomi.data).toEqual(xiaomiMimoModels);
		expect(minimax.data).toEqual(minimaxModels);
		expect(xiaomi.data.map((model) => model.id)).toEqual(['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-pro', 'mimo-v2-omni']);
		expect(minimax.data.map((model) => model.id)).toEqual(['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed']);
	});

	it('maps OpenCode Go models to their required protocol', () => {
		expect(opencodeGoModelProtocol('kimi-k2.5')).toBe('openai-compatible');
		expect(opencodeGoModelProtocol('minimax-m2.7')).toBe('anthropic');
		expect(opencodeGoModelProtocol('unknown')).toBeUndefined();
		expect(() => requireOpencodeGoModelProtocol('unknown')).toThrow('protocol is not mapped');
	});

	it('requires a Databricks workspace URL before creating its client', () => {
		expect(() => defaultProviderFactory('databricks', {apiKey: 'test'})).toThrow('workspace URL');
	});
});
