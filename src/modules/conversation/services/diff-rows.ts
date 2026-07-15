import {diffWordsWithSpace} from 'diff';
import stringWidth from 'string-width';
import type {DiffHunk, DiffMessage, RowSegment, TranscriptRow} from '../types.js';
import {makeRow} from './row-model.js';
import {cleanCodeText, highlightCode, languageForFile} from './syntax-highlighting.js';
import {terminalGraphemes} from './terminal-cells.js';
import {wrapSegments} from './wrapping.js';

const CREATED_FILE_PREVIEW_LINES = 10;
const WORD_DIFF_THRESHOLD = 0.4;
const WORD_DIFF_TIMEOUT_MS = 100;

type DiffLineKind = 'add' | 'remove' | 'context' | 'metadata';
type TextRange = readonly [start: number, end: number];

type DiffLine = {
	kind: DiffLineKind;
	code: string;
	lineNumber?: number;
	emphasis?: TextRange[];
};

type CreatedDiffMessage = Extract<DiffMessage, {presentation: 'create'}>;

const sameSegmentStyle = (left: RowSegment, right: RowSegment): boolean =>
	left.tone === right.tone &&
	left.color === right.color &&
	left.bold === right.bold &&
	left.dim === right.dim &&
	left.italic === right.italic &&
	left.underline === right.underline &&
	left.strikethrough === right.strikethrough &&
	left.selectable === right.selectable &&
	left.link === right.link &&
	left.background === right.background;

const appendText = (segments: RowSegment[], segment: RowSegment, text: string): void => {
	if (!text) return;
	const previous = segments.at(-1);
	if (previous && sameSegmentStyle(previous, segment)) previous.text += text;
	else segments.push({...segment, text});
};

/** Hard-wrap code by terminal cells without trimming or reflowing its whitespace. */
export const wrapCodeSegments = (segments: readonly RowSegment[], width: number): RowSegment[][] => {
	const safeWidth = Math.max(1, Math.floor(width));
	const rows: RowSegment[][] = [[]];
	let column = 0;

	for (const segment of segments) {
		for (const grapheme of terminalGraphemes(segment.text)) {
			if (grapheme.text === '\n') {
				rows.push([]);
				column = 0;
				continue;
			}
			const graphemeWidth = stringWidth(grapheme.text);
			if (column > 0 && column + graphemeWidth > safeWidth) {
				rows.push([]);
				column = 0;
			}
			appendText(rows.at(-1)!, segment, grapheme.text);
			column += graphemeWidth;
		}
	}

	return rows;
};

const countLabel = (count: number): string => (count === 1 ? 'line' : 'lines');

const summarySegments = (message: DiffMessage): RowSegment[] => {
	const prefix: RowSegment = {text: '  ⎿  ', tone: 'subtle', selectable: false};
	if (message.unavailable) {
		return [prefix, {text: 'Diff preview unavailable', tone: 'warning'}];
	}
	if (message.presentation === 'create') {
		return [
			prefix,
			{text: 'Wrote ', tone: 'muted'},
			{text: String(message.additions), tone: 'text', bold: true},
			{text: ` ${countLabel(message.additions)}`, tone: 'muted'},
		];
	}

	const segments: RowSegment[] = [prefix];
	if (message.additions > 0) {
		segments.push(
			{text: 'Added ', tone: 'muted'},
			{text: String(message.additions), tone: 'addition', bold: true},
			{text: ` ${countLabel(message.additions)}`, tone: 'muted'},
		);
	}
	if (message.additions > 0 && message.deletions > 0) segments.push({text: ', ', tone: 'muted'});
	if (message.deletions > 0) {
		segments.push(
			{text: message.additions > 0 ? 'removed ' : 'Removed ', tone: 'muted'},
			{text: String(message.deletions), tone: 'deletion', bold: true},
			{text: ` ${countLabel(message.deletions)}`, tone: 'muted'},
		);
	}
	return segments;
};

const textRangesForPair = (removed: string, added: string): {removed: TextRange[]; added: TextRange[]} | undefined => {
	const parts = diffWordsWithSpace(removed, added, {ignoreCase: false, timeout: WORD_DIFF_TIMEOUT_MS});
	if (!parts) return undefined;
	const totalLength = removed.length + added.length;
	const changedLength = parts
		.filter((part) => part.added || part.removed)
		.reduce((total, part) => total + part.value.length, 0);
	if (totalLength === 0 || changedLength / totalLength > WORD_DIFF_THRESHOLD) return undefined;

	const removedRanges: TextRange[] = [];
	const addedRanges: TextRange[] = [];
	let removedOffset = 0;
	let addedOffset = 0;
	for (const part of parts) {
		if (part.removed) {
			removedRanges.push([removedOffset, removedOffset + part.value.length]);
			removedOffset += part.value.length;
			continue;
		}
		if (part.added) {
			addedRanges.push([addedOffset, addedOffset + part.value.length]);
			addedOffset += part.value.length;
			continue;
		}
		removedOffset += part.value.length;
		addedOffset += part.value.length;
	}
	return {removed: removedRanges, added: addedRanges};
};

