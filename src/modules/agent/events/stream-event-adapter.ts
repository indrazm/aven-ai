import type {AgentStreamEvent} from '@anvia/core';
import type {ToolMessage} from '../../conversation/index.js';
import type {RuntimeEvent} from '../types.js';
import type {FileMutation} from '../tools/files/file-tool-service.js';
import {
	groupForTool,
	parseFileResult,
	summaryFromArguments,
	summaryFromSerializedArguments,
	toolMessageFromSerializedResult,
} from './tool-message-adapter.js';

export type PendingToolCall = {
	id: string;
	callId: string;
	name: string;
	summary: string;
	group: NonNullable<ToolMessage['group']>;
};

export type MutationSource = {
	takeMutation(operationId: string): FileMutation | undefined;
};

export const eventToRuntimeEvents = (
	event: AgentStreamEvent,
	requestId: string,
	assistantId: string,
	toolQueue: PendingToolCall[],
	assistantText: string,
	mutationSource?: MutationSource,
): RuntimeEvent[] => {
	switch (event.type) {
		case 'turn_start':
			return [{type: 'status.changed', status: 'thinking'}];
		case 'text_delta':
			return [{type: 'assistant.delta', messageId: assistantId, delta: event.delta}];
		case 'tool_call': {
			const name = event.toolCall.function.name;
			const pending: PendingToolCall = {
				id: `tool-${requestId}-${event.toolCall.id}`,
				callId: event.toolCall.callId ?? event.toolCall.id,
				name,
				summary: summaryFromArguments(name, event.toolCall.function.arguments),
				group: groupForTool(name),
			};
			toolQueue.push(pending);
			return [
				{type: 'status.changed', status: 'runningTool'},
				{
					type: 'message.appended',
					message: {
						id: pending.id,
						kind: 'tool',
						name,
						status: 'running',
						summary: pending.summary,
						group: pending.group,
					},
				},
			];
		}
		case 'tool_result': {
			const matchedIndex = event.toolCallId ? toolQueue.findIndex((item) => item.callId === event.toolCallId) : 0;
			const pendingIndex = matchedIndex >= 0 ? matchedIndex : 0;
			const pending = toolQueue.splice(pendingIndex, 1)[0];
			const id = pending?.id ?? `tool-${requestId}-${event.internalCallId}`;
			const toolMessage = toolMessageFromSerializedResult(
				id,
				event.toolName,
				event.result,
				pending?.summary ?? summaryFromSerializedArguments(event.toolName, event.args),
			);
			const output: RuntimeEvent[] = [{type: 'message.replaced', message: toolMessage}];
			const fileResult = parseFileResult(event.result);
			if (fileResult?.status === 'success' && 'operation_id' in fileResult) {
				const mutation = mutationSource?.takeMutation(fileResult.operation_id);
				if (mutation) {
					output.push({
						type: 'message.appended',
						message: {
							id: `diff-${id}`,
							kind: 'diff',
							file: mutation.file,
							before: mutation.before,
							after: mutation.after,
						},
					});
				}
			}
			output.push({type: 'status.changed', status: 'thinking'});
			return output;
		}
		case 'final':
			return event.output && !assistantText
				? [{type: 'assistant.delta', messageId: assistantId, delta: event.output}]
				: [];
		case 'error':
			throw event.error;
		default:
			return [];
	}
};
