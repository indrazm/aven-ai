import {mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {MAX_MUTATION_BYTES} from './file-tool-operations.js';
import {FileToolService} from './file-tool-service.js';

let directory: string;
let service: FileToolService;
const signal = new AbortController().signal;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'aven-files-'));
	service = new FileToolService();
});

afterEach(async () => {
	service.clear();
	await rm(directory, {recursive: true, force: true});
});

describe('FileToolService Read', () => {
	it('returns compact one-based lines and an unchanged result for the same range', async () => {
		const path = join(directory, 'example.txt');
		await writeFile(path, 'alpha\nbeta\ngamma');

		await expect(service.read({file_path: path, offset: 2, limit: 2}, signal)).resolves.toMatchObject({
			status: 'success',
			content: '2\tbeta\n3\tgamma',
			start_line: 2,
			num_lines: 2,
			total_lines: 3,
			truncated: false,
		});
		await expect(service.read({file_path: path, offset: 2, limit: 2}, signal)).resolves.toMatchObject({
			status: 'unchanged',
			num_lines: 2,
		});
	});

	it('rejects relative paths, directories, binary files, and oversized files as structured errors', async () => {
		const binary = join(directory, 'binary.bin');
		const large = join(directory, 'large.txt');
		await writeFile(binary, Buffer.from([1, 0, 2]));
		await writeFile(large, Buffer.alloc(256 * 1024 + 1, 97));

		await expect(service.read({file_path: 'relative.txt'}, signal)).resolves.toMatchObject({
			status: 'error',
			error: expect.stringContaining('absolute'),
		});
		await expect(service.read({file_path: directory}, signal)).resolves.toMatchObject({
			status: 'error',
			error: expect.stringContaining('regular file'),
		});
		await expect(service.read({file_path: binary}, signal)).resolves.toMatchObject({
			status: 'error',
			error: expect.stringContaining('Binary'),
		});
		await expect(service.read({file_path: large}, signal)).resolves.toMatchObject({
			status: 'error',
			error: expect.stringContaining('256 KiB'),
		});
	});

	it('propagates cancellation instead of converting it into a tool error', async () => {
		const path = join(directory, 'cancelled.txt');
		await writeFile(path, 'text');
		const controller = new AbortController();
		controller.abort(new Error('cancelled'));

		await expect(service.read({file_path: path}, controller.signal)).rejects.toThrow('cancelled');
	});
});

describe('FileToolService Edit', () => {
	it('requires a prior read and requires a unique exact match by default', async () => {
		const path = join(directory, 'edit.txt');
		await writeFile(path, 'same same');

		await expect(service.edit({file_path: path, old_string: 'same', new_string: 'new'}, signal)).resolves.toMatchObject(
			{
				status: 'error',
				error: expect.stringContaining('Read'),
			},
		);
		await service.read({file_path: path}, signal);
		await expect(service.edit({file_path: path, old_string: 'same', new_string: 'new'}, signal)).resolves.toMatchObject(
			{
				status: 'error',
				error: expect.stringContaining('not unique'),
			},
		);
		await expect(
			service.edit({file_path: path, old_string: 'same', new_string: 'new', replace_all: true}, signal),
		).resolves.toMatchObject({
			status: 'success',
			replacements: 2,
		});
		expect(await readFile(path, 'utf8')).toBe('new new');
	});

	it('creates a missing file only with an empty old string and supports an empty existing file', async () => {
		const missing = join(directory, 'nested', 'created.txt');
		await expect(
			service.edit({file_path: missing, old_string: 'missing', new_string: 'value'}, signal),
		).resolves.toMatchObject({status: 'error'});
		const created = await service.edit({file_path: missing, old_string: '', new_string: 'value'}, signal);
		expect(created).toMatchObject({status: 'success', replacements: 1});
		expect(await readFile(missing, 'utf8')).toBe('value');

		const empty = join(directory, 'empty.txt');
		await writeFile(empty, '');
		await service.read({file_path: empty}, signal);
		await expect(service.edit({file_path: empty, old_string: '', new_string: 'filled'}, signal)).resolves.toMatchObject(
			{status: 'success'},
		);
		expect(await readFile(empty, 'utf8')).toBe('filled');
	});

	it('rejects notebooks and stale files but allows a timestamp-only change after a full read', async () => {
		const notebook = join(directory, 'data.ipynb');
		await writeFile(notebook, '{}');
		await expect(
			service.edit({file_path: notebook, old_string: '{}', new_string: '[]'}, signal),
		).resolves.toMatchObject({
			status: 'error',
			error: expect.stringContaining('Notebook'),
		});

		const path = join(directory, 'stale.txt');
		await writeFile(path, 'before');
		await service.read({file_path: path}, signal);
		const future = new Date(Date.now() + 5_000);
		await writeFile(path, 'external');
		await utimes(path, future, future);
		await expect(
			service.edit({file_path: path, old_string: 'before', new_string: 'after'}, signal),
		).resolves.toMatchObject({
			status: 'error',
			error: expect.stringContaining('changed since'),
		});

		await service.read({file_path: path}, signal);
		const later = new Date(future.getTime() + 5_000);
		await utimes(path, later, later);
		await expect(
			service.edit({file_path: path, old_string: 'external', new_string: 'accepted'}, signal),
		).resolves.toMatchObject({status: 'success'});
	});

	it('rejects changed content even when its modification time does not advance', async () => {
		const path = join(directory, 'same-mtime.txt');
		await writeFile(path, 'original');
		await service.read({file_path: path}, signal);
		const originalMetadata = await stat(path);
		await writeFile(path, 'external');
		await utimes(path, originalMetadata.atime, originalMetadata.mtime);

		await expect(
			service.edit({file_path: path, old_string: 'original', new_string: 'changed'}, signal),
		).resolves.toMatchObject({status: 'error', error: expect.stringContaining('changed since')});
		expect(await readFile(path, 'utf8')).toBe('external');
	});

	it('preserves UTF-16LE BOM and CRLF line endings and exposes a transient diff', async () => {
		const path = join(directory, 'encoded.txt');
		const bom = Buffer.from([0xff, 0xfe]);
		await writeFile(path, Buffer.concat([bom, Buffer.from('one\r\ntwo', 'utf16le')]));
		await service.read({file_path: path}, signal);
		const result = await service.edit({file_path: path, old_string: 'one\ntwo', new_string: 'first\nsecond'}, signal);
		expect(result).toMatchObject({status: 'success'});
		if (result.status !== 'success') throw new Error(result.error);
		const bytes = await readFile(path);
		expect(bytes.subarray(0, 2)).toEqual(bom);
		expect(bytes.subarray(2).toString('utf16le')).toBe('first\r\nsecond');
		expect(service.takeMutation(result.operation_id)).toEqual({file: path, before: 'one\ntwo', after: 'first\nsecond'});
		expect(service.takeMutation(result.operation_id)).toBeUndefined();
	});
});

