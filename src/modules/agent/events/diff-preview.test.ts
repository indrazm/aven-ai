import {describe, expect, it} from 'vitest';
import {buildDiffPreview, countVisibleLines} from './diff-preview.js';

const sourceLines = (count: number): string[] =>
	Array.from({length: count}, (_, index) => `const value${index + 1} = ${index + 1};`);

describe('file diff preview construction', () => {
	it('stores two bounded hunks with three context lines instead of both complete files', () => {
		const beforeLines = sourceLines(40);
		const afterLines = [...beforeLines];
		afterLines[4] = 'const renamed5 = 5;';
		afterLines[34] = 'const renamed35 = 35;';
		const preview = buildDiffPreview({
			id: 'diff',
			file: 'src/example.ts',
			tool: 'Edit',
			before: `${beforeLines.join('\n')}\n`,
			after: `${afterLines.join('\n')}\n`,
		});

		expect(preview).toMatchObject({presentation: 'patch', additions: 2, deletions: 2});
		expect(preview?.hunks).toHaveLength(2);
		expect(preview?.hunks[0]).toMatchObject({oldStart: 2, newStart: 2, oldLines: 7, newLines: 7});
		expect(preview?.hunks[1]).toMatchObject({oldStart: 32, newStart: 32, oldLines: 7, newLines: 7});
		expect(JSON.stringify(preview)).not.toContain('value20');
		expect(preview).not.toHaveProperty('before');
		expect(preview).not.toHaveProperty('after');
	});

	it('keeps new Write content only for the expandable create preview', () => {
		const content = `${sourceLines(12).join('\n')}\n`;
		const preview = buildDiffPreview({
			id: 'diff',
			file: 'src/created.ts',
			tool: 'Write',
			operation: 'create',
			before: '',
			after: content,
		});

		expect(preview).toMatchObject({presentation: 'create', additions: 12, deletions: 0, content, hunks: []});
	});

	it('renders Write updates through the same bounded patch model as Edit', () => {
		const preview = buildDiffPreview({
			id: 'diff',
			file: 'src/updated.ts',
			tool: 'Write',
			operation: 'update',
			before: 'const oldName = true;\n',
			after: 'const newName = true;\n',
		});

		expect(preview).toMatchObject({tool: 'Write', presentation: 'patch', additions: 1, deletions: 1});
		expect(preview).not.toHaveProperty('content');
	});

	it('still previews an empty newly created file', () => {
		expect(
			buildDiffPreview({
				id: 'diff',
				file: 'src/empty.ts',
				tool: 'Write',
				operation: 'create',
				before: '',
				after: '',
			}),
		).toMatchObject({presentation: 'create', additions: 1, content: ''});
	});

	it('treats a trailing newline as a terminator and an empty file as one visible line', () => {
		expect(countVisibleLines('one\ntwo\n')).toBe(2);
		expect(countVisibleLines('one\ntwo')).toBe(2);
		expect(countVisibleLines('')).toBe(1);
	});

	it('does not emit a preview when a mutation made no content change', () => {
		expect(buildDiffPreview({id: 'diff', file: 'a.ts', tool: 'Write', before: 'same', after: 'same'})).toBeUndefined();
	});

	it('caps the shebang hint instead of retaining an entire single-line file', () => {
		const preview = buildDiffPreview({
			id: 'diff',
			file: 'generated',
			tool: 'Edit',
			before: 'old',
			after: 'x'.repeat(1000),
		});
		expect(preview?.firstLine).toHaveLength(256);
	});
});
