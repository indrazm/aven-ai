import {afterEach, describe, expect, it, vi} from 'vitest';
import {MockRuntime} from './mock.js';

describe('MockRuntime', () => {
	afterEach(() => vi.useRealTimers());

	it('delivers the same ordered events expected from a future runtime', async () => {
		vi.useFakeTimers();
		const runtime = new MockRuntime(25);
		const events = runtime.run({id: 'turn', content: 'hello', mode: 'prompt'}, new AbortController().signal);
		const iterator = events[Symbol.asyncIterator]();

		expect((await iterator.next()).value).toMatchObject({type: 'turn.started'});
		expect((await iterator.next()).value).toEqual({type: 'status.changed', status: 'thinking'});
		const response = iterator.next();
		await vi.advanceTimersByTimeAsync(25);
		expect((await response).value).toMatchObject({type: 'message.appended', message: {kind: 'assistant'}});
		expect((await iterator.next()).value).toEqual({type: 'turn.completed', turnId: 'turn'});
	});

	it('honors AbortSignal cancellation', async () => {
		vi.useFakeTimers();
		const runtime = new MockRuntime(100);
		const controller = new AbortController();
		const events = runtime.run({id: 'turn', content: 'hello', mode: 'prompt'}, controller.signal);
		const iterator = events[Symbol.asyncIterator]();
		await iterator.next();
		await iterator.next();
		const pending = iterator.next();
		controller.abort(new Error('cancelled'));
		await expect(pending).rejects.toThrow('cancelled');
	});
});
