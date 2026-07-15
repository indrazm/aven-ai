import {Message} from '@anvia/core';
import type {SubmitRequest} from '../types.js';
import {promptMessageFor} from './workspace-mentions.js';

export const steeringInstructions: readonly string[] = [
	'An active_turn_steer block nested inside a system-reminder block contains user input sent while the current run was active. Treat it as an interjection or update to the active objective, not a replacement by default.',
	'Address or incorporate the steer immediately, then continue the unfinished active objective in the same run without waiting for another user message.',
	'If the steer explicitly asks to stop, cancel, or pause, stop. If it explicitly replaces or redirects the active objective, follow the new objective and do not resume superseded work.',
	'If the active objective is already genuinely complete, address the steer without repeating finished steps or inventing additional work.',
];

const textContent = (message: Message): string => {
	if (message.role !== 'user') return '';
	return message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
};

const cdata = (value: string): string => value.replaceAll(']]>', ']]]]><![CDATA[>');

const steeringEnvelope = (content: string): string =>
	[
		'<system-reminder>',
		'<active_turn_steer>',
		'The user sent a new message while you were working:',
		'<user_message><![CDATA[',
		cdata(content),
		']]></user_message>',
		'IMPORTANT: Address or incorporate this message now. Unless it explicitly stops, cancels, pauses, replaces, or redirects the active task, resume and complete all unfinished work from that task before ending the run. If the task is already complete, do not repeat it or invent more work.',
		'</active_turn_steer>',
		'</system-reminder>',
	].join('\n');

export const steeringMessageFor = (projectRoot: string, request: SubmitRequest): Message => {
	const prompt = promptMessageFor(projectRoot, request);
	const metadata =
		typeof prompt.metadata === 'object' && prompt.metadata !== null && !Array.isArray(prompt.metadata)
			? prompt.metadata
			: {};
	return Message.user(steeringEnvelope(textContent(prompt)), {
		metadata: {
			...metadata,
			avenDelivery: 'steer',
			avenDisplayContent: request.content,
		},
	});
};
