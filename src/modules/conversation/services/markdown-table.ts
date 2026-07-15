import type {Token, Tokens} from 'marked';
import stringWidth from 'string-width';
import type {RowSegment} from '../types.js';
import {renderInlineTokens, type SegmentStyle} from './markdown-inline.js';
import {wrapSegments} from './wrapping.js';

const MIN_COLUMN_WIDTH = 3;
const MAX_ROW_LINES = 4;

export type RenderedMarkdownRow = {
	segments: RowSegment[];
};

const structural = (text: string): RowSegment => ({text, tone: 'subtle', selectable: false});
const segmentsWidth = (segments: readonly RowSegment[]): number =>
	segments.reduce((width, segment) => width + stringWidth(segment.text), 0);
const segmentsText = (segments: readonly RowSegment[]): string => segments.map((segment) => segment.text).join('');

const trimSegments = (segments: readonly RowSegment[]): RowSegment[] => {
	const output = segments.map((segment) => ({...segment, text: segment.text.replace(/\n+/gu, ' ')}));
	while (output[0] && !output[0].text.trimStart()) output.shift();
	while (output.at(-1) && !output.at(-1)!.text.trimEnd()) output.pop();
	if (output[0]) output[0] = {...output[0], text: output[0].text.trimStart()};
	if (output.at(-1)) output[output.length - 1] = {...output.at(-1)!, text: output.at(-1)!.text.trimEnd()};
	return output.filter((segment) => segment.text !== '');
};

const cellSegments = (tokens: readonly Token[] | undefined, style: SegmentStyle): RowSegment[] =>
	trimSegments(renderInlineTokens(tokens, style));

const cellMinimumWidth = (segments: readonly RowSegment[]): number => {
	const words = segmentsText(segments).split(/\s+/u).filter(Boolean);
	return Math.max(MIN_COLUMN_WIDTH, ...words.map((word) => stringWidth(word)));
};

const cellIdealWidth = (segments: readonly RowSegment[]): number =>
	Math.max(MIN_COLUMN_WIDTH, stringWidth(segmentsText(segments)));

const allocateWidths = (minimums: number[], ideals: number[], available: number): number[] => {
	const totalIdeal = ideals.reduce((sum, width) => sum + width, 0);
	if (totalIdeal <= available) return ideals;

	const totalMinimum = minimums.reduce((sum, width) => sum + width, 0);
	const widths = totalMinimum <= available ? [...minimums] : minimums.map(() => MIN_COLUMN_WIDTH);
	let remaining = available - widths.reduce((sum, width) => sum + width, 0);
	while (remaining > 0) {
		let bestIndex = -1;
		let bestNeed = 0;
		for (let index = 0; index < widths.length; index++) {
			const need = ideals[index]! - widths[index]!;
			if (need > bestNeed) {
				bestNeed = need;
				bestIndex = index;
			}
		}
		if (bestIndex === -1) break;
		widths[bestIndex]!++;
		remaining--;
	}
	return widths;
};

const paddedCell = (
	segments: readonly RowSegment[],
	targetWidth: number,
	align: 'center' | 'left' | 'right' | null | undefined,
): RowSegment[] => {
	const padding = Math.max(0, targetWidth - segmentsWidth(segments));
	const left = align === 'right' ? padding : align === 'center' ? Math.floor(padding / 2) : 0;
	const right = padding - left;
	return [
		...(left ? [{text: ' '.repeat(left), tone: 'subtle' as const}] : []),
		...segments,
		...(right ? [{text: ' '.repeat(right), tone: 'subtle' as const}] : []),
	];
};

const border = (widths: readonly number[], type: 'bottom' | 'middle' | 'top'): RowSegment[] => {
	const characters: Record<'bottom' | 'middle' | 'top', readonly [string, string, string, string]> = {
		top: ['┌', '─', '┬', '┐'],
		middle: ['├', '─', '┼', '┤'],
		bottom: ['└', '─', '┴', '┘'],
	};
	const [left, middle, cross, right] = characters[type];
	let text = left;
	for (let index = 0; index < widths.length; index++) {
		text += middle.repeat(widths[index]! + 2);
		text += index < widths.length - 1 ? cross : right;
	}
	return [structural(text)];
};