const pairAdjacentChanges = (lines: DiffLine[]): void => {
	let index = 0;
	while (index < lines.length) {
		if (lines[index]?.kind !== 'remove') {
			index++;
			continue;
		}

		const removed: DiffLine[] = [];
		while (lines[index]?.kind === 'remove') removed.push(lines[index++]!);
		const added: DiffLine[] = [];
		while (lines[index]?.kind === 'add') added.push(lines[index++]!);
		for (let pairIndex = 0; pairIndex < Math.min(removed.length, added.length); pairIndex++) {
			const removedLine = removed[pairIndex]!;
			const addedLine = added[pairIndex]!;
			const ranges = textRangesForPair(removedLine.code, addedLine.code);
			if (!ranges) continue;
			removedLine.emphasis = ranges.removed;
			addedLine.emphasis = ranges.added;
		}
	}
};

const linesFromHunk = (hunk: DiffHunk): DiffLine[] => {
	const lines: DiffLine[] = [];
	let oldLine = hunk.oldStart;
	let newLine = hunk.newStart;
	for (const rawLine of hunk.lines) {
		const marker = rawLine[0];
		if (marker === '+') {
			lines.push({kind: 'add', code: cleanCodeText(rawLine.slice(1)), lineNumber: newLine++});
		} else if (marker === '-') {
			lines.push({kind: 'remove', code: cleanCodeText(rawLine.slice(1)), lineNumber: oldLine++});
		} else if (marker === ' ') {
			lines.push({kind: 'context', code: cleanCodeText(rawLine.slice(1)), lineNumber: newLine});
			oldLine++;
			newLine++;
		} else {
			lines.push({kind: 'metadata', code: cleanCodeText(rawLine)});
		}
	}
	pairAdjacentChanges(lines.filter((line) => line.kind !== 'metadata'));
	return lines;
};

const segmentsWithBackground = (
	segments: readonly RowSegment[],
	ranges: readonly TextRange[] | undefined,
	background: NonNullable<RowSegment['background']>,
): RowSegment[] => {
	if (!ranges || ranges.length === 0) return [...segments];
	const output: RowSegment[] = [];
	let offset = 0;
	for (const segment of segments) {
		const segmentStart = offset;
		const segmentEnd = segmentStart + segment.text.length;
		const boundaries = new Set([segmentStart, segmentEnd]);
		for (const [start, end] of ranges) {
			if (start > segmentStart && start < segmentEnd) boundaries.add(start);
			if (end > segmentStart && end < segmentEnd) boundaries.add(end);
		}
		const sorted = [...boundaries].sort((left, right) => left - right);
		for (let index = 0; index < sorted.length - 1; index++) {
			const start = sorted[index]!;
			const end = sorted[index + 1]!;
			const text = segment.text.slice(start - segmentStart, end - segmentStart);
			const emphasized = ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart);
			appendText(output, emphasized ? {...segment, background} : segment, text);
		}
		offset = segmentEnd;
	}
	return output;
};

const syntaxSegments = (line: DiffLine, language: string | undefined): RowSegment[] => {
	if (line.kind === 'metadata') return [{text: line.code, tone: 'muted', dim: true}];
	const base =
		line.kind === 'remove'
			? [{text: line.code, tone: 'code' as const}]
			: (highlightCode(line.code, language)[0] ?? [{text: line.code, tone: 'code' as const}]);
	if (line.kind === 'context') return base.map((segment) => ({...segment, dim: true}));
	return segmentsWithBackground(base, line.emphasis, line.kind === 'add' ? 'addition' : 'deletion');
};

const markerFor = (kind: DiffLineKind): string => (kind === 'add' ? '+' : kind === 'remove' ? '-' : ' ');

const gutterSegments = (line: DiffLine, digits: number, continuation: boolean, compact: boolean): RowSegment[] => {
	const marker = markerFor(line.kind);
	const markerTone = line.kind === 'add' ? 'addition' : line.kind === 'remove' ? 'deletion' : 'subtle';
	if (compact)
		return [{text: marker, tone: markerTone, bold: line.kind === 'add' || line.kind === 'remove', selectable: false}];
	const number =
		continuation || line.lineNumber === undefined ? ' '.repeat(digits) : String(line.lineNumber).padStart(digits);
	return [
		{text: ` ${number} `, tone: 'subtle', dim: true, selectable: false},
		{text: marker, tone: markerTone, bold: line.kind === 'add' || line.kind === 'remove', selectable: false},
	];
};

const maxLineNumber = (hunk: DiffHunk): number =>
	Math.max(hunk.oldStart + Math.max(0, hunk.oldLines - 1), hunk.newStart + Math.max(0, hunk.newLines - 1), 1);

