import {execFile} from 'node:child_process';
import {readdir, readFile} from 'node:fs/promises';
import {relative, resolve, sep} from 'node:path';
import ignorePackage, {type Ignore, type Options as IgnoreOptions} from 'ignore';
import type {ProjectPathEntry} from '../types.js';

const maxGitOutputBytes = 64 * 1024 * 1024;
const unsafePathPattern = /[\u0000-\u001f\u007f]/u;
const generatedDirectories = new Set([
	'.cache',
	'.git',
	'.lexa',
	'.next',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'target',
	'vendor',
]);

type ScopedIgnore = {base: string; matcher: Ignore};

const createIgnore = (
	typeof ignorePackage === 'function'
		? ignorePackage
		: (ignorePackage as unknown as {default: (options?: IgnoreOptions) => Ignore}).default
) as (options?: IgnoreOptions) => Ignore;

const posixPath = (path: string): string => path.split(sep).join('/');

const gitFiles = (projectRoot: string, signal?: AbortSignal): Promise<string[]> =>
	new Promise((resolveFiles, reject) => {
		execFile(
			'git',
			['-C', projectRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
			{encoding: 'buffer', maxBuffer: maxGitOutputBytes, ...(signal ? {signal} : {})},
			(error, stdout) => {
				if (error) {
					reject(error);
					return;
				}
				const output = Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout);
				resolveFiles(output.split('\0').filter(Boolean));
			},
		);
	});

const ignoredBy = (path: string, directory: boolean, scopes: readonly ScopedIgnore[]): boolean => {
	let ignored = false;
	for (const scope of scopes) {
		const scopedPath = posixPath(relative(scope.base, path));
		if (!scopedPath || scopedPath.startsWith('../')) continue;
		const result = scope.matcher.test(directory ? `${scopedPath}/` : scopedPath);
		if (result.ignored) ignored = true;
		if (result.unignored) ignored = false;
	}
	return ignored;
};

const fallbackFiles = async (projectRoot: string, signal?: AbortSignal): Promise<string[]> => {
	const files: string[] = [];
	const visit = async (directory: string, inheritedScopes: readonly ScopedIgnore[]): Promise<void> => {
		signal?.throwIfAborted();
		const entries = await readdir(directory, {withFileTypes: true});
		let scopes = inheritedScopes;
		const ignoreFile = entries.find((entry) => entry.isFile() && entry.name === '.gitignore');
		if (ignoreFile) {
			const rules = await readFile(resolve(directory, ignoreFile.name), 'utf8');
			scopes = [...inheritedScopes, {base: directory, matcher: createIgnore().add(rules)}];
		}

		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			signal?.throwIfAborted();
			const path = resolve(directory, entry.name);
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) {
				if (generatedDirectories.has(entry.name) || ignoredBy(path, true, scopes)) continue;
				await visit(path, scopes);
				continue;
			}
			if (entry.isFile() && !ignoredBy(path, false, scopes)) files.push(posixPath(relative(projectRoot, path)));
		}
	};
	await visit(projectRoot, []);
	return files;
};

const entriesFromFiles = (files: readonly string[]): ProjectPathEntry[] => {
	const safeFiles = new Set(
		files
			.map((path) => path.replace(/^\.\//u, '').replaceAll('\\', '/'))
			.filter((path) => path && !path.startsWith('/') && !path.startsWith('../') && !unsafePathPattern.test(path)),
	);
	const directories = new Set<string>();
	for (const file of safeFiles) {
		const segments = file.split('/');
		for (let depth = 1; depth < segments.length; depth++) directories.add(segments.slice(0, depth).join('/'));
	}
	return [
		...[...directories].map((path): ProjectPathEntry => ({path, kind: 'directory'})),
		...[...safeFiles].map((path): ProjectPathEntry => ({path, kind: 'file'})),
	].sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind));
};

export const loadProjectPaths = async (projectRoot: string, signal?: AbortSignal): Promise<ProjectPathEntry[]> => {
	signal?.throwIfAborted();
	let files: string[];
	try {
		files = await gitFiles(projectRoot, signal);
	} catch (error) {
		if (signal?.aborted) throw error;
		files = await fallbackFiles(projectRoot, signal);
	}
	signal?.throwIfAborted();
	return entriesFromFiles(files);
};
