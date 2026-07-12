import stringWidth from 'string-width';
import type {RowSegment, SelectionState, TextPoint, TranscriptRow} from '../types.js';
import {graphemeAtColumn, overlapsColumns, terminalGraphemes} from './terminal-cells.js';

export type SelectedSegment = RowSegment & {selected?: boolean};

const orderPoints = (a: TextPoint, b: TextPoint): [TextPoint, TextPoint] =>
	a.row < b.row || (a.row === b.row && a.column <= b.column) ? [a, b] : [b, a];

export const selectionColumnsForRow = (
	selection: SelectionState | null,
	rowIndex: number,
	rowWidth: number,
): [number, number] | null => {
	if (!selection) return null;
	const [start, end] = orderPoints(selection.anchor, selection.focus);
	if (rowIndex < start.row || rowIndex > end.row) return null;
	const from = rowIndex === start.row ? start.column : 0;
	const to = rowIndex === end.row ? end.column + 1 : rowWidth;
	return [Math.max(0, from), Math.max(from, to)];
};

export const splitSegmentsForSelection = (
	segments: readonly RowSegment[],
	columns: [number, number] | null,
): SelectedSegment[] => {
	if (!columns) return [...segments];
	const [selectionStart, selectionEnd] = columns;
	const output: SelectedSegment[] = [];
	let cursor = 0;

	for (const segment of segments) {
		const graphemes = terminalGraphemes(segment.text, cursor);
		cursor += stringWidth(segment.text);
		const segmentOutputStart = output.length;
		for (const grapheme of graphemes) {
			const selected = segment.selectable !== false && overlapsColumns(grapheme, selectionStart, selectionEnd);
			const previous = output.length > segmentOutputStart ? output.at(-1) : undefined;
			if (previous && previous.selected === (selected || undefined)) {
				previous.text += grapheme.text;
			} else {
				output.push({...segment, text: grapheme.text, ...(selected ? {selected: true} : {})});
			}
		}
	}

	return output;
};

export const selectedText = (rows: readonly TranscriptRow[], selection: SelectionState | null): string => {
	if (!selection) return '';
	const [start, end] = orderPoints(selection.anchor, selection.focus);
	const lines: string[] = [];

	for (let rowIndex = start.row; rowIndex <= end.row; rowIndex++) {
		const row = rows[rowIndex];
		if (!row) continue;
		const from = rowIndex === start.row ? start.column : 0;
		const to = rowIndex === end.row ? end.column + 1 : Number.POSITIVE_INFINITY;
		let column = 0;
		const text: string[] = [];
		for (const segment of row.segments) {
			const graphemes = terminalGraphemes(segment.text, column);
			column += stringWidth(segment.text);
			if (segment.selectable === false) continue;
			for (const grapheme of graphemes) {
				if (overlapsColumns(grapheme, from, to)) text.push(grapheme.text);
			}
		}
		lines.push(text.join('').replace(/\s+$/u, ''));
	}

	return lines.join('\n');
};

export const wordSelection = (row: TranscriptRow, rowIndex: number, column: number): SelectionState => {
	const text = row.segments.map((segment) => segment.text).join('');
	const graphemes = terminalGraphemes(text);
	let start = graphemeAtColumn(graphemes, column);
	if (start < 0) {
		return {anchor: {row: rowIndex, column: 0}, focus: {row: rowIndex, column: 0}, mode: 'word', dragging: false};
	}
	let end = start;
	const isWord = (value: string | undefined) => Boolean(value && /[\p{L}\p{N}_$-]/u.test(value));

	if (isWord(graphemes[start]?.text)) {
		while (start > 0 && isWord(graphemes[start - 1]?.text)) start--;
		while (end + 1 < graphemes.length && isWord(graphemes[end + 1]?.text)) end++;
	}

	return {
		anchor: {row: rowIndex, column: graphemes[start]?.startColumn ?? 0},
		focus: {row: rowIndex, column: Math.max(0, (graphemes[end]?.endColumn ?? 1) - 1)},
		mode: 'word',
		dragging: false,
	};
};

export const lineSelection = (row: TranscriptRow, rowIndex: number): SelectionState => ({
	anchor: {row: rowIndex, column: 0},
	focus: {row: rowIndex, column: Math.max(0, stringWidth(row.segments.map((segment) => segment.text).join('')) - 1)},
	mode: 'line',
	dragging: false,
});
