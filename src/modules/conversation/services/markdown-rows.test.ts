import stringWidth from 'string-width';
import {describe, expect, it} from 'vitest';
import type {AssistantMessage, RowSegment, TranscriptRow} from '../types.js';
import {markdownRows} from './markdown-rows.js';
import {rowText} from './row-model.js';

const assistant: AssistantMessage = {
	id: 'markdown-test',
	kind: 'assistant',
	variant: 'text',
	content: '',
};

const render = (content: string, width = 80): TranscriptRow[] => markdownRows({...assistant, content}, content, width);

const allSegments = (rows: readonly TranscriptRow[]): RowSegment[] => rows.flatMap((row) => row.segments);

describe('markdown rows', () => {
	it('renders CommonMark and GFM inline tokens without marker text', () => {
		const rows = render(
			'**bold** *italic* ~~gone~~ `code` [site](https://example.com/a_(b)) <https://example.com> \\*literal\\*',
			160,
		);
		const segments = allSegments(rows);

		expect(rows.map((row) => rowText(row))).toEqual(['bold italic gone code site https://example.com *literal*']);
		expect(segments.find((segment) => segment.text === 'bold')?.bold).toBe(true);
		expect(segments.find((segment) => segment.text === 'italic')?.italic).toBe(true);
		expect(segments.find((segment) => segment.text === 'gone')?.strikethrough).toBe(true);
		expect(segments.find((segment) => segment.text === 'code')?.tone).toBe('code');
		expect(segments.find((segment) => segment.text === 'site')).toMatchObject({
			link: 'https://example.com/a_(b)',
			tone: 'accent',
			underline: true,
		});
		expect(segments.find((segment) => segment.text === 'https://example.com')?.link).toBe('https://example.com');
	});

	it('applies heading hierarchy and preserves source line breaks', () => {
		const rows = render('# Primary\n\n## Secondary\n\nsoft\nline\n\nhard  \nbreak');

		expect(rows.map((row) => rowText(row))).toEqual([
			'Primary',
			'',
			'Secondary',
			'',
			'soft',
			'line',
			'',
			'hard',
			'break',
		]);
		expect(rows[0]?.segments[0]).toMatchObject({bold: true, italic: true, underline: true});
		expect(rows[2]?.segments[0]).toMatchObject({bold: true});
	});

	it('renders GFM bare autolinks and image targets as terminal links', () => {
		const rows = render(
			'Visit www.example.com or person@example.com. ![diagram](https://example.com/diagram.png)',
			120,
		);
		const segments = allSegments(rows);

		expect(segments.find((segment) => segment.text === 'www.example.com')?.link).toBe('http://www.example.com');
		expect(segments.find((segment) => segment.text === 'person@example.com')?.link).toBe('mailto:person@example.com');
		expect(segments.find((segment) => segment.text === 'https://example.com/diagram.png')?.link).toBe(
			'https://example.com/diagram.png',
		);
	});

	it('renders nested ordered lists, tasks, and hanging indentation', () => {
		const rows = render('3. third\n   1. nested\n   2. [x] done\n4. fourth', 40);

		expect(rows.map((row) => rowText(row))).toEqual(['3. third', '   a. nested', '   b. [x] done', '4. fourth']);
		expect(rows[2]?.segments.find((segment) => segment.text === 'b. [x] ')?.selectable).toBe(false);

		const wrapped = render('- a list item whose content wraps onto another visual row', 24);
		expect(rowText(wrapped[0]!)).toMatch(/^- /u);
		expect(rowText(wrapped[1]!)).toMatch(/^ {2}\S/u);
		expect(wrapped.every((row) => stringWidth(rowText(row)) <= 24)).toBe(true);
	});

	it('renders recursive blockquotes with a bar and inherited emphasis', () => {
		const rows = render('> A **bold** quote\n>\n> - nested');

		expect(rows.map((row) => rowText(row))).toEqual(['▎ A bold quote', '▎ ', '▎ - nested']);
		expect(rows[0]?.segments.find((segment) => segment.text === 'bold')).toMatchObject({
			bold: true,
			italic: true,
		});
		expect(rows.every((row) => row.segments[0]?.selectable === false)).toBe(true);
	});

	it('renders fitting GFM tables horizontally within the requested width', () => {
		const rows = render('| Name | Value |\n|:--|--:|\n| alpha | [docs](https://example.com) |\n| beta | 7 |', 48);

		expect(rowText(rows[0]!)).toMatch(/^┌/u);
		expect(rowText(rows.at(-1)!)).toMatch(/^└/u);
		expect(rows.some((row) => rowText(row).includes('alpha'))).toBe(true);
		expect(allSegments(rows).find((segment) => segment.text === 'docs')?.link).toBe('https://example.com');
		expect(rows.every((row) => stringWidth(rowText(row)) <= 48)).toBe(true);
	});

	it('switches narrow GFM tables to vertical records', () => {
		const rows = render(
			'| Name | Value |\n|:--|--:|\n| alpha | a long value that needs wrapping again |\n| beta | second |',
			16,
		);
		const text = rows.map((row) => rowText(row));

		expect(text).toContain('Name: alpha');
		expect(text.some((line) => line.startsWith('Value:'))).toBe(true);
		expect(text.some((line) => line.startsWith('─'))).toBe(true);
		expect(text.some((line) => line.includes('┌'))).toBe(false);
		expect(allSegments(rows).find((segment) => segment.text === 'Name:')?.bold).toBe(true);
		expect(rows.every((row) => stringWidth(rowText(row)) <= 16)).toBe(true);
	});

	it('keeps long vertical-table labels and values inside narrow layouts', () => {
		const rows = render('| Exceptionally long heading |\n|---|\n| value |', 10);

		expect(rows.map((row) => rowText(row)).join('')).toContain('Exceptionally');
		expect(rows.map((row) => rowText(row)).join('')).toContain('value');
		expect(rows.every((row) => stringWidth(rowText(row)) <= 10)).toBe(true);
	});

	it('shows raw HTML literally without interpreting markdown inside block HTML', () => {
		const rows = render('Before <kbd>Ctrl</kbd> after\n\n<div>\nraw & **markdown**\n</div>');

		expect(rows.map((row) => rowText(row))).toEqual([
			'Before <kbd>Ctrl</kbd> after',
			'',
			'<div>',
			'raw & **markdown**',
			'</div>',
		]);
		expect(allSegments(rows).some((segment) => segment.bold)).toBe(false);
	});

	it('converts fenced-code ANSI highlighting into plain structured segments', () => {
		const rows = render('```ts\nconst message = "hello";\n```', 40);
		const segments = allSegments(rows);

		expect(rows.map((row) => rowText(row))).toEqual(['const message = "hello";']);
		expect(segments.find((segment) => segment.text === 'const')?.color).toBe('blue');
		expect(segments.find((segment) => segment.text === '"hello"')?.color).toBe('red');
		expect(rows.every((row) => row.background === undefined)).toBe(true);
		expect(segments.every((segment) => !segment.text.includes('\u001B'))).toBe(true);

		const unknown = render('```not-a-language\nconst plain = true;\n```');
		expect(allSegments(unknown).every((segment) => segment.color === undefined)).toBe(true);
	});

	it('removes terminal control characters from markdown content', () => {
		const rows = render('safe\u001B]8;;https://attacker.invalid\u0007text');

		expect(rows.map((row) => rowText(row))).toEqual(['safe]8;;https://attacker.invalidtext']);
		expect(allSegments(rows).every((segment) => !/[\u0000-\u001F\u007F-\u009F]/u.test(segment.text))).toBe(true);
	});
});
