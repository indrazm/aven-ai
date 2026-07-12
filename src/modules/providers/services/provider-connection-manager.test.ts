import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {CompletionModel} from '@anvia/core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ConfigStore} from '../../../libs/config/index.js';
import type {ProviderFactory} from '../../../libs/provider-clients/index.js';
import {ProviderConnectionManager} from './provider-connection-manager.js';

const directories: string[] = [];
const model = {provider: 'test', defaultModel: 'test'} as CompletionModel;

const fixture = async (factory: ProviderFactory) => {
	const directory = await mkdtemp(join(tmpdir(), 'aven-provider-'));
	directories.push(directory);
	const config = new ConfigStore(join(directory, 'config.toml'));
	return {config, manager: new ProviderConnectionManager(config, factory)};
};

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('ProviderConnectionManager', () => {
	it('selects the first listed model, caches a sorted unique list, and retains later selections', async () => {
		const factory: ProviderFactory = () => ({
			model: () => model,
			listModels: async () => ({data: [{id: 'z-model'}, {id: 'a-model'}, {id: 'z-model'}]}),
		});
		const {config, manager} = await fixture(factory);

		expect(await manager.setup('openrouter', {apiKey: 'secret'})).toMatchObject({model: 'z-model'});
		expect(await config.load()).toMatchObject({
			apiKeys: {openrouter: 'secret'},
			models: {openrouter: ['a-model', 'z-model']},
			selectedModels: {openrouter: 'z-model'},
		});

		await manager.selectModel('a-model');
		expect(await manager.connect('openrouter')).toMatchObject({model: 'a-model'});
	});

	it('does not persist credentials when discovery returns no supported models', async () => {
		const factory: ProviderFactory = () => ({model: () => model, listModels: async () => ({data: []})});
		const {config, manager} = await fixture(factory);

		await expect(manager.setup('deepseek', {apiKey: 'secret'})).rejects.toThrow('no supported models');
		expect(await config.resolvedCredentials('deepseek')).toBeUndefined();
	});

	it('normalizes Databricks credentials before verification and persistence', async () => {
		const factory = vi.fn<ProviderFactory>(() => ({
			model: () => model,
			listModels: async () => ({data: [{id: 'endpoint-model'}]}),
		}));
		const {config, manager} = await fixture(factory);

		await manager.setup('databricks', {apiKey: 'token', baseUrl: 'dbc.example.databricks.com'});
		expect(factory).toHaveBeenCalledWith('databricks', {
			apiKey: 'token',
			baseUrl: 'https://dbc.example.databricks.com/ai-gateway/mlflow/v1',
		});
		expect(await config.resolvedCredentials('databricks')).toEqual({
			apiKey: 'token',
			baseUrl: 'https://dbc.example.databricks.com/ai-gateway/mlflow/v1',
		});
	});
});
