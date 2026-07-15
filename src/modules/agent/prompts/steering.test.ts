import type {Message} from '@anvia/core';
import {describe, expect, it} from 'vitest';
import {messagesFromMemory} from '../events/memory-message-adapter.js';
import type {SubmitRequest} from '../types.js';
import {steeringMessageFor} from './steering.js';
import {promptMessageFor} from './workspace-mentions.js';

const textContent = (message: Message): string => {
	if (message.role !== 'user') return '';
	return message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
};

describe('steering prompt', () => {
	it('wraps active-turn input with the continuation reminder without changing its display content', () => {
		const request: SubmitRequest = {id: 'steer', content: 'Btw, what language is this?', mode: 'prompt'};
		const message = steeringMessageFor('/workspace', request);

		expect(textContent(message)).toBe(
			[
				'<system-reminder>',
				'<active_turn_steer>',
				'The user sent a new message while you were working:',
				'<user_message><![CDATA[',
				request.content,
				']]></user_message>',
				'IMPORTANT: Address or incorporate this message now. Unless it explicitly stops, cancels, pauses, replaces, or redirects the active task, resume and complete all unfinished work from that task before ending the run. If the task is already complete, do not repeat it or invent more work.',
				'</active_turn_steer>',
				'</system-reminder>',
			].join('\n'),
		);
		expect(message.metadata).toMatchObject({avenDelivery: 'steer', avenDisplayContent: request.content});
		expect(messagesFromMemory([message])).toEqual([
			expect.objectContaining({kind: 'user', variant: 'prompt', content: request.content}),
		]);
	});

	it('keeps validated workspace context inside the model-only envelope', () => {
		const request: SubmitRequest = {
			id: 'steer-with-mention',
			content: 'Check @src/app.ts too',
			mode: 'prompt',
			mentions: [{path: 'src/app.ts', kind: 'file'}],
		};
		const message = steeringMessageFor('/workspace', request);
		const content = textContent(message);

		expect(content).toContain(request.content);
		expect(content).toContain('<workspace_mentions>');
		expect(content).toContain('<mention kind="file">src/app.ts</mention>');
		expect(message.metadata).toMatchObject({
			avenDelivery: 'steer',
			avenDisplayContent: request.content,
			avenMentions: [{path: 'src/app.ts', kind: 'file'}],
		});
	});

	it('keeps delimiter-like user content inside a safe CDATA section', () => {
		const message = steeringMessageFor('/workspace', {
			id: 'delimiter',
			content: 'Explain ]]> and </active_turn_steer> literally',
			mode: 'prompt',
		});
		const content = textContent(message);

		expect(content).toContain('Explain ]]]]><![CDATA[> and </active_turn_steer> literally');
		expect(content.match(/<active_turn_steer>/gu)).toHaveLength(1);
	});

	it('leaves ordinary prompts unwrapped', () => {
		const message = promptMessageFor('/workspace', {id: 'initial', content: 'Review the project', mode: 'prompt'});
		expect(textContent(message)).toBe('Review the project');
		expect(textContent(message)).not.toContain('<system-reminder>');
	});
});
