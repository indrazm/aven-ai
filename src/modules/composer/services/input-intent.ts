import type {Key} from 'ink';
import type {InputMode} from '../../agent/index.js';
import {backspace, deleteForward, insertText, moveCursor, moveLineBoundary} from './editor.js';
import type {EditorState} from '../types.js';

export type ComposerInputContext = {
	editor: EditorState;
	inputMode: InputMode;
	suggestions: readonly {label: string}[];
	suggestionIndex: number;
};

export type ComposerInputIntent =
	| {type: 'armExit'}
	| {type: 'setEditor'; editor: EditorState; revealSuggestions?: boolean; resetSuggestion?: boolean}
	| {type: 'hideSuggestions'}
	| {type: 'setInputMode'; mode: InputMode}
	| {type: 'openHelp'}
	| {type: 'selectSuggestion'; amount: -1 | 1}
	| {type: 'history'; amount: -1 | 1}
	| {type: 'submit'}
	| {type: 'handled'}
	| {type: 'unhandled'};

export const composerInputIntent = (
	input: string,
	key: Partial<Key>,
	context: ComposerInputContext,
): ComposerInputIntent => {
	const {editor, inputMode, suggestions, suggestionIndex} = context;
	if (key.ctrl && input === 'd') {
		return editor.value ? {type: 'setEditor', editor: deleteForward(editor)} : {type: 'armExit'};
	}
	if (key.escape) {
		if (suggestions.length > 0) return {type: 'hideSuggestions'};
		if (inputMode === 'bash' && !editor.value) return {type: 'setInputMode', mode: 'prompt'};
		if (editor.value) return {type: 'setEditor', editor: {value: '', cursor: 0}};
		return {type: 'handled'};
	}
	if (editor.value === '' && input === '?' && inputMode === 'prompt') return {type: 'openHelp'};
	if (editor.value === '' && input === '!' && inputMode === 'prompt') return {type: 'setInputMode', mode: 'bash'};
	if (suggestions.length > 0 && (key.upArrow || key.downArrow)) {
		return {type: 'selectSuggestion', amount: key.upArrow ? -1 : 1};
	}
	if (suggestions.length > 0 && key.tab) {
		const suggestion = suggestions[suggestionIndex];
		return suggestion
			? {type: 'setEditor', editor: {value: suggestion.label, cursor: suggestion.label.length}}
			: {type: 'handled'};
	}
	if (key.return) {
		if (key.shift || key.meta) return {type: 'setEditor', editor: insertText(editor, '\n')};
		if (editor.value.endsWith('\\')) return {type: 'setEditor', editor: insertText(backspace(editor), '\n')};
		return {type: 'submit'};
	}
	if (key.backspace) return {type: 'setEditor', editor: backspace(editor), revealSuggestions: true};
	if (key.delete) return {type: 'setEditor', editor: deleteForward(editor), revealSuggestions: true};
	if (key.leftArrow || key.rightArrow) {
		return {type: 'setEditor', editor: moveCursor(editor, key.leftArrow ? -1 : 1)};
	}
	if (key.home || key.end) {
		return {type: 'setEditor', editor: moveLineBoundary(editor, key.home ? 'start' : 'end')};
	}
	if (key.upArrow || key.downArrow) return {type: 'history', amount: key.upArrow ? 1 : -1};
	if (!key.ctrl && !key.meta && !key.super && input) {
		return {
			type: 'setEditor',
			editor: insertText(editor, input),
			revealSuggestions: true,
			resetSuggestion: true,
		};
	}
	return {type: 'unhandled'};
};
