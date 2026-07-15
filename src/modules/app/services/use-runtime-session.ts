import {useCallback, useEffect, useLayoutEffect, useMemo, useRef} from 'react';
import {
	isSteerableRuntime,
	type AgentRuntime,
	type AgentStatus,
	type InputMode,
	type RuntimeEvent,
	type SubmitRequest,
	type WorkspaceMention,
} from '../../agent/index.js';
import {normalizeInput} from '../../composer/index.js';
import {useAppStore, useAppStoreApi} from '../components/app-provider.js';

type RequestInput = {
	content: string;
	mode: InputMode;
	mentions: readonly WorkspaceMention[];
};

type RuntimeGeneration = {
	runtime: AgentRuntime;
	controller: AbortController | null;
	currentRequest: SubmitRequest | null;
	disposed: boolean;
	draining: boolean;
	requestStarted: boolean;
	requestSettled: boolean;
};

export type RuntimeSession = {
	submit: (content: string, mode: InputMode, mentions?: readonly WorkspaceMention[]) => boolean;
	steer: (content: string, mode: InputMode, mentions?: readonly WorkspaceMention[]) => boolean;
	enqueue: (content: string, mode: InputMode, mentions?: readonly WorkspaceMention[]) => boolean;
	interrupt: () => void;
};

const canStartTurn = (status: AgentStatus): boolean => status === 'idle' || status === 'error';

const requestInput = (
	value: string,
	mode: InputMode,
	mentions: readonly WorkspaceMention[],
): RequestInput | undefined => {
	const content = normalizeInput(value).trim();
	if (!content) return undefined;
	return {content, mode, mentions};
};

export const useRuntimeSession = (
	runtime: AgentRuntime,
	onSessionActivity?: (phase: 'started' | 'completed') => void,
): RuntimeSession => {
	const store = useAppStoreApi();
	const activeTurnId = useAppStore((state) => state.activeTurnId);
	const queuedCount = useAppStore((state) => state.queuedRequests.length);
	const status = useAppStore((state) => state.status);
	const sequence = useRef(0);
	const generation = useMemo<RuntimeGeneration>(
		() => ({
			runtime,
			controller: null,
			currentRequest: null,
			disposed: false,
			draining: false,
			requestStarted: false,
			requestSettled: false,
		}),
		[runtime],
	);
	const latestGeneration = useRef(generation);
	useLayoutEffect(() => {
		latestGeneration.current = generation;
	}, [generation]);

	const createRequest = useCallback((input: RequestInput): SubmitRequest => {
		return {
			id: `live-${++sequence.current}`,
			content: input.content,
			mode: input.mode,
			...(input.mentions.length > 0 ? {mentions: [...input.mentions]} : {}),
		};
	}, []);

	const execute = useCallback(
		async (request: SubmitRequest) => {
			if (generation.disposed) return;
			const abortController = new AbortController();
			generation.controller = abortController;
			generation.currentRequest = request;
			generation.requestStarted = false;
			generation.requestSettled = false;
			const dispatch = (event: RuntimeEvent) => {
				if (generation.disposed || generation.controller !== abortController || abortController.signal.aborted) return;
				store.getState().applyRuntimeEvent(event);
				if (event.type === 'turn.started') {
					generation.requestStarted = true;
					onSessionActivity?.('started');
				}
				if (event.type === 'turn.completed') {
					generation.requestSettled = true;
					onSessionActivity?.('completed');
				}
				if (event.type === 'turn.failed') generation.requestSettled = true;
			};
			try {
				for await (const event of generation.runtime.run(request, abortController.signal)) {
					if (generation.disposed || generation.controller !== abortController || abortController.signal.aborted) break;
					dispatch(event);
				}
				if (!abortController.signal.aborted && !generation.requestSettled) {
					if (!generation.requestStarted) dispatch({type: 'turn.started', request});
					dispatch({
						type: 'turn.failed',
						turnId: request.id,
						error: 'The runtime ended before completing the turn.',
					});
				}
			} catch (error) {
				if (!abortController.signal.aborted) {
					if (!generation.requestStarted) dispatch({type: 'turn.started', request});
					dispatch({
						type: 'turn.failed',
						turnId: request.id,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			} finally {
				if (generation.controller === abortController) generation.controller = null;
				if (generation.currentRequest === request) generation.currentRequest = null;
			}
		},
		[generation, onSessionActivity, store],
	);

	const drain = useCallback(async () => {
		if (generation.draining || generation.disposed) return;
		const state = store.getState();
		if (state.activeTurnId || !canStartTurn(state.status)) return;
		generation.draining = true;
		try {
			while (!generation.disposed) {
				const request = store.getState().shiftQueuedRequest();
				if (!request) break;
				await execute(request);
			}
		} finally {
			generation.draining = false;
		}
	}, [execute, generation, store]);

	const submit = useCallback(
		(value: string, mode: InputMode, mentions: readonly WorkspaceMention[] = []) => {
			const input = requestInput(value, mode, mentions);
			if (!input) return false;
			const state = store.getState();
			if (state.activeTurnId || !canStartTurn(state.status)) return false;
			state.enqueueRequest(createRequest(input));
			void drain();
			return true;
		},
		[createRequest, drain, store],
	);

	const steer = useCallback(
		(value: string, mode: InputMode, mentions: readonly WorkspaceMention[] = []) => {
			const input = requestInput(value, mode, mentions);
			const abortController = generation.controller;
			if (
				!input ||
				generation.disposed ||
				!abortController ||
				abortController.signal.aborted ||
				!store.getState().activeTurnId ||
				!isSteerableRuntime(generation.runtime)
			) {
				return false;
			}
			const request = createRequest(input);
			let accepted: boolean;
			try {
				accepted = generation.runtime.steer(request);
			} catch {
				return false;
			}
			if (!accepted) return false;
			store.getState().appendMessage({
				id: `user-${request.id}`,
				kind: 'user',
				variant: request.mode === 'bash' ? 'bash' : 'prompt',
				content: request.content,
			});
			return true;
		},
		[createRequest, generation, store],
	);

	const enqueue = useCallback(
		(value: string, mode: InputMode, mentions: readonly WorkspaceMention[] = []) => {
			const input = requestInput(value, mode, mentions);
			if (!input) return false;
			store.getState().enqueueRequest(createRequest(input));
			void drain();
			return true;
		},
		[createRequest, drain, store],
	);

	const interrupt = useCallback(() => {
		generation.controller?.abort(new Error('Interrupted by user'));
		store.getState().interrupt();
	}, [generation, store]);

	useEffect(() => {
		void drain();
	}, [activeTurnId, drain, queuedCount, status]);

	useEffect(
		() => () => {
			const alreadyAborted = generation.controller?.signal.aborted ?? false;
			generation.disposed = true;
			generation.controller?.abort(new Error('Application disposed'));
			void generation.runtime.dispose();
			if (latestGeneration.current === generation || alreadyAborted) return;

			const request = generation.currentRequest;
			if (!request || generation.requestSettled) return;
			const state = store.getState();
			if (state.activeTurnId === request.id) {
				state.applyRuntimeEvent({
					type: 'turn.failed',
					turnId: request.id,
					error: 'The runtime changed before the active turn completed.',
				});
			} else if (!state.activeTurnId && !generation.requestStarted) {
				state.applyRuntimeEvent({type: 'turn.started', request});
				store.getState().applyRuntimeEvent({
					type: 'turn.failed',
					turnId: request.id,
					error: 'The runtime changed before the active turn completed.',
				});
			}
		},
		[generation, store],
	);

	return {submit, steer, enqueue, interrupt};
};