describe('FileToolService Write', () => {
	it('creates parents without a read but requires a read before overwriting', async () => {
		const created = join(directory, 'deep', 'file.txt');
		await expect(service.write({file_path: created, content: 'created'}, signal)).resolves.toMatchObject({
			status: 'success',
			operation: 'create',
		});
		expect(await readFile(created, 'utf8')).toBe('created');

		const existing = join(directory, 'existing.txt');
		await writeFile(existing, 'old');
		await expect(service.write({file_path: existing, content: 'new'}, signal)).resolves.toMatchObject({
			status: 'error',
			error: expect.stringContaining('Read'),
		});
		await service.read({file_path: existing}, signal);
		await expect(service.write({file_path: existing, content: 'new'}, signal)).resolves.toMatchObject({
			status: 'success',
			operation: 'update',
		});
		expect(await readFile(existing, 'utf8')).toBe('new');
	});

	it('preserves an existing encoding and BOM while honoring supplied line endings', async () => {
		const path = join(directory, 'write-encoded.txt');
		await writeFile(path, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('old\r\ntext', 'utf16le')]));
		await service.read({file_path: path}, signal);
		await service.write({file_path: path, content: 'new\ntext'}, signal);

		const bytes = await readFile(path);
		expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]));
		expect(bytes.subarray(2).toString('utf16le')).toBe('new\ntext');
	});

	it('rejects an externally changed file after a partial read', async () => {
		const path = join(directory, 'partial.txt');
		await writeFile(path, 'one\ntwo');
		await service.read({file_path: path, offset: 1, limit: 1}, signal);
		await writeFile(path, 'one\nexternal');
		const metadata = await stat(path);
		const future = new Date(Math.max(Date.now() + 5_000, metadata.mtimeMs + 5_000));
		await utimes(path, future, future);

		await expect(service.write({file_path: path, content: 'replacement'}, signal)).resolves.toMatchObject({
			status: 'error',
			error: expect.stringContaining('changed since'),
		});
	});

	it('does not accept a directory as an existing write target', async () => {
		const path = join(directory, 'folder');
		await mkdir(path);
		await expect(service.write({file_path: path, content: 'no'}, signal)).resolves.toMatchObject({status: 'error'});
	});

	it('rejects output that exceeds the mutation limit before creating a file', async () => {
		const path = join(directory, 'oversized.txt');
		await expect(
			service.write({file_path: path, content: 'x'.repeat(MAX_MUTATION_BYTES + 1)}, signal),
		).resolves.toMatchObject({status: 'error', error: expect.stringContaining('mutation limit')});
		await expect(stat(path)).rejects.toMatchObject({code: 'ENOENT'});
	});
});
