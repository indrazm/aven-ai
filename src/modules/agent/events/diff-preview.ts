import {structuredPatch} from 'diff';
import type {DiffHunk, DiffMessage} from '../../conversation/index.js';

const CONTEXT_LINES = 3;
const DIFF_TIMEOUT_MS = 5000;

type DiffPreviewInput = {
	id: string;
	file: string;
	tool: 'Edit' | 'Write';
	operation?: 'create' | 'update';
	before: string;
	after: string;
};

const firstLineOf = (text: string): string => (text.split(/\r?\n/u, 1)[0] ?? '').slice(0, 256);

const previewBase = (input: DiffPreviewInput) => ({
	id: input.id,
	kind: 'diff' as const,
	file: input.file,
	tool: input.tool,
	firstLine: firstLineOf(input.after || input.before),
});

const toDiffHunk = (hunk: {
	oldStart: number;
	oldLines: number;
	newStart: number;
	newLines: number;
	lines: string[];
}): DiffHunk => ({
	oldStart: hunk.oldStart,
	oldLines: hunk.oldLines,
	newStart: hunk.newStart,
	newLines: hunk.newLines,
	lines: hunk.lines,
});

export const countVisibleLines = (content: string): number => {
	const lines = content.split('\n');
	return content.endsWith('\n') ? lines.length - 1 : lines.length;
};

export const buildDiffPreview = (input: DiffPreviewInput): DiffMessage | undefined => {
	if (input.tool === 'Write' && input.operation === 'create') {
		return {
			...previewBase(input),
			tool: 'Write',
			presentation: 'create',
			hunks: [],
			additions: countVisibleLines(input.after),
			deletions: 0,
			content: input.after,
		};
	}
	if (input.before === input.after) return undefined;

	try {
		const patch = structuredPatch(input.file, input.file, input.before, input.after, undefined, undefined, {
			context: CONTEXT_LINES,
			timeout: DIFF_TIMEOUT_MS,
		});
		if (!patch) {
			return {
				...previewBase(input),
				presentation: 'patch',
				hunks: [],
				additions: 0,
				deletions: 0,
				unavailable: true,
			};
		}

		const hunks = patch.hunks.map(toDiffHunk);
		if (hunks.length === 0) {
			return {
				...previewBase(input),
				presentation: 'patch',
				hunks: [],
				additions: 0,
				deletions: 0,
				unavailable: true,
			};
		}
		const additions = hunks.reduce(
			(total, hunk) => total + hunk.lines.filter((line) => line.startsWith('+')).length,
			0,
		);
		const deletions = hunks.reduce(
			(total, hunk) => total + hunk.lines.filter((line) => line.startsWith('-')).length,
			0,
		);
		return {
			...previewBase(input),
			presentation: 'patch',
			hunks,
			additions,
			deletions,
		};
	} catch {
		return {
			...previewBase(input),
			presentation: 'patch',
			hunks: [],
			additions: 0,
			deletions: 0,
			unavailable: true,
		};
	}
};
