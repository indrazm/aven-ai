import {describe, expect, it} from 'vitest';
import stringWidth from 'string-width';
import type {AssistantMessage, ToolMessage} from '../types.js';
import {demoMessages} from '../fixtures.js';
import {messageToRows, messagesToRows, rowText, wrapSegments} from './message-rows.js';

const toolMessage = (status: ToolMessage['status'], lineCount: number): ToolMessage => ({
	id: `tool-${status}`,
	kind: 'tool',
	name: 'ExecCommand',
	status,
	summary: 'print output',
	detail: Array.from({length: lineCount}, (_, index) => `output ${index + 1}`).join('\n'),
	group: 'bash',
});

describe('transcript row model', () => {
	it('wraps content to terminal width', () => {
		const lines = wrapSegments([{text: 'alpha beta gamma'}], 10);
		expect(lines.map((line) => line.map((segment) => segment.text).join(''))).toEqual(['alpha beta', 'gamma']);
	});

	it('renders every supported message kind into fixed-height rows', () => {
		const rows = messagesToRows(demoMessages, 72);
		expect(rows.length).toBeGreaterThan(demoMessages.length);
		expect(new Set(rows.map((row) => row.messageKind))).toEqual(
			new Set(['user', 'assistant', 'tool', 'system', 'diff']),
		);
		expect(rows.some((row) => rowText(row).includes('Added 1 line, removed 1 line'))).toBe(true);
	});

	it('renders fenced code with language-aware segment colors', () => {
		const message = demoMessages.find((item) => item.id === 'assistant-1');
		expect(message).toBeDefined();
		const rows = messageToRows(message!, 60);
		expect(rows.every((row) => row.background !== 'code')).toBe(true);
		expect(rows.some((row) => row.segments.some((segment) => segment.color))).toBe(true);
	});

	it('keeps the assistant marker in a fixed gutter on every visual row', () => {
		const message: AssistantMessage = {
			id: 'assistant-gutter',
			kind: 'assistant',
			variant: 'text',
			content: '# Heading\n\nA paragraph that wraps across several visual rows at this width.',
		};
		const rows = messageToRows(message, 30);

		expect(rowText(rows[0]!)).toMatch(/^● /u);
		expect(rows.slice(1).every((row) => rowText(row).startsWith('  '))).toBe(true);
		expect(rows.every((row) => stringWidth(rowText(row)) <= 28)).toBe(true);
	});

	it('hides successful command output by default and reveals it on expansion', () => {
		const message = toolMessage('success', 8);
		const collapsed = messageToRows(message, 80);
		expect(collapsed.map((row) => rowText(row))).toEqual(['✓ ExecCommand  print output']);
		expect(collapsed[0]?.segments).toEqual(
			expect.arrayContaining([expect.objectContaining({text: 'ExecCommand', tone: 'tool', bold: true})]),
		);

		const expanded = messageToRows(message, 80, true);
		expect(expanded.map((row) => rowText(row))).toEqual([
			'✓ ExecCommand  print output',
			'  ⎿  output 1',
			'  ⎿  output 2',
			'  ⎿  output 3',
			'  ⎿  output 4',
			'  ⎿  output 5',
			'  ⎿  output 6',
			'  ⎿  output 7',
			'  ⎿  output 8',
		]);
	});

	it('hides failed command output by default and reveals it on expansion', () => {
		const message = toolMessage('error', 2);

		expect(messageToRows(message, 80).map((row) => rowText(row))).toEqual(['× ExecCommand  print output']);
		expect(messageToRows(message, 80, true).map((row) => rowText(row))).toEqual([
			'× ExecCommand  print output',
			'  ⎿  output 1',
			'  ⎿  output 2',
		]);
	});

	it('truncates a long tool input preview to one visual row', () => {
		const message = {...toolMessage('success', 0), summary: 'alpha beta gamma delta epsilon'};
		const rows = messageToRows(message, 28);

		expect(rows).toHaveLength(1);
		expect(rowText(rows[0]!)).toBe('✓ ExecCommand  alpha beta…');
		expect(stringWidth(rowText(rows[0]!))).toBeLessThanOrEqual(26);
	});

	it('truncates multiline tool input previews to one row', () => {
		const message = {...toolMessage('success', 0), summary: 'first line\nsecond line'};
		const rows = messageToRows(message, 80);

		expect(rows).toHaveLength(1);
		expect(rowText(rows[0]!)).toBe('✓ ExecCommand  first line…');
	});

	it('shows four successful non-command detail rows when only one row would be hidden', () => {
		const message = {...toolMessage('success', 4), name: 'OtherTool'};
		const rows = messageToRows(message, 80);
		expect(rows.map((row) => rowText(row))).toEqual([
			'✓ OtherTool  print output',
			'  ⎿  output 1',
			'  ⎿  output 2',
			'  ⎿  output 3',
			'  ⎿  output 4',
		]);
	});

	it('allows ten diagnostic rows and expands all tool details on demand', () => {
		const message = {...toolMessage('error', 12), name: 'OtherTool'};
		const collapsed = messageToRows(message, 80);
		expect(collapsed.map((row) => rowText(row))).toContain('  ⎿  … +2 lines (ctrl+o to expand)');
		expect(collapsed.map((row) => rowText(row))).not.toContain('  ⎿  output 11');

		const expanded = messageToRows(message, 80, true);
		expect(expanded.map((row) => rowText(row))).toContain('  ⎿  output 12');
		expect(expanded.some((row) => rowText(row).includes('ctrl+o to expand'))).toBe(false);
	});

	it('counts terminal-width wrapping when limiting tool details', () => {
		const message: ToolMessage = {
			...toolMessage('success', 1),
			name: 'OtherTool',
			detail: '12345678901234567890123456789012345',
		};
		const rows = messageToRows(message, 14);
		expect(rows.at(-1) && rowText(rows.at(-1)!)).toBe('  ⎿  … +2 lines (ctrl+o to expand)');
	});

	it('renders successful reads as one compact row and removes gaps between adjacent activity', () => {
		const read = (id: string): ToolMessage => ({
			id,
			kind: 'tool',
			name: 'Read',
			status: 'success',
			summary: `/workspace/${id}.ts`,
			detail: 'Read 20 of 20 lines from line 1.',
			group: 'read',
		});
		const rows = messagesToRows([read('one'), read('two')], 80);

		expect(rows.map((row) => rowText(row))).toEqual(['✓ Read  /workspace/one.ts', '✓ Read  /workspace/two.ts']);
	});

	it('separates assistant text from command activity while keeping tool calls together', () => {
		const read = (id: string): ToolMessage => ({
			id,
			kind: 'tool',
			name: 'Read',
			status: 'success',
			summary: `/workspace/${id}.ts`,
			group: 'read',
		});
		const command = {...toolMessage('success', 0), id: 'command'};
		const text: AssistantMessage = {
			id: 'assistant-before-tools',
			kind: 'assistant',
			variant: 'text',
			content: 'I will inspect the project.',
		};

		const rows = messagesToRows([text, command, read('after')], 80);

		expect(rows.map((row) => rowText(row))).toEqual([
			'● I will inspect the project.',
			'',
			'✓ ExecCommand  print output',
			'✓ Read  /workspace/after.ts',
		]);
	});

	it('shows file activity relative to the active project', () => {
		const message: ToolMessage = {
			id: 'project-file',
			kind: 'tool',
			name: 'Read',
			status: 'success',
			summary: `${process.cwd()}/src/index.ts`,
			group: 'read',
		};

		expect(rowText(messageToRows(message, 80)[0]!)).toBe('✓ Read  src/index.ts');
	});
});
