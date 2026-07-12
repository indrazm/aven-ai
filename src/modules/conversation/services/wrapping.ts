import stringWidth from 'string-width';
import type {RowSegment} from '../types.js';

export const wrapSegments = (segments: RowSegment[], width: number): RowSegment[][] => {
	const safeWidth = Math.max(1, width);
	const rows: RowSegment[][] = [[]];
	let currentWidth = 0;

	for (const segment of segments) {
		const pieces = segment.text.split(/(\s+|\n)/u);
		for (const piece of pieces) {
			if (piece === '') continue;
			if (piece === '\n') {
				rows.push([]);
				currentWidth = 0;
				continue;
			}

			const pieceWidth = stringWidth(piece);
			if (currentWidth > 0 && currentWidth + pieceWidth > safeWidth && piece.trim()) {
				rows.push([]);
				currentWidth = 0;
			}

			if (pieceWidth <= safeWidth) {
				rows.at(-1)!.push({...segment, text: piece});
				currentWidth += pieceWidth;
				continue;
			}

			let chunk = '';
			for (const character of piece) {
				const characterWidth = stringWidth(character);
				if (currentWidth + stringWidth(chunk) + characterWidth > safeWidth) {
					if (chunk) rows.at(-1)!.push({...segment, text: chunk});
					rows.push([]);
					currentWidth = 0;
					chunk = '';
				}
				chunk += character;
			}
			if (chunk) {
				rows.at(-1)!.push({...segment, text: chunk});
				currentWidth += stringWidth(chunk);
			}
		}
	}

	return rows.length === 0 ? [[]] : rows;
};
