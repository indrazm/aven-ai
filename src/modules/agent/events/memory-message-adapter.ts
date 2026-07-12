import type {Message} from '@anvia/core';
import type {UiMessage} from '../../conversation/index.js';
import {summaryFromArguments, toolMessageFromSerializedResult} from './tool-message-adapter.js';

export const messagesFromMemory = (messages: Message[]): UiMessage[] => {
	const output: UiMessage[] = [];
	const calls = new Map<string, {name: string; summary: string}>();
	for (const [messageIndex, message] of messages.entries()) {
		if (message.role === 'user') {
			const text = message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
			if (text)
				output.push({
					id: `history-user-${messageIndex}`,
					kind: 'user',
					variant: isBashMemoryMessage(message.metadata) ? 'bash' : 'prompt',
					content: text,
				});
			continue;
		}
		if (message.role === 'assistant') {
			const text = message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
			if (text)
				output.push({id: `history-assistant-${messageIndex}`, kind: 'assistant', variant: 'text', content: text});
			for (const part of message.content) {
				if (part.type !== 'tool_call') continue;
				const name = part.function.name;
				const call = {name, summary: summaryFromArguments(name, part.function.arguments)};
				calls.set(part.id, call);
				if (part.callId) calls.set(part.callId, call);
			}
			continue;
		}
		if (message.role === 'tool') {
			for (const [partIndex, part] of message.content.entries()) {
				const text = part.content.flatMap((item) => (item.type === 'text' ? [item.text] : [])).join('\n');
				const call = calls.get(part.id) ?? (part.callId ? calls.get(part.callId) : undefined);
				const name = part.toolName ?? call?.name ?? 'ExecCommand';
				output.push(
					toolMessageFromSerializedResult(
						`history-tool-${messageIndex}-${partIndex}`,
						name,
						text,
						call?.summary ?? 'Completed',
					),
				);
			}
		}
	}
	return output;
};

const isBashMemoryMessage = (metadata: unknown): boolean =>
	typeof metadata === 'object' &&
	metadata !== null &&
	!Array.isArray(metadata) &&
	'avenMode' in metadata &&
	metadata.avenMode === 'bash';
