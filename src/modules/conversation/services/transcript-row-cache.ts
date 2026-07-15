import type {UiMessage} from '../types.js';
import {completedStreamingLines, messageToRows, shouldSeparateMessages} from './message-rows.js';
import type {TranscriptRow} from '../types.js';

type RowRenderer = (message: UiMessage, width: number, expanded: boolean, streaming: boolean) => TranscriptRow[];

type CacheEntry = {
	message: UiMessage;
	rows: TranscriptRow[];
	streaming: boolean;
	visibleContent: string | undefined;
};

const canReuseStreamingRows = (
	cached: CacheEntry | undefined,
	message: UiMessage,
	visibleContent: string | undefined,
): boolean =>
	Boolean(
		cached?.streaming &&
		cached.message.kind === 'assistant' &&
		message.kind === 'assistant' &&
		cached.message.variant === message.variant &&
		cached.message.timestamp === message.timestamp &&
		cached.visibleContent === visibleContent,
	);

export class TranscriptRowCache {
	readonly #render: RowRenderer;
	readonly #entries = new Map<string, CacheEntry>();
	#width: number | undefined;
	#expanded: boolean | undefined;

	constructor(render: RowRenderer = messageToRows) {
		this.#render = render;
	}

	rowsFor(
		messages: readonly UiMessage[],
		width: number,
		expanded = false,
		streamingAssistantId: string | null = null,
	): TranscriptRow[] {
		if (this.#width !== width || this.#expanded !== expanded) {
			this.#entries.clear();
			this.#width = width;
			this.#expanded = expanded;
		}

		const activeIds = new Set<string>();
		const rows: TranscriptRow[] = [];
		let previous: UiMessage | undefined;
		for (const message of messages) {
			activeIds.add(message.id);
			const cached = this.#entries.get(message.id);
			const streaming = message.kind === 'assistant' && message.id === streamingAssistantId;
			const visibleContent = streaming ? completedStreamingLines(message.content) : undefined;
			const reusable =
				(cached?.message === message && cached.streaming === streaming) ||
				(streaming && canReuseStreamingRows(cached, message, visibleContent));
			const rendered = reusable ? cached!.rows : this.#render(message, width, expanded, streaming);
			this.#entries.set(message.id, {message, rows: rendered, streaming, visibleContent});
			if (rendered.length === 0) continue;
			if (previous && shouldSeparateMessages(previous, message)) {
				rows.push({id: `${message.id}:gap`, messageId: message.id, messageKind: message.kind, segments: [{text: ''}]});
			}
			rows.push(...rendered);
			previous = message;
		}

		for (const id of this.#entries.keys()) {
			if (!activeIds.has(id)) this.#entries.delete(id);
		}
		return rows;
	}
}
