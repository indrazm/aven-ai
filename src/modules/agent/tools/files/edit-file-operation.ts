import {dirname} from 'node:path';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import type {EditInput, EditResult} from './contracts.js';
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
	occurrences,
	pathExists,
	rememberFullFile,
	throwIfAborted,
} from './file-tool-operations.js';
import {decodeText, encodeText, normalizedContent, withLineEnding} from './text-file-codec.js';

export const editFileOperation = async (
	context: FileToolContext,
	input: EditInput,
	signal: AbortSignal,
): Promise<EditResult> => {
	let path = input.file_path;
	try {
		path = validatedPath(input.file_path);
		if (path.toLowerCase().endsWith('.ipynb')) {
			throw new FileToolValidationError('Notebook files are not supported by Edit.');
		}
		if (input.old_string === input.new_string) {
			throw new FileToolValidationError('old_string and new_string must be different.');
		}
		throwIfAborted(signal);
		const exists = await pathExists(path);
		if (!exists) return await createWithEdit(context, path, input, signal);

		const cached = context.cache.get(path);
		if (!cached) throw new FileToolValidationError('Read the existing file before editing it.');
		await assertMutableFile(path);
		const buffer = await readFile(path, {signal});
		if (buffer.length > MAX_MUTATION_BYTES) throw new FileToolValidationError('The file is too large to edit safely.');
		const decoded = decodeText(buffer);
		const before = normalizedContent(decoded.content);
		await assertFreshRead(path, before, cached);
		const oldString = normalizedContent(input.old_string);
		const newString = normalizedContent(input.new_string);
		if (oldString === newString) {
			throw new FileToolValidationError('old_string and new_string must be different after line-ending normalization.');
		}
		const matchCount = before === '' && oldString === '' ? 1 : occurrences(before, oldString);
		if (matchCount === 0) throw new FileToolValidationError('old_string was not found in the file.');
		if (!input.replace_all && matchCount > 1) {
			throw new FileToolValidationError('old_string is not unique. Provide more context or set replace_all to true.');
		}
		const after =
			oldString === ''
				? newString
				: input.replace_all
					? before.split(oldString).join(newString)
					: before.replace(oldString, newString);
		throwIfAborted(signal);
		const encoded = encodeText(withLineEnding(after, decoded.lineEnding), decoded.encoding, decoded.bom);
		assertMutationSize(encoded);
		await writeFile(path, encoded, {signal});
		await rememberFullFile(context, path, after);
		const operationId = context.mutations.record({file: path, before, after});
		const replacements = input.replace_all ? matchCount : 1;
		return {
			status: 'success',
			tool: 'Edit',
			file_path: displayPath(path),
			replacements,
			operation_id: operationId,
			message: `Replaced ${replacements} occurrence${replacements === 1 ? '' : 's'}.`,
		};
	} catch (error) {
		if (signal.aborted) throw signal.reason ?? error;
		return fileToolError('Edit', path, error) as EditResult;
	}
};

const createWithEdit = async (
	context: FileToolContext,
	path: string,
	input: EditInput,
	signal: AbortSignal,
): Promise<EditResult> => {
	if (input.old_string !== '') {
		throw new FileToolValidationError('The file does not exist. Use an empty old_string to create it.');
	}
	await mkdir(dirname(path), {recursive: true});
	throwIfAborted(signal);
	const encoded = Buffer.from(input.new_string, 'utf8');
	assertMutationSize(encoded);
	try {
		await writeFile(path, encoded, {flag: 'wx', signal});
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
			throw new FileToolValidationError('The file changed before Edit could create it. Read it and retry.');
		}
		throw error;
	}
	const after = normalizedContent(input.new_string);
	await rememberFullFile(context, path, after);
	const operationId = context.mutations.record({file: path, before: '', after});
	return {
		status: 'success',
		tool: 'Edit',
		file_path: displayPath(path),
		replacements: 1,
		operation_id: operationId,
		message: 'Created file with Edit.',
	};
};
