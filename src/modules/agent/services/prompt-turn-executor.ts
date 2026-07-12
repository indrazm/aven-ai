import {AgentBuilder, type CompletionModel} from '@anvia/core';
import type {SqliteMemoryStore} from '@anvia/memory-sqlite';
import type {RuntimeEvent} from '../types.js';
import type {SubmitRequest} from '../types.js';
import {createExecCommandTool} from '../tools/exec-command.js';
import {createFileTools} from '../tools/files/create-file-tools.js';
import type {FileToolService} from '../tools/files/file-tool-service.js';
import type {PtyRunner} from '../../../libs/pty/index.js';
import {safeErrorMessage} from '../../../utils/safe-error.js';
import {eventToRuntimeEvents, type PendingToolCall} from '../events/stream-event-adapter.js';
import {buildSystemPrompt} from '../prompts/system.js';

export class PromptTurnExecutor {
	readonly #files: FileToolService;
	readonly #memory: SqliteMemoryStore;
	readonly #projectRoot: string;
	readonly #pty: PtyRunner;

	constructor(projectRoot: string, memory: SqliteMemoryStore, pty: PtyRunner, files: FileToolService) {
		this.#projectRoot = projectRoot;
		this.#memory = memory;
		this.#pty = pty;
		this.#files = files;
	}

	async *run(
		request: SubmitRequest,
		signal: AbortSignal,
		model: CompletionModel,
		sessionId: string,
	): AsyncIterable<RuntimeEvent> {
		yield {type: 'status.changed', status: 'thinking'};
		const tools = [createExecCommandTool(this.#pty, signal), ...createFileTools(this.#files, signal)];
		const agent = new AgentBuilder('aven', model)
			.instructions(buildSystemPrompt(this.#projectRoot))
			.tools(tools)
			.memory(this.#memory, {savePolicy: 'turn'})
			.defaultMaxTurns(8)
			.build();
		const streamedTurn = agent
			.session(sessionId, {metadata: {projectRoot: this.#projectRoot}})
			.prompt(request.content)
			.withToolConcurrency(1)
			.stream();
		const stream = streamedTurn[Symbol.asyncIterator]();
		const stop = () => {
			void stream.return?.();
		};
		signal.addEventListener('abort', stop, {once: true});
		const baseAssistantId = `assistant-${request.id}`;
		let assistantId = baseAssistantId;
		let assistantText = '';
		const toolQueue: PendingToolCall[] = [];

		try {
			while (true) {
				const next = await stream.next();
				if (next.done) break;
				const event = next.value;
				if (event.type === 'turn_start') {
					assistantId = event.turn === 1 ? baseAssistantId : `${baseAssistantId}-turn-${event.turn}`;
					assistantText = '';
				}
				for (const runtimeEvent of eventToRuntimeEvents(
					event,
					request.id,
					assistantId,
					toolQueue,
					assistantText,
					this.#files,
				)) {
					if (runtimeEvent.type === 'assistant.delta') assistantText += runtimeEvent.delta;
					yield runtimeEvent;
				}
				if (event.type === 'final' && event.output !== assistantText) {
					yield {
						type: 'message.replaced',
						message: {id: assistantId, kind: 'assistant', variant: 'text', content: event.output},
					};
					assistantText = event.output;
				}
			}
			if (signal.aborted) throw signal.reason ?? new Error('Aborted');
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			// Do not retain the provider error as a cause; it may contain credentials.
			// eslint-disable-next-line preserve-caught-error
			throw new Error(safeErrorMessage(error));
		} finally {
			signal.removeEventListener('abort', stop);
		}
	}
}
