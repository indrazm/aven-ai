import stringWidth from 'string-width';
import type {RowSegment} from '../types.js';
import {terminalGraphemes} from './terminal-cells.js';

export const wrapSegments = (segments: RowSegment[], width: number, firstWidth = width): RowSegment[][] => {
	const safeWidth = Math.max(1, width);
	const safeFirstWidth = Math.max(1, firstWidth);
	const rows: RowSegment[][] = [[]];
	let currentWidth = 0;
	let pendingWhitespace: RowSegment[] = [];
	let pendingWhitespaceWidth = 0;
	const rowWidth = () => (rows.length === 1 ? safeFirstWidth : safeWidth);
	const clearPendingWhitespace = () => {
		pendingWhitespace = [];
		pendingWhitespaceWidth = 0;
	};

	for (const segment of segments) {
		const pieces = segment.text.split(/(\n|[^\S\n]+)/u);
		for (const piece of pieces) {
			if (piece === '') continue;
			if (piece === '\n') {
				clearPendingWhitespace();
				rows.push([]);
				currentWidth = 0;
				continue;
			}

			const pieceWidth = stringWidth(piece);
			if (!piece.trim()) {
				if (currentWidth > 0) {
					pendingWhitespace.push({...segment, text: piece});
					pendingWhitespaceWidth += pieceWidth;
				}
				continue;
			}

			if (currentWidth > 0 && currentWidth + pendingWhitespaceWidth + pieceWidth > rowWidth()) {
				rows.push([]);
				currentWidth = 0;
				clearPendingWhitespace();
			} else if (currentWidth > 0 && pendingWhitespace.length > 0) {
				rows.at(-1)!.push(...pendingWhitespace);
				currentWidth += pendingWhitespaceWidth;
				clearPendingWhitespace();
			}

			if (pieceWidth <= rowWidth()) {
				rows.at(-1)!.push({...segment, text: piece});
				currentWidth += pieceWidth;
				continue;
			}

			let chunk = '';
			for (const grapheme of terminalGraphemes(piece)) {
				const graphemeWidth = stringWidth(grapheme.text);
				if (currentWidth + stringWidth(chunk) + graphemeWidth > rowWidth()) {
					if (chunk) rows.at(-1)!.push({...segment, text: chunk});
					rows.push([]);
					currentWidth = 0;
					chunk = '';
				}
				chunk += grapheme.text;
			}
			if (chunk) {
				rows.at(-1)!.push({...segment, text: chunk});
				currentWidth += stringWidth(chunk);
			}
		}
	}

	return rows.length === 0 ? [[]] : rows;
};
