import {describe, expect, it} from 'vitest';
import {insertMention, mentionQueryAtCursor, mentionTokenFor, workspaceMentionsFor} from './mentions.js';
import type {ProjectPathEntry} from '../types.js';

const entries: ProjectPathEntry[] = [
	{path: 'src', kind: 'directory'},
	{path: 'src/app.ts', kind: 'file'},
	{path: 'docs/my file.md', kind: 'file'},
];

describe('workspace mention syntax', () => {
	it('finds the active mention at the cursor without treating email addresses as mentions', () => {
		const value = 'Review @src/app.ts please';
		const cursor = value.indexOf(' please');
		expect(mentionQueryAtCursor({value, cursor})).toEqual({
			start: 7,
			end: cursor,
			query: 'src/app.ts',
			quoted: false,
		});
		expect(mentionQueryAtCursor({value: 'email user@example.com', cursor: 22})).toBeUndefined();
		expect(mentionQueryAtCursor({value: '(@"docs/my f")', cursor: 12})).toMatchObject({
			query: 'docs/my f',
			quoted: true,
		});
	});

	it('formats folders and quotes paths only when required', () => {
		expect(mentionTokenFor(entries[0]!)).toBe('@src/');
		expect(mentionTokenFor(entries[1]!)).toBe('@src/app.ts');
		expect(mentionTokenFor(entries[2]!)).toBe('@"docs/my file.md"');
	});

	it('replaces only the active token and preserves surrounding prompt text', () => {
		const value = 'Review @sr please';
		expect(insertMention({value, cursor: value.indexOf(' please')}, entries[1]!)).toEqual({
			value: 'Review @src/app.ts please',
			cursor: 18,
		});
		expect(insertMention({value: 'Open @', cursor: 6}, entries[2]!)).toEqual({
			value: 'Open @"docs/my file.md" ',
			cursor: 24,
		});
	});

	it('resolves exact file and folder tokens, including quoted paths, without duplicates', () => {
		expect(
			workspaceMentionsFor('Review @src/app.ts with @"docs/my file.md" and @src/ then @src/app.ts', entries),
		).toEqual([
			{path: 'src/app.ts', kind: 'file'},
			{path: 'docs/my file.md', kind: 'file'},
			{path: 'src', kind: 'directory'},
		]);
		expect(workspaceMentionsFor('Email user@example.com and @missing.ts', entries)).toEqual([]);
	});
});
