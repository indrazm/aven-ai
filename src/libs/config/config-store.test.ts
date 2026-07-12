import {access, mkdir, mkdtemp, readFile, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {parse} from 'smol-toml';
import {afterEach, describe, expect, it} from 'vitest';
import {ConfigStore} from './config-store.js';

const directories: string[] = [];

const temporaryConfig = async (environment: NodeJS.ProcessEnv = {}) => {
	const directory = await mkdtemp(join(tmpdir(), 'aven-config-'));
	directories.push(directory);
	const path = join(directory, 'nested', 'config.toml');
	return {path, store: new ConfigStore(path, environment)};
};

afterEach(async () => {
	const {rm} = await import('node:fs/promises');
	await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('ConfigStore', () => {
	it('uses environment keys until a persisted key overrides them', async () => {
		const {store} = await temporaryConfig({OPENAI_API_KEY: 'environment-key'});
		expect(await store.resolvedKey('openai')).toBe('environment-key');

		await store.saveConnection('openai', 'persisted-key');
		expect(await store.resolvedKey('openai')).toBe('persisted-key');
		expect((await store.load()).activeProvider).toBe('openai');
	});

	it('writes credentials with owner-only permissions', async () => {
		const {path, store} = await temporaryConfig();
		await store.saveConnection('anthropic', 'secret');

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

	it('ignores environment keys containing whitespace', async () => {
		const {store} = await temporaryConfig({OPENAI_API_KEY: 'invalid key'});
		expect(await store.resolvedKey('openai')).toBeUndefined();
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
