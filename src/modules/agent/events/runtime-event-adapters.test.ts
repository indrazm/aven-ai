import {AssistantContent, Message, type AgentStreamEvent, type JsonValue} from '@anvia/core';
import {describe, expect, it, vi} from 'vitest';
import {messagesFromMemory} from './memory-message-adapter.js';
import {eventToRuntimeEvents, type PendingToolCall} from './stream-event-adapter.js';

const toolCallEvent = (id: string, name: string, arguments_: JsonValue, turn = 1): AgentStreamEvent => ({
	type: 'tool_call',
	turn,
	toolCall: AssistantContent.toolCall(id, name, arguments_),
});

const toolCallEventWithCallId = (id: string, callId: string, name: string, arguments_: JsonValue): AgentStreamEvent => {
	const event = toolCallEvent(id, name, arguments_);
	if (event.type !== 'tool_call') throw new Error('Expected a tool call event');
	return {...event, toolCall: {...event.toolCall, callId}};
};

const toolResultEvent = (id: string, name: string, result: unknown): AgentStreamEvent => ({
	type: 'tool_result',
	turn: 1,
	toolName: name,
	toolCallId: id,
	internalCallId: `internal-${id}`,
	args: '{}',
	result: JSON.stringify(result),
});

describe('runtime file-tool event adaptation', () => {
	it('groups Read calls and summarizes results without exposing file content in the UI detail', () => {
		const queue: PendingToolCall[] = [];
		const path = '/workspace/file.txt';
		const started = eventToRuntimeEvents(
			toolCallEvent('read-1', 'Read', {file_path: path}),
			'request',
			'assistant',
			queue,
			'',
		);
		expect(started).toContainEqual(
			expect.objectContaining({
				type: 'message.appended',
				message: expect.objectContaining({name: 'Read', summary: path, group: 'read', status: 'running'}),
			}),
		);

		const completed = eventToRuntimeEvents(
			toolResultEvent('read-1', 'Read', {
				status: 'success',
				tool: 'Read',
				file_path: path,
				content: '1\tsecret',
				start_line: 1,
				num_lines: 1,
				total_lines: 1,
				truncated: false,
			}),
			'request',
			'assistant',
			queue,
			'',
		);
		expect(completed).toContainEqual(
			expect.objectContaining({
				type: 'message.replaced',
				message: expect.objectContaining({name: 'Read', status: 'success', detail: 'Read 1 of 1 lines from line 1.'}),
			}),
		);
		expect(JSON.stringify(completed)).not.toContain('secret');
	});

	it('correlates results by either stream id or provider call id before queue order', () => {
		const queue: PendingToolCall[] = [];
		eventToRuntimeEvents(
			toolCallEventWithCallId('exec-stream', 'exec-provider', 'ExecCommand', {command: 'pwd'}),
			'request',
			'assistant',
			queue,
			'',
		);
		eventToRuntimeEvents(
			toolCallEventWithCallId('read-stream', 'read-provider', 'Read', {file_path: '/workspace/file.txt'}),
			'request',
			'assistant',
			queue,
			'',
		);

		const completed = eventToRuntimeEvents(
			toolResultEvent('read-stream', 'Read', {
				status: 'success',
				tool: 'Read',
				file_path: '/workspace/file.txt',
				content: 'content',
				start_line: 1,
				num_lines: 1,
				total_lines: 1,
				truncated: false,
			}),
			'request',
			'assistant',
			queue,
			'',
		);

		expect(completed[0]).toEqual(
			expect.objectContaining({
				type: 'message.replaced',
				message: expect.objectContaining({id: 'tool-request-1-read-stream', name: 'Read'}),
			}),
		);
		expect(queue).toEqual([expect.objectContaining({id: 'tool-request-1-exec-stream', name: 'ExecCommand'})]);
	});

	it('keeps repeated provider tool ids unique across model turns', () => {
		const queue: PendingToolCall[] = [];
		const first = eventToRuntimeEvents(
			toolCallEvent('tool-0', 'ExecCommand', {command: 'first'}, 1),
			'request',
			'assistant',
			queue,
			'',
		);
		const second = eventToRuntimeEvents(
			toolCallEvent('tool-0', 'Read', {file_path: '/workspace/file.txt'}, 2),
			'request',
			'assistant-turn-2',
			queue,
			'',
		);

		expect(first[1]).toEqual(
			expect.objectContaining({
				type: 'message.appended',
				message: expect.objectContaining({id: 'tool-request-1-tool-0', name: 'ExecCommand'}),
			}),
		);
		expect(second[1]).toEqual(
			expect.objectContaining({
				type: 'message.appended',
				message: expect.objectContaining({id: 'tool-request-2-tool-0', name: 'Read'}),
			}),
		);
	});

	it('appends a transient diff after a successful mutation', () => {
		const queue: PendingToolCall[] = [];
		const path = '/workspace/file.txt';
		eventToRuntimeEvents(toolCallEvent('edit-1', 'Edit', {file_path: path}), 'request', 'assistant', queue, '');
		const takeMutation = vi.fn(() => ({file: path, before: 'old', after: 'new'}));
		const events = eventToRuntimeEvents(
			toolResultEvent('edit-1', 'Edit', {
				status: 'success',
				tool: 'Edit',
				file_path: path,
				replacements: 1,
				operation_id: 'operation',
				message: 'Replaced 1 occurrence.',
			}),
			'request',
			'assistant',
			queue,
			'',
			{takeMutation},
		);

		expect(takeMutation).toHaveBeenCalledWith('operation');
		expect(events.map((event) => event.type)).toEqual(['message.replaced', 'message.appended', 'status.changed']);
		expect(events[1]).toEqual({
			type: 'message.appended',
			message: {id: 'diff-tool-request-1-edit-1', kind: 'diff', file: path, before: 'old', after: 'new'},
		});
	});

	it('restores successful file-tool entries with the correct group from memory', () => {
		const path = '/workspace/file.txt';
		const messages = [
			Message.assistant([AssistantContent.toolCall('write-1', 'Write', {file_path: path, content: 'new'})]),
			Message.toolResult(
				'write-1',
				{
					status: 'success',
					tool: 'Write',
					file_path: path,
					operation: 'update',
					operation_id: 'operation',
					message: 'Updated file.',
				},
				{toolName: 'Write'},
			),
		];

		expect(messagesFromMemory(messages)).toEqual([
			expect.objectContaining({kind: 'tool', name: 'Write', summary: path, status: 'success', group: 'edit'}),
		]);
	});

	it('marks structured validation failures as tool errors', () => {
		const queue: PendingToolCall[] = [];
		const path = '/workspace/file.txt';
		eventToRuntimeEvents(toolCallEvent('write-1', 'Write', {file_path: path}), 'request', 'assistant', queue, '');
		const events = eventToRuntimeEvents(
			toolResultEvent('write-1', 'Write', {
				status: 'error',
				tool: 'Write',
				file_path: path,
				error: 'Read the file first.',
			}),
			'request',
			'assistant',
			queue,
			'',
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'message.replaced',
				message: expect.objectContaining({
					name: 'Write',
					status: 'error',
					group: 'edit',
					detail: 'Read the file first.',
				}),
			}),
		);
	});
});
