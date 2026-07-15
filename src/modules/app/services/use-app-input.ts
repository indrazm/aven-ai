import {useCallback, useMemo, type RefObject} from 'react';
import {useInput, usePaste, type Key} from 'ink';
import {actionForCommand, routeForCommand} from '../../commands/index.js';
import type {Suggestion, SuggestionStatus} from '../../composer/index.js';
import {insertMention, insertText, normalizeInput, workspaceMentionsFor} from '../../composer/index.js';
import {composerInputIntent} from '../../composer/index.js';
import {commandSuggestionsFor, useProjectMentions} from '../../composer/index.js';
import {transcriptInputIntent} from '../../conversation/index.js';
import type {TranscriptHandle} from '../../conversation/index.js';
import type {AgentStatus} from '../../agent/index.js';
import type {OverlayItem} from '../../overlays/index.js';
import {isMouseInputSequence} from '../../../libs/terminal/index.js';
import {useAppStore, useAppStoreApi} from '../components/app-provider.js';
import {useQuitController} from './quit-controller.js';
import type {RuntimeConnection} from './use-runtime-connection.js';
import type {RuntimeSession} from './use-runtime-session.js';
import type {RuntimeWorkspace} from './use-runtime-workspace.js';
import {useOverlayController} from '../input/use-overlay-controller.js';

type InputControllerResult = {
	suggestions: readonly Suggestion[];
	suggestionMode?: 'command' | 'mention';
	suggestionStatus?: SuggestionStatus;
	overlayItems: readonly OverlayItem[];
};

type ActiveTurnInputAction = 'steer' | 'enqueue';

export const hasActiveTurn = (status: AgentStatus, activeTurnId: string | null): boolean =>
	Boolean(activeTurnId) || status === 'thinking' || status === 'runningTool' || status === 'waitingPermission';

export const activeTurnInputAction = (
	value: string,
	key: Partial<Key>,
	active: boolean,
): ActiveTurnInputAction | undefined => {
	if (!active || !value.trim() || key.ctrl || key.meta || key.super || key.shift) return undefined;
	if (key.return) return 'steer';
	if (key.tab) return 'enqueue';
	return undefined;
};

