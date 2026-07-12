import type {EditorState} from '../types.js';

export type {EditorState} from '../types.js';

const clamp = (value: string, cursor: number) => Math.max(0, Math.min(cursor, value.length));

export const insertText = (state: EditorState, text: string): EditorState => {
	const cursor = clamp(state.value, state.cursor);
	return {
		value: state.value.slice(0, cursor) + text + state.value.slice(cursor),
		cursor: cursor + text.length,
	};
};

export const backspace = (state: EditorState): EditorState => {
	const cursor = clamp(state.value, state.cursor);
	if (cursor === 0) return state;
	const before = [...state.value.slice(0, cursor)];
	const removed = before.pop();
	const nextCursor = cursor - (removed?.length ?? 0);
	return {value: state.value.slice(0, nextCursor) + state.value.slice(cursor), cursor: nextCursor};
};

export const deleteForward = (state: EditorState): EditorState => {
	const cursor = clamp(state.value, state.cursor);
	if (cursor >= state.value.length) return state;
	const removed = [...state.value.slice(cursor)][0] ?? '';
	return {value: state.value.slice(0, cursor) + state.value.slice(cursor + removed.length), cursor};
};

export const moveCursor = (state: EditorState, amount: number): EditorState => ({
	...state,
	cursor: clamp(state.value, state.cursor + amount),
});

export const moveLineBoundary = (state: EditorState, boundary: 'start' | 'end'): EditorState => {
	const cursor = clamp(state.value, state.cursor);
	if (boundary === 'start') {
		const previousBreak = state.value.lastIndexOf('\n', Math.max(0, cursor - 1));
		return {...state, cursor: previousBreak + 1};
	}
	const nextBreak = state.value.indexOf('\n', cursor);
	return {...state, cursor: nextBreak === -1 ? state.value.length : nextBreak};
};

export const normalizeInput = (value: string): string => value.replace(/\r\n?/gu, '\n');
