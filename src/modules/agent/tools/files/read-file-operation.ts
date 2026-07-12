import {readFile, stat} from 'node:fs/promises';
import type {ReadInput, ReadResult} from './contracts.js';
import {decodeText, normalizedContent} from './text-file-codec.js';
import {FileToolValidationError} from './file-tool-error.js';
import {validatedPath} from './file-path-safety.js';
import {
	contentFingerprint,
	DEFAULT_READ_LIMIT,
	displayPath,
	fileToolError,
	type FileToolContext,
	MAX_MODEL_CONTENT,
	MAX_READ_BYTES,
	throwIfAborted,
} from './file-tool-operations.js';

export const readFileOperation = async (
	context: FileToolContext,
	input: ReadInput,
	signal: AbortSignal,
): Promise<ReadResult> => {
	let path = input.file_path;
	try {
		path = validatedPath(input.file_path);
		throwIfAborted(signal);
		const metadata = await stat(path);
		if (!metadata.isFile()) throw new FileToolValidationError('The path must point to a regular file.');
		if (metadata.size > MAX_READ_BYTES) {
			throw new FileToolValidationError(`The file exceeds the ${MAX_READ_BYTES / 1024} KiB Read limit.`);
		}
		const decoded = decodeText(await readFile(path, {signal}));
		throwIfAborted(signal);
		const normalized = normalizedContent(decoded.content);
		const fingerprint = contentFingerprint(normalized);
		const startLine = input.offset ?? 1;
		const limit = input.limit ?? DEFAULT_READ_LIMIT;
		const timestamp = Math.floor((await stat(path)).mtimeMs);
		const cached = context.cache.peek(path);
		if (
			cached &&
			cached.timestamp === timestamp &&
			cached.fingerprint === fingerprint &&
			cached.offset === input.offset &&
			cached.limit === input.limit
		) {
			return {
				status: 'unchanged',
				tool: 'Read',
				file_path: displayPath(path),
				start_line: startLine,
				num_lines: cached.readLines,
				total_lines: cached.totalLines,
				message: 'File contents are unchanged since the previous read of this range.',
			};
		}
		const lines = normalized.split('\n');
		const selected = lines.slice(startLine - 1, startLine - 1 + limit);
		const formatted: string[] = [];
		const cachedLines: string[] = [];
		let characters = 0;
		let outputCapped = false;
		for (const [index, line] of selected.entries()) {
			const outputLine = `${startLine + index}\t${line}`;
			const addition = outputLine.length + (formatted.length === 0 ? 0 : 1);
			if (characters + addition > MAX_MODEL_CONTENT) {
				outputCapped = true;
				break;
			}
			formatted.push(outputLine);
			cachedLines.push(line);
			characters += addition;
		}
		if (selected.length > 0 && formatted.length === 0) {
			const prefix = `${startLine}\t`;
			const visible = selected[0]?.slice(0, Math.max(0, MAX_MODEL_CONTENT - prefix.length)) ?? '';
			formatted.push(prefix + visible);
			cachedLines.push(visible);
			outputCapped = visible.length < (selected[0]?.length ?? 0);
		}
		const isPartialView = outputCapped || startLine !== 1 || cachedLines.length < lines.length;
		context.cache.set(path, {
			content: isPartialView ? cachedLines.join('\n') : normalized,
			fingerprint,
			timestamp,
			...(input.offset === undefined ? {} : {offset: input.offset}),
			...(input.limit === undefined ? {} : {limit: input.limit}),
			...(isPartialView ? {isPartialView: true} : {}),
			totalLines: lines.length,
			readLines: cachedLines.length,
		});
		return {
			status: 'success',
			tool: 'Read',
			file_path: displayPath(path),
			content: formatted.join('\n'),
			start_line: startLine,
			num_lines: cachedLines.length,
			total_lines: lines.length,
			truncated: outputCapped,
		};
	} catch (error) {
		if (signal.aborted) throw signal.reason ?? error;
		return fileToolError('Read', path, error) as ReadResult;
	}
};
