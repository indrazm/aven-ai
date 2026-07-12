import stringWidth from 'string-width';

export type TerminalGrapheme = {
	text: string;
	startColumn: number;
	endColumn: number;
};

const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});

export const terminalGraphemes = (text: string, initialColumn = 0): TerminalGrapheme[] => {
	const graphemes: TerminalGrapheme[] = [];
	let column = initialColumn;
	for (const {segment} of segmenter.segment(text)) {
		const startColumn = column;
		column += stringWidth(segment);
		graphemes.push({text: segment, startColumn, endColumn: column});
	}
	return graphemes;
};

export const graphemeAtColumn = (graphemes: readonly TerminalGrapheme[], column: number): number => {
	if (graphemes.length === 0) return -1;
	const clamped = Math.max(0, column);
	const containing = graphemes.findIndex(
		(grapheme) => grapheme.startColumn <= clamped && clamped < Math.max(grapheme.endColumn, grapheme.startColumn + 1),
	);
	return containing === -1 ? graphemes.length - 1 : containing;
};

export const overlapsColumns = (grapheme: TerminalGrapheme, selectionStart: number, selectionEnd: number): boolean => {
	const endColumn = Math.max(grapheme.endColumn, grapheme.startColumn + 1);
	return selectionStart < endColumn && selectionEnd > grapheme.startColumn;
};
