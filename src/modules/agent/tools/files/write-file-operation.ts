import {dirname} from 'node:path';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import type {WriteInput, WriteResult} from './contracts.js';
import {FileToolValidationError} from './file-tool-error.js';
import {validatedPath} from './file-path-safety.js';
import {
	assertFreshRead,
	assertMutableFile,
	assertMutationSize,
	displayPath,
	fileToolError,
	type FileToolContext,
	MAX_MUTATION_BYTES,
	pathExists,
	rememberFullFile,
	throwIfAborted,
} from './file-tool-operations.js';
import {decodeText, encodeText, normalizedContent, type TextEncoding} from './text-file-codec.js';

export const writeFileOperation = async (
	context: FileToolContext,
	input: WriteInput,
	signal: AbortSignal,
): Promise<WriteResult> => {
	let path = input.file_path;
	try {
		path = validatedPath(input.file_path);
		throwIfAborted(signal);
		await mkdir(dirname(path), {recursive: true});
		const exists = await pathExists(path);
		let before = '';
		let encoding: TextEncoding = 'utf8';
		let bom = false;
		if (exists) {
			const cached = context.cache.get(path);
			if (!cached) throw new FileToolValidationError('Read the existing file before overwriting it.');
			await assertMutableFile(path);
			const buffer = await readFile(path, {signal});
			if (buffer.length > MAX_MUTATION_BYTES)
				throw new FileToolValidationError('The file is too large to write safely.');
			const decoded = decodeText(buffer);
			before = normalizedContent(decoded.content);
			encoding = decoded.encoding;
			bom = decoded.bom;
			await assertFreshRead(path, before, cached);
		}
		throwIfAborted(signal);
		const encoded = encodeText(input.content, encoding, bom);
		assertMutationSize(encoded);
		try {
			await writeFile(path, encoded, exists ? {signal} : {flag: 'wx', signal});
		} catch (error) {
			if (!exists && (error as NodeJS.ErrnoException).code === 'EEXIST') {
				throw new FileToolValidationError('The file changed before Write could create it. Read it and retry.');
			}
			throw error;
		}
		const after = normalizedContent(input.content);
		await rememberFullFile(context, path, after);
		const operationId = context.mutations.record({file: path, before, after});
		return {
			status: 'success',
			tool: 'Write',
			file_path: displayPath(path),
			operation: exists ? 'update' : 'create',
			operation_id: operationId,
			message: exists ? 'Updated file.' : 'Created file.',
		};
	} catch (error) {
		if (signal.aborted) throw signal.reason ?? error;
		return fileToolError('Write', path, error) as WriteResult;
	}
};
