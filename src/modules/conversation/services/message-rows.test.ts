import {describe, expect, it} from 'vitest';
import type {ToolMessage} from '../types.js';
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
		expect(lines.map((line) => line.map((segment) => segment.text).join(''))).toEqual(['alpha beta ', 'gamma']);
	});

	it('renders every supported message kind into fixed-height rows', () => {
		const rows = messagesToRows(demoMessages, 72);
		expect(rows.length).toBeGreaterThan(demoMessages.length);
		expect(new Set(rows.map((row) => row.messageKind))).toEqual(
			new Set(['user', 'assistant', 'tool', 'system', 'diff']),
		);
		expect(rows.some((row) => rowText(row).includes('source/server.ts'))).toBe(true);
	});

	it('renders markdown code as code-background rows', () => {
		const message = demoMessages.find((item) => item.id === 'assistant-1');
		expect(message).toBeDefined();
		const rows = messageToRows(message!, 60);
		expect(rows.some((row) => row.background === 'code')).toBe(true);
	});

	it('collapses successful tool details to three visual rows with an accurate expansion hint', () => {
		const rows = messageToRows(toolMessage('success', 8), 80);
		expect(rows.map((row) => rowText(row))).toEqual([
			'✓ ExecCommand  print output',
			'  ⎿  output 1',
			'  ⎿  output 2',
			'  ⎿  output 3',
			'  ⎿  … +5 lines (ctrl+o to expand)',
		]);
	});

	it('shows four successful detail rows when only one row would be hidden', () => {
		const rows = messageToRows(toolMessage('success', 4), 80);
		expect(rows.map((row) => rowText(row))).toEqual([
			'✓ ExecCommand  print output',
			'  ⎿  output 1',
			'  ⎿  output 2',
			'  ⎿  output 3',
			'  ⎿  output 4',
		]);
	});

	it('allows ten diagnostic rows and expands all tool details on demand', () => {
		const message = toolMessage('error', 12);
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

	it('adds one blank row above and below command activity', () => {
		const read = (id: string): ToolMessage => ({
			id,
			kind: 'tool',
			name: 'Read',
			status: 'success',
			summary: `/workspace/${id}.ts`,
			group: 'read',
		});
		const command = {...toolMessage('success', 0), id: 'command'};

		const rows = messagesToRows([read('before'), command, read('after')], 80);

		expect(rows.map((row) => rowText(row))).toEqual([
			'✓ Read  /workspace/before.ts',
			'',
			'✓ ExecCommand  print output',
			'',
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
