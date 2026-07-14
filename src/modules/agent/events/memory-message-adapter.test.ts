import {Message} from '@anvia/core';
import {describe, expect, it} from 'vitest';
import {messagesFromMemory} from './memory-message-adapter.js';

describe('memory message adapter', () => {
	it('restores the visible prompt instead of internal mention context', () => {
		const prompt = 'Review @src/app.ts';
		const message = Message.user(`${prompt}\n\n<workspace_mentions>internal</workspace_mentions>`, {
			metadata: {avenDisplayContent: prompt},
		});
		expect(messagesFromMemory([message])).toContainEqual(
			expect.objectContaining({kind: 'user', variant: 'prompt', content: prompt}),
		);
	});
});
