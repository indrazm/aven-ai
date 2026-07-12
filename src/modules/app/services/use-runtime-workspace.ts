import {useCallback, useEffect, useState} from 'react';
import type {UiMessage} from '../../conversation/index.js';
import {singleLineLabel, type ProjectSessionSummary} from '../../sessions/index.js';
import {isProjectSessionRuntime, type AgentRuntime, type ProjectSessionRuntime} from '../../agent/index.js';
import {useAppStoreApi} from '../components/app-provider.js';

export type RuntimeWorkspace = {
	supported: boolean;
	projectRoot?: string;
	active?: ProjectSessionSummary;
	sessions: readonly ProjectSessionSummary[];
	error?: string;
	refresh(): Promise<void>;
	onTurnPhase(phase: 'started' | 'completed'): void;
	startNew(): Promise<boolean>;
	resumeLast(): Promise<boolean>;
	switchSession(sessionId: string): Promise<boolean>;
};

const sessionMessage = (content: string): UiMessage => ({
	id: `session-${Date.now()}`,
	kind: 'system',
	level: 'info',
	content,
});

export const useRuntimeWorkspace = (runtime: AgentRuntime): RuntimeWorkspace => {
	const store = useAppStoreApi();
	const sessionRuntime: ProjectSessionRuntime | undefined = isProjectSessionRuntime(runtime) ? runtime : undefined;
	const [active, setActive] = useState<ProjectSessionSummary | undefined>(() => sessionRuntime?.getActiveSession());
	const [sessions, setSessions] = useState<readonly ProjectSessionSummary[]>([]);
	const [error, setError] = useState<string | undefined>();

	const report = useCallback(
		(level: 'warning' | 'error', content: string) => {
			store.getState().appendMessage({id: `session-${level}-${Date.now()}`, kind: 'system', level, content});
		},
		[store],
	);

	const refresh = useCallback(async () => {
		if (!sessionRuntime) return;
		setActive(sessionRuntime.getActiveSession());
		try {
			setSessions(await sessionRuntime.listSessions());
			setActive(sessionRuntime.getActiveSession());
			setError(undefined);
		} catch {
			setError('Session catalog unavailable');
		}
	}, [sessionRuntime]);

	const canChangeSession = useCallback((): boolean => {
		const state = store.getState();
		if (
			!state.activeTurnId &&
			state.queuedRequests.length === 0 &&
			(state.status === 'idle' || state.status === 'error')
		) {
			return true;
		}
		report('warning', 'Wait for active and queued work to finish, or interrupt it, before changing sessions.');
		return false;
	}, [report, store]);

	const onTurnPhase = useCallback(
		(phase: 'started' | 'completed') => {
			if (!sessionRuntime) return;
			setActive(sessionRuntime.getActiveSession());
			if (phase === 'completed') void refresh();
		},
		[refresh, sessionRuntime],
	);

	const startNew = useCallback(async () => {
		if (!sessionRuntime) {
			report('warning', 'This runtime does not support project sessions.');
			return false;
		}
		if (!canChangeSession()) return false;
		try {
			const next = sessionRuntime.startNewSession();
			setActive(next);
			store.getState().resetSession([sessionMessage(`Started a new session in ${singleLineLabel(next.projectRoot)}.`)]);
			await refresh();
			return true;
		} catch (caught) {
			report('error', caught instanceof Error ? caught.message : String(caught));
			return false;
		}
	}, [canChangeSession, refresh, report, sessionRuntime, store]);

	const switchSession = useCallback(
		async (sessionId: string) => {
			if (!sessionRuntime) {
				report('warning', 'This runtime does not support project sessions.');
				return false;
			}
			if (!canChangeSession()) return false;
			try {
				const switched = await sessionRuntime.switchSession(sessionId);
				setActive(switched.session);
				store
					.getState()
					.resetSession(
						switched.messages.length > 0
							? switched.messages
							: [sessionMessage(`Session “${switched.session.title}” has no saved messages.`)],
					);
				await refresh();
				return true;
			} catch (caught) {
				report('error', caught instanceof Error ? caught.message : String(caught));
				return false;
			}
		},
		[canChangeSession, refresh, report, sessionRuntime, store],
	);

	const resumeLast = useCallback(async () => {
		if (!sessionRuntime) {
			report('warning', 'This runtime does not support project sessions.');
			return false;
		}
		try {
			const latest = (await sessionRuntime.listSessions()).find((session) => !session.active && session.persisted);
			if (!latest) {
				report('warning', 'There is no previous project session to resume.');
				return false;
			}
			return await switchSession(latest.id);
		} catch (caught) {
			report('error', caught instanceof Error ? caught.message : String(caught));
			return false;
		}
	}, [report, sessionRuntime, switchSession]);

	useEffect(() => {
		if (!sessionRuntime) return;
		void sessionRuntime
			.initializeSessions()
			.then(refresh)
			.catch(() => {
				setError('Session catalog unavailable');
				report('warning', 'Aven could not initialize project sessions. The current chat remains usable.');
			});
	}, [refresh, report, sessionRuntime]);

	return {
		supported: Boolean(sessionRuntime),
		...(sessionRuntime ? {projectRoot: sessionRuntime.getProjectRoot()} : {}),
		...(active ? {active} : {}),
		sessions,
		...(error ? {error} : {}),
		refresh,
		onTurnPhase,
		startNew,
		resumeLast,
		switchSession,
	};
};
