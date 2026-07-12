import {createStore, type StoreApi} from 'zustand/vanilla';
import type {UiMessage} from '../../conversation/index.js';
import {applyRuntimeEvent} from './apply-runtime-event.js';
import type {AppStore, AppStoreState} from './app-state.js';

const initialState = (messages: readonly UiMessage[]): AppStoreState => ({
	messages: [...messages],
	status: 'idle',
	activeTurnId: null,
	queuedRequests: [],
	editor: {value: '', cursor: 0},
	inputMode: 'prompt',
	overlay: null,
	transcriptMode: false,
	suggestionIndex: 0,
	suggestionsHidden: false,
	historyIndex: -1,
	exitHint: false,
});

export const createAppStore = (messages: readonly UiMessage[] = []): StoreApi<AppStore> =>
	createStore<AppStore>()((set, get) => ({
		...initialState(messages),
		applyRuntimeEvent: (event) => set((state) => applyRuntimeEvent(state, event)),
		appendMessage: (message) => set((state) => ({messages: [...state.messages, message]})),
		replaceMessages: (messages) => set({messages: [...messages]}),
		resetSession: (messages) => set(initialState(messages)),
		setEditor: (editor) => set((state) => ({editor: typeof editor === 'function' ? editor(state.editor) : editor})),
		setInputMode: (inputMode) => set({inputMode}),
		setOverlay: (overlay) =>
			set((state) => ({overlay: typeof overlay === 'function' ? overlay(state.overlay) : overlay})),
		setTranscriptMode: (transcriptMode) => set({transcriptMode}),
		setSuggestionIndex: (suggestionIndex) =>
			set((state) => ({
				suggestionIndex:
					typeof suggestionIndex === 'function' ? suggestionIndex(state.suggestionIndex) : suggestionIndex,
			})),
		setSuggestionsHidden: (suggestionsHidden) => set({suggestionsHidden}),
		setHistoryIndex: (historyIndex) => set({historyIndex}),
		setExitHint: (exitHint) => set({exitHint}),
		enqueueRequest: (request) => set((state) => ({queuedRequests: [...state.queuedRequests, request]})),
		shiftQueuedRequest: () => {
			const [request, ...queuedRequests] = get().queuedRequests;
			set({queuedRequests});
			return request;
		},
		interrupt: () =>
			set((state) => ({
				status: 'idle',
				activeTurnId: null,
				messages: [
					...state.messages,
					{id: `interrupt-${Date.now()}`, kind: 'system', level: 'warning', content: 'Interrupted by user'},
				],
			})),
		recover: () => set((state) => (state.activeTurnId || state.status !== 'error' ? state : {status: 'idle'})),
	}));
