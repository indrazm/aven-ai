import {useMemo, useRef} from 'react';
import {Box, useWindowSize} from 'ink';
import {useShallow} from 'zustand/react/shallow';
import type {UiMessage} from '../../conversation/index.js';
import type {AgentRuntime} from '../../agent/index.js';
import {isConfigurableRuntime} from '../../agent/index.js';
import {MockRuntime} from '../../agent/index.js';
import {Composer} from '../../composer/index.js';
import type {TranscriptHandle} from '../../conversation/index.js';
import {VirtualTranscript} from '../../conversation/index.js';
import {Overlay} from '../../overlays/index.js';
import {AppProvider, useAppStore} from './app-provider.js';
import {selectComposer, selectNavigation, selectSession} from '../store/selectors.js';
import {useAppInput} from '../services/use-app-input.js';
import {useRuntimeConnection} from '../services/use-runtime-connection.js';
import {useRuntimeSession} from '../services/use-runtime-session.js';
import {useRuntimeWorkspace} from '../services/use-runtime-workspace.js';

export type AppProps = {
	mockResponseDelay?: number;
	runtime?: AgentRuntime;
	workingDirectory?: string;
};

const AppShell = ({runtime, workingDirectory}: {runtime: AgentRuntime; workingDirectory: string}) => {
	const {columns, rows} = useWindowSize();
	const session = useAppStore(useShallow(selectSession));
	const composer = useAppStore(useShallow(selectComposer));
	const navigation = useAppStore(useShallow(selectNavigation));
	const transcriptRef = useRef<TranscriptHandle>(null);
	const workspace = useRuntimeWorkspace(runtime);
	const runtimeSession = useRuntimeSession(runtime, workspace.onTurnPhase);
	const connection = useRuntimeConnection(runtime);
	const projectRoot = workspace.projectRoot ?? workingDirectory;
	const input = useAppInput(transcriptRef, runtimeSession, connection, workspace, projectRoot);
	const providerModel =
		connection.state.status === 'connected' && connection.state.providerLabel && connection.state.model
			? `${connection.state.providerLabel} · ${connection.state.model}`
			: 'No provider selected';

	return (
		<Box width={Math.max(1, columns)} height={Math.max(1, rows)} flexDirection="column" overflow="hidden">
			<VirtualTranscript ref={transcriptRef} messages={session.messages} active={navigation.transcriptMode} />
			{navigation.overlay ? (
				<Overlay
					route={navigation.overlay.route}
					query={navigation.overlay.query}
					items={input.overlayItems}
					selectedIndex={navigation.overlay.selectedIndex}
				/>
			) : null}
			<Composer
				value={composer.editor.value}
				cursor={composer.editor.cursor}
				mode={composer.inputMode}
				status={session.status}
				queuedPrompts={session.queuedRequests.map((request) => request.content)}
				suggestions={input.suggestions}
				selectedSuggestion={composer.suggestionIndex}
				{...(input.suggestionMode ? {suggestionMode: input.suggestionMode} : {})}
				{...(input.suggestionStatus ? {suggestionStatus: input.suggestionStatus} : {})}
				exitHint={navigation.exitHint}
				providerModel={providerModel}
				workingDirectory={projectRoot}
				transcriptActive={navigation.transcriptMode}
			/>
		</Box>
	);
};

export const App = ({
	mockResponseDelay = 700,
	runtime: injectedRuntime,
	workingDirectory = process.cwd(),
}: AppProps) => {
	const runtime = useMemo(
		() => injectedRuntime ?? new MockRuntime(mockResponseDelay),
		[injectedRuntime, mockResponseDelay],
	);
	const initialMessages: UiMessage[] = [
		{
			id: 'welcome',
			kind: 'system',
			level: 'info',
			content: isConfigurableRuntime(runtime)
				? 'Welcome to Aven AI. Use /connect to choose or configure a provider.'
				: 'Welcome to Aven AI. Local mock mode is active.',
		},
	];

	return (
		<AppProvider initialMessages={initialMessages}>
			<AppShell runtime={runtime} workingDirectory={workingDirectory} />
		</AppProvider>
	);
};
