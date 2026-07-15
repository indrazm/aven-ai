import {createSqliteMemoryStore} from '@anvia/memory-sqlite';
import {realpathSync, statSync} from 'node:fs';
import {join} from 'node:path';
import type {UiMessage} from '../conversation/index.js';
import type {ProjectSessionSummary} from '../sessions/index.js';
import type {ProviderCredentials, ProviderId} from '../providers/index.js';
import type {RuntimeEvent} from './types.js';
import type {SubmitRequest} from './types.js';
import type {
	ConfigurableAgentRuntime,
	ConnectionState,
	ModelStatus,
	ProjectSessionRuntime,
	ProjectSessionSwitch,
	ProviderStatus,
	SteerableAgentRuntime,
} from './types.js';
import {DirectCommandExecutor} from './services/direct-command-executor.js';
import {PromptTurnExecutor} from './services/prompt-turn-executor.js';
import {ProviderConnectionManager} from '../providers/index.js';
import {ConfigStore, defaultConfigDirectory} from '../../libs/config/index.js';
import {messagesFromMemory} from './events/memory-message-adapter.js';
import {FileToolService} from './tools/files/file-tool-service.js';
import {defaultProviderFactory, type ProviderFactory} from '../../libs/provider-clients/index.js';
import {NodePtyRunner, type PtyRunner} from '../../libs/pty/index.js';
import {ProjectSessionManager} from '../sessions/index.js';
import {SessionCatalog} from '../../libs/session-storage/index.js';
import type {LexaRuntime} from '../../libs/lexa/index.js';

export type {ProviderConnection, ProviderFactory} from '../../libs/provider-clients/index.js';
export {MissingProviderKeyError} from '../providers/index.js';

export type AnviaRuntimeOptions = {
	configStore?: ConfigStore;
	memoryPath?: string;
	lexa: LexaRuntime;
	ptyRunner?: PtyRunner;
	providerFactory?: ProviderFactory;
	projectRoot?: string;
	sessionCatalog?: SessionCatalog;
};

export class AnviaAgentRuntime implements ConfigurableAgentRuntime, ProjectSessionRuntime, SteerableAgentRuntime {
	readonly #directCommands: DirectCommandExecutor;
	readonly #files: FileToolService;
	readonly #projectRoot: string;
	readonly #projectSessions: ProjectSessionManager;
	readonly #promptTurns: PromptTurnExecutor;
	readonly #providers: ProviderConnectionManager;
	readonly #pty: PtyRunner;
	#disposed = false;
	#running = false;

	constructor(options: AnviaRuntimeOptions) {
		this.#projectRoot = realpathSync(options.projectRoot ?? process.cwd());
		if (!statSync(this.#projectRoot).isDirectory()) throw new Error('Project root must be a directory.');
		this.#files = new FileToolService(this.#projectRoot);
		const memory = createSqliteMemoryStore({
			path: options.memoryPath ?? join(defaultConfigDirectory(), 'memory.sqlite'),
		});
		const sessionCatalog =
			options.sessionCatalog ?? new SessionCatalog(join(defaultConfigDirectory(), 'sessions.sqlite'));
		this.#projectSessions = new ProjectSessionManager(this.#projectRoot, sessionCatalog, memory);
		this.#pty =
			options.ptyRunner ?? new NodePtyRunner(this.#projectRoot, {pathEntries: [options.lexa.binaryDirectory]});
		this.#providers = new ProviderConnectionManager(
			options.configStore ?? new ConfigStore(),
			options.providerFactory ?? defaultProviderFactory,
		);
		this.#promptTurns = new PromptTurnExecutor(this.#projectRoot, memory, this.#pty, this.#files, options.lexa);
		this.#directCommands = new DirectCommandExecutor(this.#projectRoot, memory, this.#pty);
	}

	getProjectRoot(): string {
		return this.#projectRoot;
	}

	getActiveSession(): ProjectSessionSummary {
		return this.#projectSessions.active();
	}

	async initializeSessions(): Promise<void> {
		this.#assertAvailable();
		await this.#projectSessions.initialize();
	}

	async listSessions(): Promise<ProjectSessionSummary[]> {
		this.#assertAvailable();
		return this.#projectSessions.list();
	}

	startNewSession(): ProjectSessionSummary {
		this.#assertSessionChangeAllowed();
		this.#files.clear();
		return this.#projectSessions.startNew();
	}

	async switchSession(sessionId: string): Promise<ProjectSessionSwitch> {
		this.#assertSessionChangeAllowed();
		const selected = await this.#projectSessions.select(sessionId);
		this.#files.clear();
		return {session: selected.session, messages: messagesFromMemory(selected.messages)};
	}

	getConnection(): ConnectionState {
		return this.#providers.state;
	}

	providerStatuses(): Promise<ProviderStatus[]> {
		return this.#providers.providerStatuses();
	}

	modelStatuses(): Promise<ModelStatus[]> {
		return this.#providers.modelStatuses();
	}

	restore(): Promise<ConnectionState> {
		return this.#providers.restore();
	}

	connect(provider: ProviderId): Promise<ConnectionState> {
		this.#assertAvailable();
		return this.#providers.connect(provider);
	}

	setup(provider: ProviderId, credentials: ProviderCredentials): Promise<ConnectionState> {
		this.#assertAvailable();
		return this.#providers.setup(provider, credentials);
	}

	selectModel(model: string): Promise<ConnectionState> {
		this.#assertAvailable();
		return this.#providers.selectModel(model);
	}

	async loadHistory(): Promise<UiMessage[]> {
		return messagesFromMemory(await this.#projectSessions.loadMessages());
	}

	steer(request: SubmitRequest): boolean {
		if (this.#disposed || request.mode !== 'prompt') return false;
		return this.#promptTurns.steer(request);
	}

	async *run(request: SubmitRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
		this.#assertAvailable();
		if (this.#running) throw new Error('Another turn is already active.');
		this.#running = true;
		this.#projectSessions.beginActivity(request);
		const steeringSession = request.mode === 'prompt' ? this.#promptTurns.beginSteering() : undefined;
		try {
			yield {type: 'turn.started', request};
			const sessionId = this.#projectSessions.active().id;
			if (request.mode === 'bash') {
				yield* this.#directCommands.run(request, signal, sessionId);
				yield* this.#completeSessionTurn(request.id);
				return;
			}
			const model = this.#providers.model;
			if (this.#providers.state.status !== 'connected' || !model) {
				throw new Error('No provider connected. Run /connect.');
			}
			yield* this.#promptTurns.run(request, signal, model, sessionId, steeringSession!);
			yield* this.#completeSessionTurn(request.id);
		} finally {
			if (steeringSession) this.#promptTurns.endSteering(steeringSession);
			this.#running = false;
		}
	}

	dispose(): void {
		this.#disposed = true;
		this.#files.clear();
		this.#projectSessions.dispose();
		this.#pty.dispose();
	}

	async *#completeSessionTurn(turnId: string): AsyncIterable<RuntimeEvent> {
		try {
			this.#projectSessions.commit();
		} catch {
			yield {
				type: 'message.appended',
				message: {
					id: `session-warning-${turnId}`,
					kind: 'system',
					level: 'warning',
					content: 'The turn completed, but Aven could not update the session catalog.',
				},
			};
		}
		yield {type: 'turn.completed', turnId};
	}

	#assertSessionChangeAllowed(): void {
		this.#assertAvailable();
		if (this.#running) throw new Error('Wait for the active turn to finish or interrupt it before changing sessions.');
	}

	#assertAvailable(): void {
		if (this.#disposed) throw new Error('Runtime has been disposed');
	}
}
