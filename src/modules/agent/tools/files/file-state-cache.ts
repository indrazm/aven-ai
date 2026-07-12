export type FileReadState = {
	content: string;
	fingerprint: string;
	timestamp: number;
	offset?: number;
	limit?: number;
	isPartialView?: boolean;
	totalLines: number;
	readLines: number;
};

type CacheEntry = {
	state: FileReadState;
	bytes: number;
};

export class FileStateCache {
	readonly #maxEntries: number;
	readonly #maxBytes: number;
	readonly #entries = new Map<string, CacheEntry>();
	#bytes = 0;

	constructor(maxEntries = 100, maxBytes = 25 * 1024 * 1024) {
		this.#maxEntries = maxEntries;
		this.#maxBytes = maxBytes;
	}

	get(path: string): FileReadState | undefined {
		const entry = this.#entries.get(path);
		if (!entry) return undefined;
		this.#entries.delete(path);
		this.#entries.set(path, entry);
		return entry.state;
	}

	peek(path: string): FileReadState | undefined {
		return this.#entries.get(path)?.state;
	}

	set(path: string, state: FileReadState): void {
		const existing = this.#entries.get(path);
		if (existing) {
			this.#bytes -= existing.bytes;
			this.#entries.delete(path);
		}
		const bytes = Buffer.byteLength(state.content);
		if (bytes > this.#maxBytes || this.#maxEntries === 0) return;
		this.#entries.set(path, {state, bytes});
		this.#bytes += bytes;
		this.#evict();
	}

	clear(): void {
		this.#entries.clear();
		this.#bytes = 0;
	}

	get size(): number {
		return this.#entries.size;
	}

	get byteSize(): number {
		return this.#bytes;
	}

	#evict(): void {
		while (this.#entries.size > this.#maxEntries || this.#bytes > this.#maxBytes) {
			const oldest = this.#entries.entries().next().value as [string, CacheEntry] | undefined;
			if (!oldest) return;
			this.#entries.delete(oldest[0]);
			this.#bytes -= oldest[1].bytes;
		}
	}
}
