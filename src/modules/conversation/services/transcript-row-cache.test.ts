import {describe, expect, it, vi} from 'vitest';
import type {UiMessage} from '../types.js';
import {messageToRows} from './message-rows.js';
import {TranscriptRowCache} from './transcript-row-cache.js';

const messages: UiMessage[] = [
	{id: 'one', kind: 'assistant', variant: 'text', content: 'one'},
	{id: 'two', kind: 'assistant', variant: 'text', content: 'two'},
];

describe('TranscriptRowCache', () => {
	it('reuses unchanged messages and invalidates changed messages or widths', () => {
		const render = vi.fn(messageToRows);
		const cache = new TranscriptRowCache(render);
		const initial = cache.rowsFor(messages, 80);
		expect(render).toHaveBeenCalledTimes(2);

		expect(cache.rowsFor(messages, 80)).toEqual(initial);
		expect(render).toHaveBeenCalledTimes(2);

		const changed = [messages[0]!, {...messages[1]!, content: 'updated'}];
		cache.rowsFor(changed, 80);
		expect(render).toHaveBeenCalledTimes(3);

		cache.rowsFor(changed, 60);
		expect(render).toHaveBeenCalledTimes(5);

		cache.rowsFor(changed, 60, true);
		expect(render).toHaveBeenCalledTimes(7);

		cache.rowsFor(changed, 60, true);
		expect(render).toHaveBeenCalledTimes(7);
	});
});
