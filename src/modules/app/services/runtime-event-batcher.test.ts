import {afterEach, describe, expect, it, vi} from 'vitest';
import type {RuntimeEvent} from '../../agent/index.js';
import {RuntimeEventBatcher} from './runtime-event-batcher.js';

describe('RuntimeEventBatcher', () => {
	afterEach(() => vi.useRealTimers());

	it('coalesces adjacent assistant deltas once per frame', () => {
		vi.useFakeTimers();
		const events: RuntimeEvent[] = [];
		const batcher = new RuntimeEventBatcher((event) => events.push(event), 32);

		batcher.push({type: 'assistant.delta', messageId: 'assistant-1', delta: 'one'});
		batcher.push({type: 'assistant.delta', messageId: 'assistant-1', delta: ' two'});
		expect(events).toEqual([]);

		vi.advanceTimersByTime(32);
		expect(events).toEqual([{type: 'assistant.delta', messageId: 'assistant-1', delta: 'one two'}]);
	});

	it('flushes text before an ordered lifecycle event', () => {
		const events: RuntimeEvent[] = [];
		const batcher = new RuntimeEventBatcher((event) => events.push(event));

		batcher.push({type: 'assistant.delta', messageId: 'assistant-1', delta: 'done'});
		batcher.push({type: 'turn.completed', turnId: 'turn-1'});

		expect(events).toEqual([
			{type: 'assistant.delta', messageId: 'assistant-1', delta: 'done'},
			{type: 'turn.completed', turnId: 'turn-1'},
		]);
	});

	it('does not merge deltas from different assistant messages', () => {
		const events: RuntimeEvent[] = [];
		const batcher = new RuntimeEventBatcher((event) => events.push(event));

		batcher.push({type: 'assistant.delta', messageId: 'assistant-1', delta: 'first'});
		batcher.push({type: 'assistant.delta', messageId: 'assistant-2', delta: 'second'});
		batcher.flush();

		expect(events).toEqual([
			{type: 'assistant.delta', messageId: 'assistant-1', delta: 'first'},
			{type: 'assistant.delta', messageId: 'assistant-2', delta: 'second'},
		]);
	});

	it('discards a queued frame after cancellation', () => {
		vi.useFakeTimers();
		const events: RuntimeEvent[] = [];
		const batcher = new RuntimeEventBatcher((event) => events.push(event));
		batcher.push({type: 'assistant.delta', messageId: 'assistant-1', delta: 'stale'});

		batcher.discard();
		vi.runAllTimers();

		expect(events).toEqual([]);
	});
});
