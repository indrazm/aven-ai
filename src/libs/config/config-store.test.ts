import {access, mkdir, mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {parse} from 'smol-toml';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {providerIds} from '../provider-definitions/index.js';
import {ConfigStore} from './config-store.js';

const directories: string[] = [];

const temporaryConfig = async () => {
	const directory = await mkdtemp(join(tmpdir(), 'aven-config-'));
	directories.push(directory);
	const path = join(directory, 'nested', 'config.toml');
	return {path, store: new ConfigStore(path)};
};

afterEach(async () => {
	const {rm} = await import('node:fs/promises');
	vi.unstubAllEnvs();
	await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('ConfigStore', () => {
	it('resolves credentials only after they are persisted', async () => {
		const {store} = await temporaryConfig();
		expect(await store.resolvedCredentials('openai')).toBeUndefined();

		await store.saveConnection('openai', {apiKey: 'persisted-key'});
		expect(await store.resolvedCredentials('openai')).toEqual({apiKey: 'persisted-key'});
		expect((await store.load()).activeProvider).toBe('openai');
	});

	it('does not use provider environment variables', async () => {
		vi.stubEnv('OPENAI_API_KEY', 'environment-key');
		vi.stubEnv('ANTHROPIC_API_KEY', 'environment-key');
		const {store} = await temporaryConfig();

		expect(await store.resolvedCredentials('openai')).toBeUndefined();
		expect(await store.resolvedCredentials('anthropic')).toBeUndefined();
	});

	it('writes credentials with owner-only permissions', async () => {
		const {path, store} = await temporaryConfig();
		await store.saveConnection('anthropic', {apiKey: 'secret'});

		expect(parse(await readFile(path, 'utf8'))).toMatchObject({
			version: 1,
			active_provider: 'anthropic',
			api_keys: {anthropic: 'secret'},
		});
		if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600);
	});

	it('rejects malformed TOML configuration', async () => {
		const {path, store} = await temporaryConfig();
		await mkdir(dirname(path), {recursive: true});
		await writeFile(path, 'api_keys = [');
		await expect(store.load()).rejects.toThrow('Invalid TOML');
	});

	it('requires both a token and workspace URL for Databricks', async () => {
		const {store} = await temporaryConfig();
		await store.saveConnection('databricks', {apiKey: 'token'});
		expect(await store.resolvedCredentials('databricks')).toBeUndefined();

		await store.saveConnection('databricks', {baseUrl: 'https://dbc.example.com/ai-gateway/mlflow/v1'});
		expect(await store.resolvedCredentials('databricks')).toEqual({
			apiKey: 'token',
			baseUrl: 'https://dbc.example.com/ai-gateway/mlflow/v1',
		});
	});

	it('round-trips credentials for every provider id', async () => {
		const {store} = await temporaryConfig();
		for (const provider of providerIds) {
			await store.saveConnection(provider, {
				apiKey: `secret-${provider}`,
				...(provider === 'databricks' ? {baseUrl: 'https://dbc.example.com/ai-gateway/mlflow/v1'} : {}),
			});
		}

		const config = await store.load();
		expect(Object.keys(config.apiKeys)).toEqual(providerIds);
		for (const provider of providerIds) expect(await store.hasCredentials(provider)).toBe(true);
	});

	it('caches provider models and persists the selected model in TOML', async () => {
		const {path, store} = await temporaryConfig();
		await store.saveConnection('openai', {
			apiKey: 'secret',
			models: ['gpt-5-mini', 'gpt-5', 'gpt-5-mini'],
			selectedModel: 'gpt-5',
		});
		await store.selectModel('openai', 'gpt-5-mini');

		expect(await store.load()).toMatchObject({
			models: {openai: ['gpt-5-mini', 'gpt-5']},
			selectedModels: {openai: 'gpt-5-mini'},
		});
		expect(parse(await readFile(path, 'utf8'))).toMatchObject({
			models: {openai: ['gpt-5-mini', 'gpt-5']},
			selected_models: {openai: 'gpt-5-mini'},
		});
	});

	it('migrates the legacy JSON file to TOML and removes the duplicate secret', async () => {
		const {path, store} = await temporaryConfig();
		await mkdir(dirname(path), {recursive: true});
		await writeFile(
			store.legacyPath,
			JSON.stringify({
				version: 1,
				activeProvider: 'openai',
				apiKeys: {openai: 'legacy-key'},
			}),
		);

		expect(await store.load()).toMatchObject({activeProvider: 'openai', apiKeys: {openai: 'legacy-key'}});
		expect(parse(await readFile(path, 'utf8'))).toMatchObject({
			active_provider: 'openai',
			api_keys: {openai: 'legacy-key'},
		});
		await expect(access(store.legacyPath)).rejects.toMatchObject({code: 'ENOENT'});
	});
});
