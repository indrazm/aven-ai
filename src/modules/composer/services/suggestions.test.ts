import {describe, expect, it} from 'vitest';
import {commandSuggestionsFor, createMentionSearch, suggestionWindow} from './suggestions.js';

describe('command suggestions', () => {
	it('filters the typed command registry', () => {
		expect(commandSuggestionsFor('/he', true).map((item) => item.label)).toEqual(['/help']);
		expect(commandSuggestionsFor('/he', false)).toEqual([]);
	});

	it('keeps the selected command visible at the bottom while moving down', () => {
		const suggestions = commandSuggestionsFor('/', true);
		const lastIndex = suggestions.length - 1;
		const visible = suggestionWindow(suggestions, lastIndex, 6);
		expect(visible.map((item) => item.index)).toEqual([
			lastIndex - 5,
			lastIndex - 4,
			lastIndex - 3,
			lastIndex - 2,
			lastIndex - 1,
			lastIndex,
		]);
		expect(visible.at(-1)?.suggestion.label).toBe('/theme');
	});

	it('shows the first page while the selection is already visible', () => {
		const suggestions = commandSuggestionsFor('/', true);
		expect(suggestionWindow(suggestions, 3, 6).map((item) => item.index)).toEqual([0, 1, 2, 3, 4, 5]);
	});
});

describe('mention suggestions', () => {
	it('fuzzy searches full paths and labels files and folders explicitly', () => {
		const search = createMentionSearch([
			{path: 'src', kind: 'directory'},
			{path: 'src/app.ts', kind: 'file'},
			{path: 'docs/application.md', kind: 'file'},
		]);
		expect(search('src/app')[0]).toEqual({
			kind: 'mention',
			label: '@src/app.ts',
			description: 'file',
			path: 'src/app.ts',
			pathKind: 'file',
		});
		expect(search('').map((item) => item.label)).toEqual(['@src/', '@docs/application.md', '@src/app.ts']);
	});
});
