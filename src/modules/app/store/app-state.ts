import type {UiMessage} from '../../conversation/index.js';
import type {AgentStatus, InputMode, SubmitRequest} from '../../agent/index.js';
import type {RuntimeEvent} from '../../agent/index.js';
import type {EditorState} from '../../composer/index.js';
import type {OverlayState} from '../../overlays/index.js';

export type AppStoreState = {
	messages: UiMessage[];
	status: AgentStatus;
	activeTurnId: string | null;
	queuedRequests: SubmitRequest[];
	editor: EditorState;
	inputMode: InputMode;
	overlay: OverlayState | null;
	transcriptMode: boolean;
	suggestionIndex: number;
	suggestionsHidden: boolean;
	historyIndex: number;
	exitHint: boolean;
};

export type AppStoreActions = {
	applyRuntimeEvent: (event: RuntimeEvent) => void;
	appendMessage: (message: UiMessage) => void;
	replaceMessages: (messages: readonly UiMessage[]) => void;
	resetSession: (messages: readonly UiMessage[]) => void;
	setEditor: (editor: EditorState | ((current: EditorState) => EditorState)) => void;
	setInputMode: (mode: InputMode) => void;
	setOverlay: (overlay: OverlayState | null | ((current: OverlayState | null) => OverlayState | null)) => void;
	setTranscriptMode: (enabled: boolean) => void;
	setSuggestionIndex: (index: number | ((current: number) => number)) => void;
	setSuggestionsHidden: (hidden: boolean) => void;
	setHistoryIndex: (index: number) => void;
	setExitHint: (visible: boolean) => void;
	enqueueRequest: (request: SubmitRequest) => void;
	shiftQueuedRequest: () => SubmitRequest | undefined;
	interrupt: () => void;
	recover: () => void;
};

export type AppStore = AppStoreState & AppStoreActions;