export const useAppInput = (
	transcriptRef: RefObject<TranscriptHandle | null>,
	runtimeSession: RuntimeSession,
	connection: RuntimeConnection,
	workspace: RuntimeWorkspace,
	projectRoot: string,
): InputControllerResult => {
	const store = useAppStoreApi();
	const editor = useAppStore((state) => state.editor);
	const inputMode = useAppStore((state) => state.inputMode);
	const transcriptMode = useAppStore((state) => state.transcriptMode);
	const suggestionsHidden = useAppStore((state) => state.suggestionsHidden);
	const suggestionIndex = useAppStore((state) => state.suggestionIndex);
	const historyIndex = useAppStore((state) => state.historyIndex);
	const armExit = useQuitController();
	const overlayController = useOverlayController(connection, workspace);
	const suggestionsVisible = !overlayController.active && !suggestionsHidden && inputMode === 'prompt';

	const commandSuggestions = useMemo(() => {
		return commandSuggestionsFor(editor.value, suggestionsVisible);
	}, [editor.value, suggestionsVisible]);
	const projectMentions = useProjectMentions(projectRoot, editor, inputMode, suggestionsVisible);
	const suggestions: readonly Suggestion[] = projectMentions.query ? projectMentions.suggestions : commandSuggestions;
	const suggestionMode = projectMentions.query ? 'mention' : suggestions.length > 0 ? 'command' : undefined;

	const submit = useCallback(() => {
		const state = store.getState();
		const enteredValue = state.editor.value.trim();
		if (!enteredValue) return;
		const matchingCommands = state.inputMode === 'prompt' ? commandSuggestionsFor(enteredValue, true) : [];
		const selectedCommand = matchingCommands[Math.max(0, Math.min(state.suggestionIndex, matchingCommands.length - 1))];
		const value = selectedCommand?.label ?? enteredValue;
		const commandRoute = state.inputMode === 'prompt' ? routeForCommand(value) : undefined;
		const commandAction = state.inputMode === 'prompt' ? actionForCommand(value) : undefined;
		let accepted = true;
		if (commandRoute) overlayController.open(commandRoute);
		else if (commandAction === 'newSession') void workspace.startNew();
		else if (commandAction === 'resumeLastSession') void workspace.resumeLast();
		else {
			accepted = runtimeSession.submit(
				value,
				state.inputMode,
				state.inputMode === 'prompt' ? workspaceMentionsFor(value, projectMentions.entries) : [],
			);
		}
		if (accepted) {
			state.setEditor({value: '', cursor: 0});
			state.setHistoryIndex(-1);
		}
	}, [overlayController, projectMentions.entries, runtimeSession, store, workspace]);

	usePaste((text) => {
		if (overlayController.handlePaste(text)) return;
		const state = store.getState();
		if (!state.transcriptMode) {
			state.setEditor((current) => insertText(current, normalizeInput(text)));
		}
	});

	useInput((input, key) => {
		if (key.eventType === 'release' || isMouseInputSequence(input)) return;
		const actions = store.getState();

		if ((key.ctrl || key.meta || key.super) && key.shift && input.toLowerCase() === 'c') {
			transcriptRef.current?.copySelection();
			return;
		}

		if (overlayController.handleInput(input, key)) return;

		if (transcriptMode) {
			const intent = transcriptInputIntent(input, key);
			if (intent.type === 'close') actions.setTranscriptMode(false);
			else if (intent.type === 'scroll') transcriptRef.current?.scrollBy(intent.amount);
			else if (intent.type === 'page') transcriptRef.current?.pageBy(intent.direction);
			else if (intent.type === 'start') transcriptRef.current?.scrollToTop();
			else if (intent.type === 'end') transcriptRef.current?.scrollToBottom();
			return;
		}

		if (key.ctrl && input === 'o') {
			actions.setTranscriptMode(true);
			return;
		}
		if (key.pageUp || key.pageDown) {
			transcriptRef.current?.pageBy(key.pageUp ? -1 : 1);
			return;
		}
		if (key.ctrl && key.home) {
			transcriptRef.current?.scrollToTop();
			return;
		}
		if (key.ctrl && key.end) {
			transcriptRef.current?.scrollToBottom();
			return;
		}

		if (key.ctrl && input === 'c') {
			if (hasActiveTurn(actions.status, actions.activeTurnId)) runtimeSession.interrupt();
			else if (!transcriptRef.current?.clearSelection()) armExit('c');
			return;
		}

		if (key.escape && transcriptRef.current?.clearSelection()) return;
		// Active-turn Enter and Tab intentionally take precedence over autocomplete:
		// the editor text is a steer/queue payload, while Shift+Enter still reaches
		// the regular composer intent and inserts a newline.
		const activeAction = activeTurnInputAction(
			actions.editor.value,
			key,
			hasActiveTurn(actions.status, actions.activeTurnId),
		);
		if (activeAction) {
			const value = normalizeInput(actions.editor.value).trim();
			const mentions = actions.inputMode === 'prompt' ? workspaceMentionsFor(value, projectMentions.entries) : [];
			const accepted = runtimeSession[activeAction](value, actions.inputMode, mentions);
			if (accepted) {
				actions.setEditor({value: '', cursor: 0});
				actions.setHistoryIndex(-1);
			}
			return;
		}
		const intent = composerInputIntent(input, key, {
			editor,
			inputMode,
			suggestions,
			suggestionIndex,
			suggestionsVisible: Boolean(suggestionMode),
		});
		if (intent.type === 'armExit') armExit('d');
		else if (intent.type === 'setEditor') {
			actions.setEditor(intent.editor);
			if (intent.revealSuggestions) actions.setSuggestionsHidden(false);
			if (intent.resetSuggestion) actions.setSuggestionIndex(0);
		} else if (intent.type === 'hideSuggestions') actions.setSuggestionsHidden(true);
		else if (intent.type === 'setInputMode') actions.setInputMode(intent.mode);
		else if (intent.type === 'openHelp') overlayController.open('help');
		else if (intent.type === 'selectSuggestion') {
			actions.setSuggestionIndex((current) => Math.max(0, Math.min(suggestions.length - 1, current + intent.amount)));
		} else if (intent.type === 'acceptSuggestion') {
			const selected = suggestions[Math.max(0, Math.min(suggestionIndex, suggestions.length - 1))];
			if (selected?.kind === 'mention') {
				actions.setEditor((current) => insertMention(current, {path: selected.path, kind: selected.pathKind}));
				actions.setSuggestionsHidden(true);
			} else if (selected) {
				actions.setEditor({value: selected.label, cursor: selected.label.length});
			}
		} else if (intent.type === 'history') {
			const next = Math.max(-1, Math.min(overlayController.history.length - 1, historyIndex + intent.amount));
			actions.setHistoryIndex(next);
			const value = next < 0 ? '' : (overlayController.history[next] ?? '');
			actions.setEditor({value, cursor: value.length});
		} else if (intent.type === 'submit') submit();
	});

	return {
		suggestions,
		...(suggestionMode ? {suggestionMode} : {}),
		...(projectMentions.status ? {suggestionStatus: projectMentions.status} : {}),
		overlayItems: overlayController.items,
	};
};
