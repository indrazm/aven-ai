import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {afterEach, describe, expect, it} from 'vitest';
import {loadProjectPaths} from './project-paths.js';

const execFileAsync = promisify(execFile);
const directories: string[] = [];

const temporaryDirectory = async (): Promise<string> => {
	const directory = await mkdtemp(join(tmpdir(), 'aven-mentions-'));
	directories.push(directory);
	return directory;
};

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, {recursive: true, force: true})));
});

describe('project path catalog', () => {
	it('walks non-Git projects with nested ignore rules and excludes generated or empty folders', async () => {
		const root = await temporaryDirectory();
		await mkdir(join(root, 'src'), {recursive: true});
		await mkdir(join(root, 'node_modules', 'package'), {recursive: true});
		await mkdir(join(root, 'empty'));
		await writeFile(join(root, '.gitignore'), 'ignored.txt\nbuild/\n');
		await writeFile(join(root, 'visible.txt'), 'visible');
		await writeFile(join(root, 'ignored.txt'), 'ignored');
		await writeFile(join(root, 'src', '.gitignore'), '*.tmp\n!important.tmp\n');
		await writeFile(join(root, 'src', 'app.ts'), 'app');
		await writeFile(join(root, 'src', 'discard.tmp'), 'discard');
		await writeFile(join(root, 'src', 'important.tmp'), 'important');
		await writeFile(join(root, 'node_modules', 'package', 'index.js'), 'generated');

		const entries = await loadProjectPaths(root);
		expect(entries).toEqual(
			expect.arrayContaining([
				{path: '.gitignore', kind: 'file'},
				{path: 'visible.txt', kind: 'file'},
				{path: 'src', kind: 'directory'},
				{path: 'src/.gitignore', kind: 'file'},
				{path: 'src/app.ts', kind: 'file'},
				{path: 'src/important.tmp', kind: 'file'},
			]),
		);
		expect(entries.map((entry) => entry.path)).not.toEqual(
			expect.arrayContaining(['ignored.txt', 'src/discard.tmp', 'node_modules', 'empty']),
		);
	});

	it('uses Git exclude-standard rules while retaining tracked files', async () => {
		const root = await temporaryDirectory();
		await execFileAsync('git', ['init', '--quiet', root]);
		await writeFile(join(root, 'tracked.log'), 'tracked');
		await execFileAsync('git', ['-C', root, 'add', 'tracked.log']);
		await writeFile(join(root, '.gitignore'), '*.log\nignored.tmp\n');
		await writeFile(join(root, 'visible.ts'), 'visible');
		await writeFile(join(root, 'ignored.tmp'), 'ignored');

		const entries = await loadProjectPaths(root);
		expect(entries).toContainEqual({path: 'tracked.log', kind: 'file'});
		expect(entries).toContainEqual({path: 'visible.ts', kind: 'file'});
		expect(entries.map((entry) => entry.path)).not.toContain('ignored.tmp');
	});
});
