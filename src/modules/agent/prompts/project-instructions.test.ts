import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadProjectInstructions} from './project-instructions.js';

const directories: string[] = [];

const temporaryDirectory = async (): Promise<string> => {
	const directory = await mkdtemp(join(tmpdir(), 'aven-instructions-'));
	directories.push(directory);
	return directory;
};

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('loadProjectInstructions', () => {
	it('discovers deterministic broad-to-deep scopes while ignoring generated directories and symlinks', async () => {
		const root = await temporaryDirectory();
		await mkdir(join(root, 'packages', 'alpha', 'src'), {recursive: true});
		await mkdir(join(root, 'packages', 'beta'), {recursive: true});
		await writeFile(join(root, 'AGENTS.md'), 'root rules');
		await writeFile(join(root, 'packages', 'alpha', 'AGENTS.md'), 'alpha rules');
		await writeFile(join(root, 'packages', 'alpha', 'src', 'AGENTS.md'), 'source rules');
		await writeFile(join(root, 'packages', 'beta', 'AGENTS.md'), 'beta rules');

		for (const ignored of [
			'.git',
			'node_modules',
			'dist',
			'build',
			'target',
			'coverage',
			'.next',
			'.cache',
			'vendor',
		]) {
			await mkdir(join(root, ignored), {recursive: true});
			await writeFile(join(root, ignored, 'AGENTS.md'), `${ignored} rules`);
		}

		await mkdir(join(root, 'packages', 'linked'), {recursive: true});
		const linkedDirectory = await temporaryDirectory();
		const linkedRules = join(linkedDirectory, 'AGENTS.md');
		await writeFile(linkedRules, 'linked rules');
		await symlink(linkedRules, join(root, 'packages', 'linked', 'AGENTS.md'));
		await symlink(linkedDirectory, join(root, 'linked-directory'), 'dir');

		const result = await loadProjectInstructions(root);

		expect(result.files).toEqual([
			expect.objectContaining({path: 'AGENTS.md', scope: '.', content: 'root rules'}),
			expect.objectContaining({path: 'packages/alpha/AGENTS.md', scope: 'packages/alpha', content: 'alpha rules'}),
			expect.objectContaining({path: 'packages/beta/AGENTS.md', scope: 'packages/beta', content: 'beta rules'}),
			expect.objectContaining({
				path: 'packages/alpha/src/AGENTS.md',
				scope: 'packages/alpha/src',
				content: 'source rules',
			}),
		]);
		expect(result.omittedPaths).toEqual([]);
		expect(result.warnings).toEqual([]);
	});

	it('enforces file-count, per-file, and aggregate byte limits without emitting broken UTF-8', async () => {
		const root = await temporaryDirectory();
		await mkdir(join(root, 'a'), {recursive: true});
		await mkdir(join(root, 'b'), {recursive: true});
		await writeFile(join(root, 'AGENTS.md'), 'abc😀tail');
		await writeFile(join(root, 'a', 'AGENTS.md'), 'alpha');
		await writeFile(join(root, 'b', 'AGENTS.md'), 'beta');

		const perFile = await loadProjectInstructions(root, {maxFileBytes: 5});
		expect(perFile.files[0]).toMatchObject({content: 'abc', truncated: true});
		expect(perFile.files[0]?.content).not.toContain('�');

		const fileCount = await loadProjectInstructions(root, {maxFiles: 2});
		expect(fileCount.files.map((file) => file.path)).toEqual(['AGENTS.md', 'a/AGENTS.md']);
		expect(fileCount.omittedPaths).toEqual(['b/AGENTS.md']);

		await writeFile(join(root, 'AGENTS.md'), '1234');
		const aggregate = await loadProjectInstructions(root, {maxFileBytes: 100, maxTotalBytes: 6});
		expect(aggregate.files).toEqual([
			expect.objectContaining({path: 'AGENTS.md', content: '1234', truncated: false}),
			expect.objectContaining({path: 'a/AGENTS.md', content: 'al', truncated: true}),
		]);
		expect(aggregate.omittedPaths).toEqual(['b/AGENTS.md']);
	});

	it('reports discovery failures without failing prompt construction', async () => {
		const root = await temporaryDirectory();
		const result = await loadProjectInstructions(join(root, 'missing'));

		expect(result.files).toEqual([]);
		expect(result.omittedPaths).toEqual([]);
		expect(result.warnings).toHaveLength(1);
		expect(result.warnings[0]).toContain('Could not inspect');
	});

	it('bounds the omitted-path report when a repository has many instruction files', async () => {
		const root = await temporaryDirectory();
		await writeFile(join(root, 'AGENTS.md'), 'root');
		for (let index = 0; index < 40; index++) {
			const directory = join(root, `package-${String(index).padStart(2, '0')}`);
			await mkdir(directory);
			await writeFile(join(directory, 'AGENTS.md'), `rules ${index}`);
		}

		const result = await loadProjectInstructions(root, {maxFiles: 1});

		expect(result.files).toHaveLength(1);
		expect(result.omittedPaths).toHaveLength(32);
		expect(result.warnings).toContain('8 additional AGENTS.md files were omitted from the prompt.');
	});
});
