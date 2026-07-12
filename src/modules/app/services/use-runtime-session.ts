import {useCallback, useEffect, useRef} from 'react';
import type {AgentStatus, InputMode, SubmitRequest} from '../../agent/index.js';
import type {AgentRuntime} from '../../agent/index.js';
import {normalizeInput} from '../../composer/index.js';
import {useAppStore, useAppStoreApi} from '../components/app-provider.js';
import {RuntimeEventBatcher} from './runtime-event-batcher.js';

export type RuntimeSession = {
	submit: (content: string, mode: InputMode) => void;
	interrupt: () => void;
};

const canStartTurn = (status: AgentStatus): boolean => status === 'idle' || status === 'error';

export const useRuntimeSession = (
	runtime: AgentRuntime,
	onSessionActivity?: (phase: 'started' | 'completed') => void,
): RuntimeSession => {
	const store = useAppStoreApi();
	const activeTurnId = useAppStore((state) => state.activeTurnId);
	const queuedCount = useAppStore((state) => state.queuedRequests.length);
	const sequence = useRef(0);
	const controller = useRef<AbortController | null>(null);

	const execute = useCallback(
		async (request: SubmitRequest) => {
			const abortController = new AbortController();
			controller.current = abortController;
			const batcher = new RuntimeEventBatcher((event) => {
				if (controller.current !== abortController || abortController.signal.aborted) return;
				store.getState().applyRuntimeEvent(event);
				if (event.type === 'turn.started') onSessionActivity?.('started');
				if (event.type === 'turn.completed') onSessionActivity?.('completed');
			});
			try {
				for await (const event of runtime.run(request, abortController.signal)) {
					if (controller.current !== abortController || abortController.signal.aborted) break;
					batcher.push(event);
				}
				batcher.flush();
			} catch (error) {
				if (!abortController.signal.aborted) {
					batcher.flush();
					store.getState().applyRuntimeEvent({
						type: 'turn.failed',
						turnId: request.id,
						error: error instanceof Error ? error.message : String(error),
					});
				} else batcher.discard();
			} finally {
				batcher.discard();
				if (controller.current === abortController) controller.current = null;
			}
		},
		[onSessionActivity, runtime, store],
	);

	const submit = useCallback(
		(value: string, mode: InputMode) => {
			const content = normalizeInput(value).trim();
			if (!content) return;
			const request: SubmitRequest = {id: `live-${++sequence.current}`, content, mode};
			const state = store.getState();
			if (controller.current || state.activeTurnId || !canStartTurn(state.status)) state.enqueueRequest(request);
			else void execute(request);
		},
		[execute, store],
	);

	const interrupt = useCallback(() => {
		controller.current?.abort(new Error('Interrupted by user'));
		controller.current = null;
		store.getState().interrupt();
	}, [store]);

	useEffect(() => {
		if (activeTurnId || queuedCount === 0 || !canStartTurn(store.getState().status)) return;
		const request = store.getState().shiftQueuedRequest();
		if (request) void execute(request);
	}, [activeTurnId, execute, queuedCount, store]);

	useEffect(
		() => () => {
			controller.current?.abort(new Error('Application disposed'));
			void runtime.dispose();
		},
		[runtime],
	);

	return {submit, interrupt};
};