const renderHunk = (
	message: DiffMessage,
	hunk: DiffHunk,
	width: number,
	language: string | undefined,
	startIndex: number,
): TranscriptRow[] => {
	const lines = linesFromHunk(hunk);
	const digits = String(maxLineNumber(hunk)).length;
	const fullGutterWidth = digits + 3;
	const compact = fullGutterWidth > width - 2;
	const gutterWidth = compact ? 1 : fullGutterWidth;
	const codeWidth = Math.max(1, width - gutterWidth);
	const rows: TranscriptRow[] = [];

	for (const line of lines) {
		if (line.kind === 'metadata') {
			for (const segments of wrapCodeSegments(syntaxSegments(line, language), width)) {
				rows.push(makeRow(message, startIndex + rows.length, segments));
			}
			continue;
		}

		const wrapped = wrapCodeSegments(syntaxSegments(line, language), codeWidth);
		for (const [wrappedIndex, content] of wrapped.entries()) {
			const background = line.kind === 'add' ? 'addition' : line.kind === 'remove' ? 'deletion' : undefined;
			rows.push(
				makeRow(
					message,
					startIndex + rows.length,
					[...gutterSegments(line, digits, wrappedIndex > 0, compact), ...content],
					background,
				),
			);
		}
	}
	return rows;
};

const contentLines = (content: string): string[] => {
	const clean = cleanCodeText(content);
	const displayed = clean || '(No content)';
	const lines = displayed.split('\n');
	if (displayed.endsWith('\n')) lines.pop();
	return lines;
};

const createdFileRows = (
	message: CreatedDiffMessage,
	width: number,
	expanded: boolean,
	startIndex: number,
): TranscriptRow[] => {
	const lines = contentLines(message.content);
	const visibleCount = expanded ? lines.length : Math.min(CREATED_FILE_PREVIEW_LINES, lines.length);
	const visibleLines = lines.slice(0, visibleCount);
	const language = languageForFile(message.file, message.firstLine);
	const highlighted = highlightCode(visibleLines.join('\n'), language);
	const digits = String(Math.max(1, lines.length)).length;
	const fullGutterWidth = digits + 2;
	const showGutter = fullGutterWidth <= width - 2;
	const codeWidth = Math.max(1, width - (showGutter ? fullGutterWidth : 0));
	const rows: TranscriptRow[] = [];

	for (const [lineIndex, line] of visibleLines.entries()) {
		const base = highlighted[lineIndex] ?? [{text: line, tone: 'code' as const}];
		const wrapped = wrapCodeSegments(base, codeWidth);
		for (const [wrappedIndex, content] of wrapped.entries()) {
			const gutter: RowSegment[] = showGutter
				? [
						{
							text: ` ${wrappedIndex === 0 ? String(lineIndex + 1).padStart(digits) : ' '.repeat(digits)} `,
							tone: 'subtle',
							dim: true,
							selectable: false,
						},
					]
				: [];
			rows.push(makeRow(message, startIndex + rows.length, [...gutter, ...content]));
		}
	}

	const hiddenCount = lines.length - visibleCount;
	if (hiddenCount > 0) {
		const hiddenSegments: RowSegment[] = [
			{
				text: `… +${hiddenCount} ${countLabel(hiddenCount)} (ctrl+o to expand)`,
				tone: 'muted',
				selectable: false,
			},
		];
		for (const segments of wrapSegments(hiddenSegments, width)) {
			rows.push(makeRow(message, startIndex + rows.length, segments));
		}
	}
	return rows;
};

const firstPatchCodeLine = (message: DiffMessage): string | undefined => {
	for (const hunk of message.hunks) {
		for (const line of hunk.lines) {
			if (line[0] === ' ' || line[0] === '+' || line[0] === '-') return cleanCodeText(line.slice(1));
		}
	}
	return undefined;
};

export const diffMessageToRows = (message: DiffMessage, width: number, expanded = false): TranscriptRow[] => {
	const safeWidth = Math.max(1, Math.floor(width));
	const rows = wrapCodeSegments(summarySegments(message), safeWidth).map((segments, index) =>
		makeRow(message, index, segments),
	);
	if (message.unavailable) return rows;

	if (message.presentation === 'create') {
		rows.push(...createdFileRows(message, safeWidth, expanded, rows.length));
		return rows;
	}

	const language = languageForFile(message.file, message.firstLine ?? firstPatchCodeLine(message));
	for (const [hunkIndex, hunk] of message.hunks.entries()) {
		if (hunkIndex > 0) {
			rows.push(makeRow(message, rows.length, [{text: '...', tone: 'muted', dim: true, selectable: false}]));
		}
		rows.push(...renderHunk(message, hunk, safeWidth, language, rows.length));
	}
	return rows;
};
