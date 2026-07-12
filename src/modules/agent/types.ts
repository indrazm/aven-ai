import type {UiMessage} from '../conversation/index.js';
import type {
	ConnectionState,
	ModelStatus,
	ProviderCredentials,
	ProviderId,
	ProviderStatus,
} from '../providers/index.js';
import type {ProjectSessionSummary} from '../sessions/index.js';

export type {ConnectionState, ModelStatus, ProviderStatus} from '../providers/index.js';
export type {ProviderCredentials} from '../providers/index.js';

export type InputMode = 'prompt' | 'bash';
export type AgentStatus = 'idle' | 'thinking' | 'runningTool' | 'waitingPermission' | 'error';
export type SubmitRequest = {id: string; content: string; mode: InputMode};

export type RuntimeEvent =
	| {type: 'turn.started'; request: SubmitRequest}
	| {type: 'status.changed'; status: AgentStatus}
	| {type: 'message.appended'; message: UiMessage}
	| {type: 'message.replaced'; message: UiMessage}
	| {type: 'assistant.delta'; messageId: string; delta: string}
	| {type: 'turn.completed'; turnId: string}
	| {type: 'turn.failed'; turnId: string; error: string};

export interface AgentRuntime {
	run(request: SubmitRequest, signal: AbortSignal): AsyncIterable<RuntimeEvent>;
	dispose(): void | Promise<void>;
}

export interface ConfigurableAgentRuntime extends AgentRuntime {
	getConnection(): ConnectionState;
	providerStatuses(): Promise<ProviderStatus[]>;
	modelStatuses(): Promise<ModelStatus[]>;
	restore(): Promise<ConnectionState>;
	connect(provider: ProviderId): Promise<ConnectionState>;
	setup(provider: ProviderId, credentials: ProviderCredentials): Promise<ConnectionState>;
	selectModel(model: string): Promise<ConnectionState>;
	loadHistory(): Promise<UiMessage[]>;
}

export type ProjectSessionSwitch = {session: ProjectSessionSummary; messages: UiMessage[]};

export interface ProjectSessionRuntime extends AgentRuntime {
	getProjectRoot(): string;
	getActiveSession(): ProjectSessionSummary;
	initializeSessions(): Promise<void>;
	listSessions(): Promise<ProjectSessionSummary[]>;
	startNewSession(): ProjectSessionSummary;
	switchSession(sessionId: string): Promise<ProjectSessionSwitch>;
}

export const isConfigurableRuntime = (runtime: AgentRuntime): runtime is ConfigurableAgentRuntime => {
	const candidate = runtime as Partial<ConfigurableAgentRuntime>;
	return (
		typeof candidate.getConnection === 'function' &&
		typeof candidate.providerStatuses === 'function' &&
		typeof candidate.modelStatuses === 'function' &&
		typeof candidate.restore === 'function' &&
		typeof candidate.connect === 'function' &&
		typeof candidate.setup === 'function' &&
		typeof candidate.selectModel === 'function' &&
		typeof candidate.loadHistory === 'function'
	);
};

export const isProjectSessionRuntime = (runtime: AgentRuntime): runtime is ProjectSessionRuntime => {
	const candidate = runtime as Partial<ProjectSessionRuntime>;
	return (
		typeof candidate.getProjectRoot === 'function' &&
		typeof candidate.getActiveSession === 'function' &&
		typeof candidate.initializeSessions === 'function' &&
		typeof candidate.listSessions === 'function' &&
		typeof candidate.startNewSession === 'function' &&
		typeof candidate.switchSession === 'function'
	);
};
