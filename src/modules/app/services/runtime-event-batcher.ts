import type {RuntimeEvent} from '../../agent/index.js';

type AssistantDelta = Extract<RuntimeEvent, {type: 'assistant.delta'}>;

/**
 * Coalesces adjacent text deltas to the terminal's paint cadence.
 * Non-delta events remain synchronous and preserve their order.
 */
export class RuntimeEventBatcher {
	readonly #dispatch: (event: RuntimeEvent) => void;
	readonly #frameMs: number;
	#pending: AssistantDelta | undefined;
	#timer: ReturnType<typeof setTimeout> | undefined;

	constructor(dispatch: (event: RuntimeEvent) => void, frameMs = 34) {
		this.#dispatch = dispatch;
		this.#frameMs = frameMs;
	}

	push(event: RuntimeEvent): void {
		if (event.type !== 'assistant.delta') {
			this.flush();
			this.#dispatch(event);
			return;
		}

		if (this.#pending && this.#pending.messageId !== event.messageId) this.flush();
		this.#pending = this.#pending ? {...this.#pending, delta: this.#pending.delta + event.delta} : event;
		this.#timer ??= setTimeout(() => this.flush(), this.#frameMs);
	}

	flush(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = undefined;
		const pending = this.#pending;
		this.#pending = undefined;
		if (pending) this.#dispatch(pending);
	}

	discard(): void {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = undefined;
		this.#pending = undefined;
	}
}
