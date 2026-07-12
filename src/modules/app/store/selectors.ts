import type {AppStore} from './app-state.js';

export const selectSession = (state: AppStore) => ({
	messages: state.messages,
	status: state.status,
	activeTurnId: state.activeTurnId,
	queuedRequests: state.queuedRequests,
});

export const selectComposer = (state: AppStore) => ({
	editor: state.editor,
	inputMode: state.inputMode,
	suggestionIndex: state.suggestionIndex,
	suggestionsHidden: state.suggestionsHidden,
});

export const selectNavigation = (state: AppStore) => ({
	overlay: state.overlay,
	transcriptMode: state.transcriptMode,
	historyIndex: state.historyIndex,
	exitHint: state.exitHint,
});
