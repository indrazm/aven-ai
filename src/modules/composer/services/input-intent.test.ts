import {describe, expect, it} from 'vitest';
import {composerInputIntent, type ComposerInputContext} from './input-intent.js';

const context = (value = '', overrides: Partial<ComposerInputContext> = {}): ComposerInputContext => ({
	editor: {value, cursor: value.length},
	inputMode: 'prompt',
	suggestions: [],
	suggestionIndex: 0,
	...overrides,
});

const commandSuggestion = {kind: 'command', label: '/connect', description: 'Connect'} as const;

describe('composer input intents', () => {
	it('keeps mode and editor transitions pure', () => {
		expect(composerInputIntent('!', {}, context())).toEqual({type: 'setInputMode', mode: 'bash'});
		expect(composerInputIntent('', {escape: true}, context('', {inputMode: 'bash'}))).toEqual({
			type: 'setInputMode',
			mode: 'prompt',
		});
		expect(composerInputIntent('x', {}, context('ab'))).toMatchObject({
			type: 'setEditor',
			editor: {value: 'abx', cursor: 3},
			revealSuggestions: true,
		});
	});

	it('gives command suggestions precedence over prompt history', () => {
		const withSuggestions = context('/c', {suggestions: [commandSuggestion]});
		expect(composerInputIntent('', {downArrow: true}, withSuggestions)).toEqual({type: 'selectSuggestion', amount: 1});
		expect(composerInputIntent('', {tab: true}, withSuggestions)).toEqual({type: 'acceptSuggestion'});
	});

	it('accepts mention suggestions with Tab or Enter before submitting', () => {
		const mentionSuggestion = {
			kind: 'mention',
			label: '@src/app.ts',
			description: 'file',
			path: 'src/app.ts',
			pathKind: 'file',
		} as const;
		const withMention = context('Review @src/a', {suggestions: [mentionSuggestion], suggestionsVisible: true});
		expect(composerInputIntent('', {tab: true}, withMention)).toEqual({type: 'acceptSuggestion'});
		expect(composerInputIntent('', {return: true}, withMention)).toEqual({type: 'acceptSuggestion'});
		expect(composerInputIntent('', {return: true}, context('Review @missing', {suggestionsVisible: true}))).toEqual({
			type: 'submit',
		});
	});

	it('distinguishes submission, portable newlines, and exit arming', () => {
		expect(composerInputIntent('', {return: true}, context('hello'))).toEqual({type: 'submit'});
		expect(composerInputIntent('', {return: true}, context('hello\\'))).toEqual({
			type: 'setEditor',
			editor: {value: 'hello\n', cursor: 6},
		});
		expect(composerInputIntent('d', {ctrl: true}, context())).toEqual({type: 'armExit'});
	});

	it('covers editing and navigation intents', () => {
		expect(composerInputIntent('', {backspace: true}, context('ab'))).toMatchObject({
			type: 'setEditor',
			editor: {value: 'a', cursor: 1},
			revealSuggestions: true,
		});
		expect(composerInputIntent('', {delete: true}, context('ab', {editor: {value: 'ab', cursor: 0}}))).toMatchObject({
			type: 'setEditor',
			editor: {value: 'b', cursor: 0},
		});
		expect(composerInputIntent('', {leftArrow: true}, context('ab'))).toMatchObject({
			type: 'setEditor',
			editor: {cursor: 1},
		});
		expect(
			composerInputIntent('', {rightArrow: true}, context('ab', {editor: {value: 'ab', cursor: 0}})),
		).toMatchObject({type: 'setEditor', editor: {cursor: 1}});
		expect(composerInputIntent('', {home: true}, context('a\nb'))).toMatchObject({
			type: 'setEditor',
			editor: {cursor: 2},
		});
		expect(composerInputIntent('', {end: true}, context('a\nb', {editor: {value: 'a\nb', cursor: 0}}))).toMatchObject({
			type: 'setEditor',
			editor: {cursor: 1},
		});
		expect(composerInputIntent('', {upArrow: true}, context('plain'))).toEqual({type: 'history', amount: 1});
		expect(composerInputIntent('', {downArrow: true}, context('plain'))).toEqual({type: 'history', amount: -1});
	});

	it('covers escape, help, modifier, and empty-suggestion branches', () => {
		expect(composerInputIntent('', {escape: true}, context('/c', {suggestions: [commandSuggestion]}))).toEqual({
			type: 'hideSuggestions',
		});
		expect(composerInputIntent('', {escape: true}, context('clear me'))).toEqual({
			type: 'setEditor',
			editor: {value: '', cursor: 0},
		});
		expect(composerInputIntent('', {escape: true}, context())).toEqual({type: 'handled'});
		expect(composerInputIntent('?', {}, context())).toEqual({type: 'openHelp'});
		expect(composerInputIntent('', {upArrow: true}, context('/c', {suggestions: [commandSuggestion]}))).toEqual({
			type: 'selectSuggestion',
			amount: -1,
		});
		expect(
			composerInputIntent(
				'',
				{tab: true},
				context('/c', {
					suggestions: [commandSuggestion],
					suggestionIndex: 2,
				}),
			),
		).toEqual({type: 'handled'});
		expect(composerInputIntent('', {return: true, shift: true}, context('line'))).toMatchObject({
			type: 'setEditor',
			editor: {value: 'line\n'},
		});
		expect(composerInputIntent('x', {ctrl: true}, context())).toEqual({type: 'unhandled'});
		expect(composerInputIntent('d', {ctrl: true}, context('ab', {editor: {value: 'ab', cursor: 0}}))).toMatchObject({
			type: 'setEditor',
			editor: {value: 'b'},
		});
	});
});
