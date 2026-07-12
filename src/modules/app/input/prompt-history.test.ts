import {describe, expect, it} from 'vitest';
import type {UiMessage} from '../../conversation/index.js';
import {promptHistoryFromMessages} from './prompt-history.js';

describe('promptHistoryFromMessages', () => {
	it('returns unique prompts from newest to oldest', () => {
		const messages: UiMessage[] = [
			{id: 'one', kind: 'user', variant: 'prompt', content: 'first'},
			{id: 'bash', kind: 'user', variant: 'bash', content: 'pwd'},
			{id: 'two', kind: 'user', variant: 'prompt', content: 'second'},
			{id: 'three', kind: 'user', variant: 'prompt', content: 'first'},
		];
		expect(promptHistoryFromMessages(messages)).toEqual(['first', 'second']);
	});
});
