import type {UiMessage} from '../../src/modules/conversation/index.js';
import type {ProjectSessionSummary} from '../../src/modules/sessions/index.js';
import type {ProviderId} from '../../src/modules/providers/index.js';
import type {RuntimeEvent} from '../../src/modules/agent/index.js';
import type {SubmitRequest} from '../../src/modules/agent/index.js';
import type {
	AgentRuntime,
	ConfigurableAgentRuntime,
	ConnectionState,
	ModelStatus,
	ProjectSessionRuntime,
	ProviderStatus,
} from '../../src/modules/agent/index.js';
import {MockRuntime} from '../../src/modules/agent/index.js';

export class SetupRuntime implements ConfigurableAgentRuntime {
	readonly mock = new MockRuntime(0);
	lastApiKey: string | undefined;
	connection: ConnectionState = {status: 'disconnected'};
	configured = false;
	selectedModel = 'gpt-5';

	async *run(request: SubmitRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
		yield* this.mock.run(request, signal);
	}

	getConnection(): ConnectionState {
		return this.connection;
	}

	async providerStatuses(): Promise<ProviderStatus[]> {
		return [
			{
				id: 'openai',
				label: 'OpenAI',
				model: 'gpt-5',
				configured: this.configured,
				active: this.connection.provider === 'openai',
			},
			{id: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-20250514', configured: false, active: false},
		];
	}

	async modelStatuses(): Promise<ModelStatus[]> {
		return [
			{id: 'gpt-5', active: this.selectedModel === 'gpt-5'},
			{id: 'gpt-5-mini', active: this.selectedModel === 'gpt-5-mini'},
		];
	}

	async restore(): Promise<ConnectionState> {
		return this.connection;
	}

	async connect(provider: ProviderId): Promise<ConnectionState> {
		this.connection = {status: 'connected', provider, providerLabel: 'OpenAI', model: 'gpt-5'};
		return this.connection;
	}

	async setup(provider: ProviderId, apiKey: string): Promise<ConnectionState> {
		this.lastApiKey = apiKey;
		this.configured = true;
		return this.connect(provider);
	}

	async selectModel(model: string): Promise<ConnectionState> {
		this.selectedModel = model;
		this.connection = {...this.connection, model};
		return this.connection;
	}

	async loadHistory(): Promise<UiMessage[]> {
		return [];
	}

	dispose(): void {
		this.mock.dispose();
	}
}

export class RecoveringRuntime implements AgentRuntime {
	runs = 0;
	readonly firstRunGate: Promise<void> | undefined;
	#releaseFirstRun: (() => void) | undefined;

	constructor(blockFirstRun = false) {
		if (blockFirstRun) {
			this.firstRunGate = new Promise((resolve) => {
				this.#releaseFirstRun = resolve;
			});
		}
	}

	releaseFirstRun(): void {
		this.#releaseFirstRun?.();
	}

	async *run(request: SubmitRequest): AsyncIterable<RuntimeEvent> {
		this.runs += 1;
		yield {type: 'turn.started', request};
		if (this.runs === 1) {
			if (this.firstRunGate) await this.firstRunGate;
			throw new Error('first run failed');
		}
		yield {
			type: 'message.appended',
			message: {id: `assistant-${request.id}`, kind: 'assistant', variant: 'text', content: 'Recovered successfully.'},
		};
		yield {type: 'turn.completed', turnId: request.id};
	}

	dispose(): void {}
}

export class SupersededRuntime implements AgentRuntime {
	runs = 0;
	#releaseFirst: (() => void) | undefined;
	#releaseSecond: (() => void) | undefined;
	readonly #firstGate = new Promise<void>((resolve) => {
		this.#releaseFirst = resolve;
	});
	readonly #secondGate = new Promise<void>((resolve) => {
		this.#releaseSecond = resolve;
	});

	releaseFirst(): void {
		this.#releaseFirst?.();
	}

	releaseSecond(): void {
		this.#releaseSecond?.();
	}

	async *run(request: SubmitRequest): AsyncIterable<RuntimeEvent> {
		this.runs += 1;
		const run = this.runs;
		yield {type: 'turn.started', request};
		await (run === 1 ? this.#firstGate : this.#secondGate);
		yield {
			type: 'message.appended',
			message: {
				id: `assistant-${request.id}`,
				kind: 'assistant',
				variant: 'text',
				content: run === 1 ? 'Stale response.' : 'Current response.',
			},
		};
		yield {type: 'turn.completed', turnId: request.id};
	}

	dispose(): void {}
}

export class SessionRuntime implements ProjectSessionRuntime {
	active: ProjectSessionSummary = {
		id: 'new-session',
		projectRoot: '/workspace/alpha',
		title: 'New session',
		createdAt: '2026-01-02T00:00:00.000Z',
		updatedAt: '2026-01-02T00:00:00.000Z',
		active: true,
		persisted: false,
	};
	readonly previous: ProjectSessionSummary = {
		id: 'previous-session',
		projectRoot: '/workspace/alpha',
		title: 'Previous work',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T01:00:00.000Z',
		active: false,
		persisted: true,
	};
	newSessions = 0;
	readonly blockRuns: boolean;

	constructor(blockRuns = false) {
		this.blockRuns = blockRuns;
	}

	async *run(request: SubmitRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent> {
		yield {type: 'turn.started', request};
		if (this.blockRuns) {
			await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), {once: true}));
			if (signal.aborted) return;
		}
		yield {type: 'turn.completed', turnId: request.id};
	}

	getProjectRoot(): string {
		return this.active.projectRoot;
	}

	getActiveSession(): ProjectSessionSummary {
		return {...this.active};
	}

	async initializeSessions(): Promise<void> {}

	async listSessions(): Promise<ProjectSessionSummary[]> {
		return [this.active, ...(this.active.id === this.previous.id ? [] : [this.previous])];
	}

	startNewSession(): ProjectSessionSummary {
		this.newSessions += 1;
		this.active = {
			...this.active,
			id: `new-session-${this.newSessions}`,
			title: 'New session',
			active: true,
			persisted: false,
		};
		return this.getActiveSession();
	}

	async switchSession(sessionId: string): Promise<{session: ProjectSessionSummary; messages: UiMessage[]}> {
		if (sessionId !== this.previous.id) return {session: this.getActiveSession(), messages: []};
		this.active = {...this.previous, active: true};
		return {
			session: this.getActiveSession(),
			messages: [{id: 'old-prompt', kind: 'user', variant: 'prompt', content: 'Continue the previous work'}],
		};
	}

	dispose(): void {}
}
