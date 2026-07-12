import type {UiMessage} from '../types.js';
import {messageToRows} from './message-rows.js';
import type {TranscriptRow} from '../types.js';

type RowRenderer = (message: UiMessage, width: number, expanded: boolean) => TranscriptRow[];

type CacheEntry = {
	message: UiMessage;
	rows: TranscriptRow[];
};

export class TranscriptRowCache {
	readonly #render: RowRenderer;
	readonly #entries = new Map<string, CacheEntry>();
	#width: number | undefined;
	#expanded: boolean | undefined;

	constructor(render: RowRenderer = messageToRows) {
		this.#render = render;
	}

	rowsFor(messages: readonly UiMessage[], width: number, expanded = false): TranscriptRow[] {
		if (this.#width !== width || this.#expanded !== expanded) {
			this.#entries.clear();
			this.#width = width;
			this.#expanded = expanded;
		}

		const activeIds = new Set<string>();
		const rows: TranscriptRow[] = [];
		for (const message of messages) {
			activeIds.add(message.id);
			if (rows.length > 0) {
				rows.push({
					id: `${message.id}:gap`,
					messageId: message.id,
					messageKind: message.kind,
					segments: [{text: ''}],
				});
			}
			const cached = this.#entries.get(message.id);
			if (cached?.message === message) {
				rows.push(...cached.rows);
				continue;
			}
			const rendered = this.#render(message, width, expanded);
			this.#entries.set(message.id, {message, rows: rendered});
			rows.push(...rendered);
		}

		for (const id of this.#entries.keys()) {
			if (!activeIds.has(id)) this.#entries.delete(id);
		}
		return rows;
	}
}
