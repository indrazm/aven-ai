import {describe, expect, it, vi} from 'vitest';
import {loadLexaRuntime} from './lexa-runtime.js';

const nativeModule = {binaryPath: '/packages/lexa/bin/lexa', lexaVersion: '0.10.0'};
const skillModule = {lexaSkill: '# Lexa\n\nUse the index.', lexaVersion: '0.10.0'};

const importer = vi.fn(async (specifier: string): Promise<unknown> =>
	specifier === 'lexa-index' ? nativeModule : skillModule,
);

describe('loadLexaRuntime', () => {
	it('loads and verifies the version-matched native binary and skill', async () => {
		const runVersion = vi.fn(async () => 'lexa 0.10.0');
		const runtime = await loadLexaRuntime({
			platform: 'darwin',
			architecture: 'arm64',
			importModule: importer,
			runVersion,
		});

		expect(importer).toHaveBeenCalledWith('lexa-index');
		expect(importer).toHaveBeenCalledWith('lexa-index/skill');
		expect(runVersion).toHaveBeenCalledWith('/packages/lexa/bin/lexa');
		expect(runtime).toEqual({
			binaryDirectory: '/packages/lexa/bin',
			binaryPath: '/packages/lexa/bin/lexa',
			skill: '# Lexa\n\nUse the index.',
			version: '0.10.0',
		});
	});

	it('rejects unsupported targets before loading packages', async () => {
		const importModule = vi.fn();
		await expect(loadLexaRuntime({platform: 'win32', architecture: 'x64', importModule})).rejects.toThrow(
			'does not currently support win32-x64',
		);
		expect(importModule).not.toHaveBeenCalled();
	});

	it('reports missing, invalid, and mismatched packages clearly', async () => {
		await expect(
			loadLexaRuntime({
				platform: 'linux',
				architecture: 'x64',
				importModule: async () => {
					throw new Error('native package missing');
				},
			}),
		).rejects.toThrow('optional dependencies enabled');

		await expect(
			loadLexaRuntime({
				platform: 'linux',
				architecture: 'x64',
				importModule: async () => ({}),
			}),
		).rejects.toThrow('invalid Lexa package');

		await expect(
			loadLexaRuntime({
				platform: 'linux',
				architecture: 'x64',
				importModule: async (specifier) =>
					specifier === 'lexa-index' ? nativeModule : {...skillModule, lexaVersion: '0.10.1'},
			}),
		).rejects.toThrow('mismatched Lexa packages');
	});

	it('reports binary startup failures and unexpected versions', async () => {
		await expect(
			loadLexaRuntime({
				platform: 'linux',
				architecture: 'x64',
				importModule: importer,
				runVersion: async () => {
					throw new Error('GLIBC_2.39 not found');
				},
			}),
		).rejects.toThrow('GLIBC_2.39 not found');

		await expect(
			loadLexaRuntime({
				platform: 'linux',
				architecture: 'x64',
				importModule: importer,
				runVersion: async () => 'lexa 0.9.0',
			}),
		).rejects.toThrow('expected Lexa 0.10.0');
	});
});
