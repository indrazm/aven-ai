import {AgentBuilder, type CompletionModel, type Message} from '@anvia/core';
import type {PromptRequest} from '@anvia/core/request';
import type {SqliteMemoryStore} from '@anvia/memory-sqlite';
import type {RuntimeEvent} from '../types.js';
import type {SubmitRequest} from '../types.js';
import {createExecCommandTool} from '../tools/exec-command.js';
import {createFileTools} from '../tools/files/create-file-tools.js';
import type {FileToolService} from '../tools/files/file-tool-service.js';
import {activeShell, type PtyRunner} from '../../../libs/pty/index.js';
import {safeErrorMessage} from '../../../utils/safe-error.js';
import {eventToRuntimeEvents, type PendingToolCall} from '../events/stream-event-adapter.js';
import {buildSystemPrompt} from '../prompts/system.js';
import {loadProjectInstructions} from '../prompts/project-instructions.js';
import {steeringMessageFor} from '../prompts/steering.js';
import {promptMessageFor} from '../prompts/workspace-mentions.js';
import {createAgentRecovery} from './agent-recovery.js';
import type {LexaRuntime} from '../../../libs/lexa/index.js';

export const MAX_AGENT_TURNS = 50;

type SteeringSession = {
	accepting: boolean;
	activeRequest: PromptRequest | null;
	pendingMessages: Message[];
};

export class PromptTurnExecutor {
	readonly #files: FileToolService;
	readonly #memory: SqliteMemoryStore;
	readonly #projectRoot: string;
	readonly #pty: PtyRunner;
	readonly #lexa: LexaRuntime;
	#steeringSession: SteeringSession | null = null;

	constructor(
		projectRoot: string,
		memory: SqliteMemoryStore,
		pty: PtyRunner,
		files: FileToolService,
		lexa: LexaRuntime,
	) {
		this.#projectRoot = projectRoot;
		this.#memory = memory;
		this.#pty = pty;
		this.#files = files;
		this.#lexa = lexa;
	}

	beginSteering(): SteeringSession {
		if (this.#steeringSession) this.#closeSteering(this.#steeringSession);
		const session: SteeringSession = {accepting: true, activeRequest: null, pendingMessages: []};
		this.#steeringSession = session;
		return session;
	}

	endSteering(session: SteeringSession): void {
		this.#closeSteering(session);
	}

	steer(request: SubmitRequest): boolean {
		if (request.mode !== 'prompt') return false;
		const session = this.#steeringSession;
		if (!session?.accepting) return false;
		const message = steeringMessageFor(this.#projectRoot, request);
		const activeRequest = session.activeRequest;
		if (!activeRequest) {
			session.pendingMessages.push(message);
			return true;
		}
		const accepted = activeRequest.steer(message);
		if (!accepted && this.#steeringSession === session) this.#closeSteering(session);
		return accepted;
	}

	async *run(
		request: SubmitRequest,
		signal: AbortSignal,
		model: CompletionModel,
		sessionId: string,
		steeringSession: SteeringSession,
	): AsyncIterable<RuntimeEvent> {
		try {
			yield {type: 'status.changed', status: 'thinking'};
			const projectInstructions = await loadProjectInstructions(this.#projectRoot);
			if (signal.aborted) throw signal.reason ?? new Error('Aborted');
			const recovery = createAgentRecovery();
			const tools = [createExecCommandTool(this.#pty, signal), ...createFileTools(this.#files, signal)];
			const agent = new AgentBuilder('aven', model)
				.instructions(
					buildSystemPrompt({
						lexa: this.#lexa,
						projectRoot: this.#projectRoot,
						platform: process.platform,
						shell: activeShell(),
						projectInstructions,
					}),
				)
				.tools(tools)
				.middleware(recovery.middleware)
				.hook(recovery.hook)
				.memory(this.#memory, {savePolicy: 'turn'})
				.defaultMaxTurns(MAX_AGENT_TURNS)
				.build();
			const activeRequest = agent
				.session(sessionId, {metadata: {projectRoot: this.#projectRoot}})
				.prompt(promptMessageFor(this.#projectRoot, request))
				.withToolConcurrency(8);
			if (this.#steeringSession !== steeringSession || !steeringSession.accepting) return;
			steeringSession.activeRequest = activeRequest;
			for (const message of steeringSession.pendingMessages.splice(0)) {
				if (!activeRequest.steer(message)) return;
			}
			const stream = activeRequest.stream()[Symbol.asyncIterator]();
			const stop = () => {
				void stream.return?.();
			};
			signal.addEventListener('abort', stop, {once: true});
			const baseAssistantId = `assistant-${request.id}`;
			let assistantId = baseAssistantId;
			let assistantText = '';
			let assistantStreaming = false;
			const toolQueue: PendingToolCall[] = [];

			try {
				while (true) {
					const next = await stream.next();
					if (next.done) break;
					const event = next.value;
					if (event.type === 'turn_start') {
						if (assistantStreaming) {
							yield {type: 'assistant.completed', messageId: assistantId};
							assistantStreaming = false;
						}
						assistantId = event.turn === 1 ? baseAssistantId : `${baseAssistantId}-turn-${event.turn}`;
						assistantText = '';
					}
					if (event.type === 'tool_call' && assistantStreaming) {
						yield {type: 'assistant.completed', messageId: assistantId};
						assistantStreaming = false;
					}
					for (const runtimeEvent of eventToRuntimeEvents(
						event,
						request.id,
						assistantId,
						toolQueue,
						assistantText,
						this.#files,
					)) {
						if (runtimeEvent.type === 'assistant.delta') {
							assistantText += runtimeEvent.delta;
							assistantStreaming = true;
						}
						yield runtimeEvent;
					}
					if (event.type === 'final' && event.output !== assistantText) {
						yield {
							type: 'message.replaced',
							message: {id: assistantId, kind: 'assistant', variant: 'text', content: event.output},
						};
						assistantText = event.output;
					}
					if (event.type === 'final' && assistantStreaming) {
						yield {type: 'assistant.completed', messageId: assistantId};
						assistantStreaming = false;
					}
				}
				if (signal.aborted) throw signal.reason ?? new Error('Aborted');
				if (assistantStreaming) yield {type: 'assistant.completed', messageId: assistantId};
			} finally {
				signal.removeEventListener('abort', stop);
			}
		} catch (error) {
			if (signal.aborted) throw signal.reason ?? error;
			// Do not retain the provider error as a cause; it may contain credentials.
			// eslint-disable-next-line preserve-caught-error
			throw new Error(safeErrorMessage(error));
		} finally {
			this.#closeSteering(steeringSession);
		}
	}

	#closeSteering(session: SteeringSession): void {
		session.accepting = false;
		session.activeRequest = null;
		session.pendingMessages.length = 0;
		if (this.#steeringSession === session) this.#steeringSession = null;
	}
}
