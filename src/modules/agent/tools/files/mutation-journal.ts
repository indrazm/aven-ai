import {randomUUID} from 'node:crypto';

const MAX_MUTATIONS = 100;

export type FileMutation = {
	file: string;
	before: string;
	after: string;
};

export class MutationJournal {
	readonly #mutations = new Map<string, FileMutation>();

	record(mutation: FileMutation): string {
		const operationId = randomUUID();
		this.#mutations.set(operationId, mutation);
		while (this.#mutations.size > MAX_MUTATIONS) {
			const oldest = this.#mutations.keys().next().value as string | undefined;
			if (!oldest) break;
			this.#mutations.delete(oldest);
		}
		return operationId;
	}

	take(operationId: string): FileMutation | undefined {
		const mutation = this.#mutations.get(operationId);
		this.#mutations.delete(operationId);
		return mutation;
	}

	clear(): void {
		this.#mutations.clear();
	}
}
