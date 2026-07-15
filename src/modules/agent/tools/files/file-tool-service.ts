import type {EditInput, EditResult, ReadInput, ReadResult, WriteInput, WriteResult} from './contracts.js';
import {editFileOperation} from './edit-file-operation.js';
import {FileStateCache} from './file-state-cache.js';
import type {FileToolContext} from './file-tool-operations.js';
import {MutationJournal, type FileMutation} from './mutation-journal.js';
import {readFileOperation} from './read-file-operation.js';
import {writeFileOperation} from './write-file-operation.js';

export type {FileMutation} from './mutation-journal.js';

export class FileToolService {
	readonly #context: FileToolContext;

	constructor(projectRoot: string, cache = new FileStateCache(), mutations = new MutationJournal()) {
		this.#context = {cache, mutations, projectRoot};
	}

	read(input: ReadInput, signal: AbortSignal): Promise<ReadResult> {
		return readFileOperation(this.#context, input, signal);
	}

	edit(input: EditInput, signal: AbortSignal): Promise<EditResult> {
		return editFileOperation(this.#context, input, signal);
	}

	write(input: WriteInput, signal: AbortSignal): Promise<WriteResult> {
		return writeFileOperation(this.#context, input, signal);
	}

	takeMutation(operationId: string): FileMutation | undefined {
		return this.#context.mutations.take(operationId);
	}

	clear(): void {
		this.#context.cache.clear();
		this.#context.mutations.clear();
	}
}
