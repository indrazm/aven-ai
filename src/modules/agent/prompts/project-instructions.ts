import {open, readdir} from 'node:fs/promises';
import {relative, resolve, sep} from 'node:path';
import {StringDecoder} from 'node:string_decoder';

export type ProjectInstruction = {
	path: string;
	scope: string;
	content: string;
	truncated: boolean;
};

export type ProjectInstructionBundle = {
	files: ProjectInstruction[];
	omittedPaths: string[];
	warnings: string[];
};

export type ProjectInstructionLimits = {
	maxFiles: number;
	maxFileBytes: number;
	maxTotalBytes: number;
};

export const defaultProjectInstructionLimits: ProjectInstructionLimits = {
	maxFiles: 32,
	maxFileBytes: 16 * 1024,
	maxTotalBytes: 64 * 1024,
};

const maxReportedOmittedPaths = 32;

const ignoredDirectories = new Set([
	'.cache',
	'.git',
	'.next',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'target',
	'vendor',
]);

const displayPath = (projectRoot: string, path: string): string => {
	const value = relative(projectRoot, path).split(sep).join('/');
	return value || 'AGENTS.md';
};

const instructionScope = (path: string): string => {
	const parts = path.split('/');
	parts.pop();
	return parts.length === 0 ? '.' : parts.join('/');
};

const pathDepth = (path: string): number => path.split('/').length;

const positiveLimit = (value: number, fallback: number): number =>
	Number.isSafeInteger(value) && value > 0 ? value : fallback;

const resolveLimits = (limits: Partial<ProjectInstructionLimits>): ProjectInstructionLimits => ({
	maxFiles: positiveLimit(limits.maxFiles ?? 0, defaultProjectInstructionLimits.maxFiles),
	maxFileBytes: positiveLimit(limits.maxFileBytes ?? 0, defaultProjectInstructionLimits.maxFileBytes),
	maxTotalBytes: positiveLimit(limits.maxTotalBytes ?? 0, defaultProjectInstructionLimits.maxTotalBytes),
});

const utf8Prefix = (buffer: Buffer, maximum: number): string => {
	const decoder = new StringDecoder('utf8');
	return decoder.write(buffer.subarray(0, maximum));
};

const readPrefix = async (path: string, maximum: number): Promise<{content: string; truncated: boolean}> => {
	const handle = await open(path, 'r');
	try {
		const buffer = Buffer.alloc(maximum + 1);
		const {bytesRead} = await handle.read(buffer, 0, buffer.length, 0);
		const truncated = bytesRead > maximum;
		return {
			content: truncated ? utf8Prefix(buffer, maximum) : buffer.subarray(0, bytesRead).toString('utf8'),
			truncated,
		};
	} finally {
		await handle.close();
	}
};

const discoverInstructionPaths = async (
	projectRoot: string,
	warnings: string[],
): Promise<Array<{absolute: string; display: string}>> => {
	const discovered: Array<{absolute: string; display: string}> = [];
	const visit = async (directory: string): Promise<void> => {
		let entries;
		try {
			entries = await readdir(directory, {withFileTypes: true});
		} catch (error) {
			warnings.push(
				`Could not inspect ${displayPath(projectRoot, directory)}: ${error instanceof Error ? error.message : String(error)}`,
			);
			return;
		}

		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			if (entry.isSymbolicLink()) continue;
			const path = resolve(directory, entry.name);
			if (entry.isDirectory()) {
				if (!ignoredDirectories.has(entry.name)) await visit(path);
				continue;
			}
			if (entry.isFile() && entry.name === 'AGENTS.md') {
				discovered.push({absolute: path, display: displayPath(projectRoot, path)});
			}
		}
	};

	await visit(projectRoot);
	return discovered.sort(
		(left, right) => pathDepth(left.display) - pathDepth(right.display) || left.display.localeCompare(right.display),
	);
};

export const loadProjectInstructions = async (
	projectRoot: string,
	overrides: Partial<ProjectInstructionLimits> = {},
): Promise<ProjectInstructionBundle> => {
	const limits = resolveLimits(overrides);
	const warnings: string[] = [];
	const candidates = await discoverInstructionPaths(projectRoot, warnings);
	const files: ProjectInstruction[] = [];
	const omittedPaths: string[] = [];
	let totalBytes = 0;

	for (const [index, candidate] of candidates.entries()) {
		if (files.length >= limits.maxFiles || totalBytes >= limits.maxTotalBytes) {
			const omittedCandidates = candidates.slice(index);
			omittedPaths.push(...omittedCandidates.slice(0, maxReportedOmittedPaths).map((item) => item.display));
			const additionalCount = omittedCandidates.length - omittedPaths.length;
			if (additionalCount > 0) {
				warnings.push(`${additionalCount} additional AGENTS.md files were omitted from the prompt.`);
			}
			break;
		}

		try {
			const remaining = limits.maxTotalBytes - totalBytes;
			const maximum = Math.min(limits.maxFileBytes, remaining);
			const result = await readPrefix(candidate.absolute, maximum);
			const contentBytes = Buffer.byteLength(result.content);
			files.push({
				path: candidate.display,
				scope: instructionScope(candidate.display),
				content: result.content,
				truncated: result.truncated,
			});
			totalBytes += contentBytes;
		} catch (error) {
			warnings.push(`Could not read ${candidate.display}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return {files, omittedPaths, warnings};
};
