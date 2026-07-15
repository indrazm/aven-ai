import {createHash} from 'node:crypto';
import {lstat, stat} from 'node:fs/promises';
import {isAbsolute, relative, sep} from 'node:path';
import type {EditResult, ReadResult, WriteResult} from './contracts.js';
import {FileToolValidationError} from './file-tool-error.js';
import type {FileReadState, FileStateCache} from './file-state-cache.js';
import type {MutationJournal} from './mutation-journal.js';

export const DEFAULT_READ_LIMIT = 2_000;
export const MAX_READ_BYTES = 256 * 1024;
export const MAX_MODEL_CONTENT = 100_000;
export const MAX_MUTATION_BYTES = 16 * 1024 * 1024;

export type FileToolContext = {
	cache: FileStateCache;
	mutations: MutationJournal;
	projectRoot: string;
};

export const contentFingerprint = (content: string): string => createHash('sha256').update(content).digest('hex');

export const displayPath = (path: string, projectRoot: string): string => {
	if (!isAbsolute(path)) return path.split(sep).join('/');
	const projectRelative = relative(projectRoot, path);
	if (projectRelative === '') return '.';
	if (projectRelative === '..' || projectRelative.startsWith(`..${sep}`) || isAbsolute(projectRelative)) return path;
	return projectRelative.split(sep).join('/');
};

export const throwIfAborted = (signal: AbortSignal): void => {
	if (signal.aborted) throw signal.reason ?? new Error('Aborted');
};

export const fileToolError = (
	tool: 'Read' | 'Edit' | 'Write',
	path: string,
	error: unknown,
	projectRoot: string,
): ReadResult | EditResult | WriteResult => ({
	status: 'error',
	tool,
	file_path: displayPath(path, projectRoot),
	error: error instanceof Error ? error.message : String(error),
});

export const pathExists = async (path: string): Promise<boolean> => {
	try {
		await lstat(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
		throw error;
	}
};

export const assertMutableFile = async (path: string): Promise<void> => {
	const metadata = await lstat(path);
	if (!metadata.isFile() && !metadata.isSymbolicLink()) {
		throw new FileToolValidationError('The path must point to a regular file.');
	}
};

export const assertFreshRead = async (path: string, currentContent: string, cached: FileReadState): Promise<void> => {
	const timestamp = Math.floor((await stat(path)).mtimeMs);
	if (contentFingerprint(currentContent) !== cached.fingerprint) {
		throw new FileToolValidationError('The file changed since it was read. Read it again before editing or writing.');
	}
	if (timestamp > cached.timestamp && cached.isPartialView) {
		throw new FileToolValidationError('The file changed since it was read. Read it again before editing or writing.');
	}
};

export const rememberFullFile = async (context: FileToolContext, path: string, content: string): Promise<void> => {
	const metadata = await stat(path);
	const lineCount = content.split('\n').length;
	context.cache.set(path, {
		content,
		fingerprint: contentFingerprint(content),
		timestamp: Math.floor(metadata.mtimeMs),
		totalLines: lineCount,
		readLines: lineCount,
	});
};

export const assertMutationSize = (buffer: Buffer): void => {
	if (buffer.length > MAX_MUTATION_BYTES) {
		throw new FileToolValidationError(
			`The resulting file exceeds the ${MAX_MUTATION_BYTES / 1024 / 1024} MiB mutation limit.`,
		);
	}
};

export const occurrences = (content: string, search: string): number => {
	if (search === '') return 0;
	let count = 0;
	let index = 0;
	while ((index = content.indexOf(search, index)) !== -1) {
		count += 1;
		index += search.length;
	}
	return count;
};
