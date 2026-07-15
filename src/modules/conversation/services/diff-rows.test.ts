import {structuredPatch} from 'diff';
import {describe, expect, it} from 'vitest';
import stringWidth from 'string-width';
import type {DiffMessage} from '../types.js';
import {messageToRows, rowText} from './message-rows.js';
import {selectedText} from './selection.js';

const previewFor = (before: string, after: string, file = 'src/example.ts'): DiffMessage => {
	const patch = structuredPatch(file, file, before, after, undefined, undefined, {context: 3});
	const hunks = patch.hunks.map(({oldStart, oldLines, newStart, newLines, lines}) => ({
		oldStart,
		oldLines,
		newStart,
		newLines,
		lines,
	}));
	return {
		id: 'diff',
		kind: 'diff',
		file,
		tool: 'Edit',
		presentation: 'patch',
		hunks,
		additions: hunks.reduce((total, hunk) => total + hunk.lines.filter((line) => line.startsWith('+')).length, 0),
		deletions: hunks.reduce((total, hunk) => total + hunk.lines.filter((line) => line.startsWith('-')).length, 0),
		firstLine: after.split('\n', 1)[0] ?? '',
	};
};

const createdPreview = (content: string): DiffMessage => ({
	id: 'write',
	kind: 'diff',
	file: 'src/created.ts',
	tool: 'Write',
	presentation: 'create',
	hunks: [],
	additions: content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length,
	deletions: 0,
	firstLine: content.split('\n', 1)[0] ?? '',
	content,
});

describe('file diff transcript rows', () => {
	it('renders three lines of context, line numbers, syntax color, and semantic change backgrounds', () => {
		const before = Array.from({length: 20}, (_, index) => `const value${index + 1} = ${index + 1};`);
		const after = [...before];
		after[9] = 'const renamed10 = 10;';
		const rows = messageToRows(previewFor(`${before.join('\n')}\n`, `${after.join('\n')}\n`), 72);
		const text = rows.map((row) => rowText(row));

		expect(text[0]).toBe('  ⎿  Added 1 line, removed 1 line');
		expect(text).toContain('  7  const value7 = 7;');
		expect(text).toContain(' 13  const value13 = 13;');
		expect(text.some((line) => line.includes('value6'))).toBe(false);
		expect(text.some((line) => line.includes('value14'))).toBe(false);
		expect(rows.some((row) => row.background === 'addition')).toBe(true);
		expect(rows.some((row) => row.background === 'deletion')).toBe(true);
		expect(rows.some((row) => row.segments.some((segment) => segment.color === 'blue'))).toBe(true);
	});

	it('emphasizes small word changes but not substantially different lines', () => {
		const smallChange = messageToRows(previewFor('const oldName = true;\n', 'const newName = true;\n'), 72);
		expect(smallChange.some((row) => row.segments.some((segment) => segment.background))).toBe(true);

		const replacement = messageToRows(
			previewFor('completely unrelated old text\n', 'brand new replacement value\n'),
			72,
		);
		expect(replacement.some((row) => row.segments.some((segment) => segment.background))).toBe(false);
	});

	it('formats one-sided change counts with the same grammar as Claude Code', () => {
		expect(rowText(messageToRows(previewFor('one\ntwo\n', 'one\n', 'notes.txt'), 60)[0]!)).toBe('  ⎿  Removed 1 line');
		expect(rowText(messageToRows(previewFor('one\n', 'one\ntwo\n', 'notes.txt'), 60)[0]!)).toBe('  ⎿  Added 1 line');
	});

	it('separates distant hunks and never renders untouched middle content', () => {
		const before = Array.from({length: 40}, (_, index) => `line ${index + 1}`);
		const after = [...before];
		after[4] = 'changed five';
		after[34] = 'changed thirty five';
		const text = messageToRows(previewFor(`${before.join('\n')}\n`, `${after.join('\n')}\n`, 'notes.txt'), 60).map(
			(row) => rowText(row),
		);

		expect(text).toContain('...');
		expect(text.some((line) => line.includes('line 20'))).toBe(false);
	});

	it('hard-wraps long code within terminal width and keeps gutters non-selectable', () => {
		const rows = messageToRows(
			previewFor('const oldName = "short";\n', `const newName = "${'wide '.repeat(12)}";\n`),
			22,
		);

		expect(rows.every((row) => stringWidth(rowText(row)) <= 20)).toBe(true);
		expect(rows.filter((row) => row.background === 'addition').length).toBeGreaterThan(1);
		expect(
			rows.filter((row) => row.background === 'addition').every((row) => row.segments[0]?.selectable === false),
		).toBe(true);
		const addition = rows.find((row) => row.background === 'addition')!;
		expect(
			selectedText([addition], {
				anchor: {row: 0, column: 0},
				focus: {row: 0, column: 100},
				mode: 'line',
				dragging: false,
			}),
		).not.toMatch(/^\s*\d*\s*\+/u);
	});

	it('drops line numbers before code at very narrow widths', () => {
		const message: DiffMessage = {
			id: 'narrow',
			kind: 'diff',
			file: 'src/example.ts',
			tool: 'Edit',
			presentation: 'patch',
			hunks: [
				{
					oldStart: 123_456,
					oldLines: 1,
					newStart: 123_456,
					newLines: 1,
					lines: ['-const old = "界";', '+const next = "界";'],
				},
			],
			additions: 1,
			deletions: 1,
		};
		const rows = messageToRows(message, 10);

		expect(rows.every((row) => stringWidth(rowText(row)) <= 8)).toBe(true);
		expect(rows.filter((row) => row.background).every((row) => /^[+-]/u.test(rowText(row)))).toBe(true);
	});

	it('shows ten syntax-highlighted lines for a created file and expands all content', () => {
		const content = `${Array.from({length: 12}, (_, index) => `const value${index + 1} = ${index + 1};`).join('\n')}\n`;
		const preview = createdPreview(content);
		const collapsed = messageToRows(preview, 60);
		const expanded = messageToRows(preview, 60, true);

		expect(collapsed.map((row) => rowText(row))).toContain('… +2 lines (ctrl+o to expand)');
		expect(collapsed.some((row) => rowText(row).includes('value11'))).toBe(false);
		expect(collapsed.some((row) => row.segments.some((segment) => segment.color === 'blue'))).toBe(true);
		expect(expanded.some((row) => rowText(row).includes('value12'))).toBe(true);
		expect(expanded.some((row) => rowText(row).includes('ctrl+o to expand'))).toBe(false);
	});

	it('shows the Claude-compatible empty-file fallback', () => {
		const preview = createdPreview('');

		expect(messageToRows(preview, 60).map((row) => rowText(row))).toEqual(['  ⎿  Wrote 1 line', ' 1 (No content)']);
	});

	it('renders a compact fallback instead of dumping file contents when diffing is unavailable', () => {
		const message: DiffMessage = {
			id: 'unavailable',
			kind: 'diff',
			file: 'src/example.ts',
			tool: 'Edit',
			presentation: 'patch',
			hunks: [],
			additions: 0,
			deletions: 0,
			unavailable: true,
		};

		expect(messageToRows(message, 60).map((row) => rowText(row))).toEqual(['  ⎿  Diff preview unavailable']);
	});
});