const horizontalRows = (
	table: Tokens.Table,
	cellRows: RowSegment[][][],
	widths: number[],
	prefix: readonly RowSegment[],
): RenderedMarkdownRow[] => {
	const output: RenderedMarkdownRow[] = [{segments: [...prefix, ...border(widths, 'top')]}];
	const renderRow = (cells: RowSegment[][], header: boolean): RenderedMarkdownRow[] => {
		const wrapped = widths.map((width, index) => wrapSegments(cells[index] ?? [], width));
		const height = Math.max(1, ...wrapped.map((lines) => lines.length));
		const offsets = wrapped.map((lines) => Math.floor((height - lines.length) / 2));
		return Array.from({length: height}, (_, lineIndex) => {
			const segments: RowSegment[] = [...prefix, structural('│')];
			for (let column = 0; column < widths.length; column++) {
				const contentIndex = lineIndex - offsets[column]!;
				const content = contentIndex >= 0 ? (wrapped[column]?.[contentIndex] ?? []) : [];
				segments.push(
					{text: ' ', tone: 'subtle'},
					...paddedCell(content, widths[column]!, header ? 'center' : table.align[column]),
					{text: ' ', tone: 'subtle'},
					structural('│'),
				);
			}
			return {segments};
		});
	};

	output.push(...renderRow(cellRows[0]!, true));
	output.push({segments: [...prefix, ...border(widths, 'middle')]});
	for (let index = 1; index < cellRows.length; index++) {
		output.push(...renderRow(cellRows[index]!, false));
		if (index < cellRows.length - 1) output.push({segments: [...prefix, ...border(widths, 'middle')]});
	}
	output.push({segments: [...prefix, ...border(widths, 'bottom')]});
	return output;
};

const verticalRows = (
	cellRows: RowSegment[][][],
	width: number,
	prefix: readonly RowSegment[],
): RenderedMarkdownRow[] => {
	const output: RenderedMarkdownRow[] = [];
	const prefixWidth = segmentsWidth(prefix);
	const available = Math.max(1, width - prefixWidth);
	const headers = cellRows[0]!;
	for (let rowIndex = 1; rowIndex < cellRows.length; rowIndex++) {
		if (rowIndex > 1) {
			output.push({segments: [...prefix, structural('─'.repeat(Math.max(1, Math.min(available, 40))))]});
		}
		for (let column = 0; column < headers.length; column++) {
			const label = segmentsText(headers[column]!).trim() || `Column ${column + 1}`;
			const labelWidth = stringWidth(label) + 2;
			const value = cellRows[rowIndex]?.[column] ?? [];
			const indent = ' '.repeat(Math.min(2, Math.max(0, available - 1)));
			const continuationWidth = Math.max(1, available - stringWidth(indent));
			if (labelWidth >= available) {
				for (const labelLine of wrapSegments([{text: `${label}:`, bold: true}], available)) {
					output.push({segments: [...prefix, ...labelLine]});
				}
				if (segmentsText(value).trim()) {
					for (const valueLine of wrapSegments(value, continuationWidth)) {
						output.push({segments: [...prefix, {text: indent}, ...valueLine]});
					}
				}
				continue;
			}
			const firstWidth = available - labelWidth;
			const wrapped = wrapSegments(value, continuationWidth, firstWidth);
			output.push({
				segments: [...prefix, {text: `${label}:`, bold: true}, {text: ' '}, ...(wrapped[0] ?? [])],
			});
			for (const continuation of wrapped.slice(1)) {
				output.push({segments: [...prefix, {text: indent}, ...continuation]});
			}
		}
	}
	return output;
};

const headerOnlyRows = (
	headers: RowSegment[][],
	width: number,
	prefix: readonly RowSegment[],
): RenderedMarkdownRow[] => {
	const available = Math.max(1, width - segmentsWidth(prefix));
	return headers.flatMap((header) =>
		wrapSegments(
			header.map((segment) => ({...segment, bold: true})),
			available,
		).map((segments) => ({segments: [...prefix, ...segments]})),
	);
};

export const renderMarkdownTable = (
	table: Tokens.Table,
	width: number,
	prefix: readonly RowSegment[] = [],
	style: SegmentStyle = {},
): RenderedMarkdownRow[] => {
	if (table.header.length === 0) return [];
	const cellRows = [table.header, ...table.rows].map((row) => row.map((cell) => cellSegments(cell.tokens, style)));
	const columnCount = table.header.length;
	const prefixWidth = segmentsWidth(prefix);
	const borderOverhead = 1 + columnCount * 3;
	const available = width - prefixWidth - borderOverhead;
	const minimums = table.header.map((_, column) =>
		Math.max(...cellRows.map((row) => cellMinimumWidth(row[column] ?? []))),
	);
	const ideals = table.header.map((_, column) => Math.max(...cellRows.map((row) => cellIdealWidth(row[column] ?? []))));
	if (table.rows.length === 0) {
		return available < columnCount * MIN_COLUMN_WIDTH
			? headerOnlyRows(cellRows[0]!, width, prefix)
			: horizontalRows(table, cellRows, allocateWidths(minimums, ideals, available), prefix);
	}
	if (available < columnCount * MIN_COLUMN_WIDTH) return verticalRows(cellRows, width, prefix);

	const widths = allocateWidths(minimums, ideals, available);
	const maximumCellHeight = Math.max(
		...cellRows.flatMap((row) => row.map((cell, column) => wrapSegments(cell, widths[column]!).length)),
	);
	return maximumCellHeight > MAX_ROW_LINES
		? verticalRows(cellRows, width, prefix)
		: horizontalRows(table, cellRows, widths, prefix);
};
