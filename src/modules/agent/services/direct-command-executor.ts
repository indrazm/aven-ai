import {AssistantContent, Message} from '@anvia/core';
import type {SqliteMemoryStore} from '@anvia/memory-sqlite';
import type {RuntimeEvent} from '../types.js';
import type {SubmitRequest} from '../types.js';
import type {PtyRunner} from '../../../libs/pty/index.js';
import {toolMessageFromResult} from '../events/tool-message-adapter.js';

export class DirectCommandExecutor {
	readonly #memory: SqliteMemoryStore;
	readonly #projectRoot: string;
	readonly #pty: PtyRunner;

	constructor(projectRoot: string, memory: SqliteMemoryStore, pty: PtyRunner) {
		this.#projectRoot = projectRoot;
		this.#memory = memory;
		this.#pty = pty;
	}

	async *run(request: SubmitRequest, signal: AbortSignal, sessionId: string): AsyncIterable<RuntimeEvent> {
		const messageId = `bash-${request.id}`;
		yield {type: 'status.changed', status: 'runningTool'};
		yield {
			type: 'message.appended',
			message: {
				id: messageId,
				kind: 'tool',
				name: 'exec_command',
				status: 'running',
				summary: request.content,
				group: 'bash',
			},
		};
		const result = await this.#pty.run(request.content, {signal});
		const toolCallId = `direct-${request.id}`;
		let persistenceFailed = false;
		try {
			await this.#memory.append({
				context: {sessionId, metadata: {projectRoot: this.#projectRoot}},
				runId: request.id,
				turn: 1,
				messages: [
					Message.user(request.content, {metadata: {avenMode: 'bash'}}),
					Message.assistant([AssistantContent.toolCall(toolCallId, 'exec_command', {command: request.content})]),
					Message.toolResult(toolCallId, result, {toolName: 'exec_command'}),
				],
			});
		} catch {
			persistenceFailed = true;
		}
		yield {type: 'message.replaced', message: toolMessageFromResult(messageId, result)};
		if (persistenceFailed) {
			yield {
				type: 'message.appended',
				message: {
					id: `shell-history-warning-${request.id}`,
					kind: 'system',
					level: 'warning',
					content: 'The command completed, but Aven could not save it to session history.',
				},
			};
		}
	}
}
