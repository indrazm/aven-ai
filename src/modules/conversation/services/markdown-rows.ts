import {marked, type Token, type Tokens} from 'marked';
import stringWidth from 'string-width';
import type {UiMessage} from '../types.js';
import type {RowSegment, TranscriptRow} from '../types.js';
import {cleanMarkdownSource, cleanMarkdownText, renderInlineTokens, type SegmentStyle} from './markdown-inline.js';
import {highlightCode} from './syntax-highlighting.js';
import {renderMarkdownTable, type RenderedMarkdownRow} from './markdown-table.js';
import {makeRow} from './row-model.js';
import {wrapSegments} from './wrapping.js';

type RenderContext = {
	width: number;
	prefix: RowSegment[];
	style: SegmentStyle;
	listDepth: number;
};

const prefixWidth = (prefix: readonly RowSegment[]): number =>
	prefix.reduce((width, segment) => width + stringWidth(segment.text), 0);

const wrapBlock = (segments: RowSegment[], context: RenderContext): RenderedMarkdownRow[] => {
	const width = Math.max(1, context.width - prefixWidth(context.prefix));
	return wrapSegments(segments, width).map((line) => ({segments: [...context.prefix, ...line]}));
};

const blankRow = (context: RenderContext): RenderedMarkdownRow => ({
	segments: context.prefix.length > 0 ? [...context.prefix] : [{text: ''}],
});

const numberToLetter = (value: number): string => {
	let output = '';
	for (let number = value; number > 0; number = Math.floor((number - 1) / 26)) {
		output = String.fromCharCode(97 + ((number - 1) % 26)) + output;
	}
	return output || value.toString();
};

const numberToRoman = (value: number): string => {
	const numerals: ReadonlyArray<readonly [number, string]> = [
		[1000, 'm'],
		[900, 'cm'],
		[500, 'd'],
		[400, 'cd'],
		[100, 'c'],
		[90, 'xc'],
		[50, 'l'],
		[40, 'xl'],
		[10, 'x'],
		[9, 'ix'],
		[5, 'v'],
		[4, 'iv'],
		[1, 'i'],
	];
	let remaining = value;
	let output = '';
	for (const [amount, numeral] of numerals) {
		while (remaining >= amount) {
			output += numeral;
			remaining -= amount;
		}
	}
	return output || value.toString();
};

const orderedMarker = (depth: number, value: number): string => {
	if (depth === 1) return `${numberToLetter(value)}.`;
	if (depth === 2) return `${numberToRoman(value)}.`;
	return `${value}.`;
};

const rowContentAfterPrefix = (row: RenderedMarkdownRow, prefix: readonly RowSegment[]): string =>
	row.segments
		.slice(prefix.length)
		.map((segment) => segment.text)
		.join('');

const renderList = (list: Tokens.List, context: RenderContext): RenderedMarkdownRow[] => {
	const output: RenderedMarkdownRow[] = [];
	const start = typeof list.start === 'number' ? list.start : 1;
	for (let itemIndex = 0; itemIndex < list.items.length; itemIndex++) {
		const item = list.items[itemIndex]!;
		const baseMarker = list.ordered ? orderedMarker(context.listDepth, start + itemIndex) : '-';
		const markerText = `${baseMarker}${item.task ? ` [${item.checked ? 'x' : ' '}]` : ''} `;
		const marker = {text: markerText, tone: 'muted' as const, selectable: false};
		const continuation = {text: ' '.repeat(stringWidth(markerText)), selectable: false};
		const continuationPrefix = [...context.prefix, continuation];
		const itemContext: RenderContext = {
			...context,
			prefix: continuationPrefix,
			listDepth: context.listDepth + 1,
		};
		const itemRows = renderBlocks(item.tokens, itemContext);
		if (itemRows.length === 0) itemRows.push(blankRow(itemContext));
		const firstContent = itemRows.findIndex((row) => rowContentAfterPrefix(row, continuationPrefix).trim() !== '');
		const markerRow = firstContent === -1 ? 0 : firstContent;
		itemRows[markerRow] = {
			...itemRows[markerRow]!,
			segments: [...context.prefix, marker, ...itemRows[markerRow]!.segments.slice(continuationPrefix.length)],
		};
		output.push(...itemRows);
		if (list.loose && itemIndex < list.items.length - 1) output.push(blankRow(context));
	}
	return output;
};

const renderCode = (code: Tokens.Code, context: RenderContext): RenderedMarkdownRow[] => {
	const width = Math.max(1, context.width - prefixWidth(context.prefix));
	const output: RenderedMarkdownRow[] = [];
	for (const logicalLine of highlightCode(code.text, code.lang)) {
		const inherited = logicalLine.map((segment) => ({...context.style, ...segment, text: segment.text}));
		for (const line of wrapSegments(inherited, width)) output.push({segments: [...context.prefix, ...line]});
	}
	return output;
};

const renderHtml = (token: Tokens.HTML, context: RenderContext): RenderedMarkdownRow[] =>
	cleanMarkdownText(token.raw)
		.split('\n')
		.flatMap((line) => wrapBlock([{text: line, ...context.style}], context));

const renderToken = (token: Token, context: RenderContext): RenderedMarkdownRow[] => {
	switch (token.type) {
		case 'space':
			return [blankRow(context)];
		case 'paragraph':
			return wrapBlock(renderInlineTokens((token as Tokens.Paragraph).tokens, context.style), context);
		case 'text': {
			const text = token as Tokens.Text;
			return wrapBlock(renderInlineTokens(text.tokens ?? [text], context.style), context);
		}
		case 'heading': {
			const heading = token as Tokens.Heading;
			const headingStyle: SegmentStyle =
				heading.depth === 1
					? {...context.style, bold: true, italic: true, underline: true}
					: {...context.style, bold: true};
			return [...wrapBlock(renderInlineTokens(heading.tokens, headingStyle), context), blankRow(context)];
		}
		case 'blockquote': {
			const quote = token as Tokens.Blockquote;
			return renderBlocks(quote.tokens, {
				...context,
				prefix: [...context.prefix, {text: '▎ ', tone: 'subtle', selectable: false}],
				style: {...context.style, italic: true},
			});
		}
		case 'list':
			return renderList(token as Tokens.List, context);
		case 'code':
			return renderCode(token as Tokens.Code, context);
		case 'table':
			return renderMarkdownTable(token as Tokens.Table, context.width, context.prefix, context.style);
		case 'hr':
			return wrapBlock([{text: '---', tone: 'subtle', selectable: false}], context);
		case 'html':
			return renderHtml(token as Tokens.HTML, context);
		case 'checkbox':
		case 'def':
			return [];
		default:
			return wrapBlock(renderInlineTokens([token], context.style), context);
	}
};

function renderBlocks(tokens: readonly Token[] | undefined, context: RenderContext): RenderedMarkdownRow[] {
	if (!tokens) return [];
	return tokens.flatMap((token) => renderToken(token, context));
}

const isBlank = (row: RenderedMarkdownRow): boolean => row.segments.every((segment) => !segment.text.trim());

const normalizeSpacing = (rows: RenderedMarkdownRow[]): RenderedMarkdownRow[] => {
	const output: RenderedMarkdownRow[] = [];
	for (const row of rows) {
		if (isBlank(row) && (output.length === 0 || isBlank(output.at(-1)!))) continue;
		output.push(row);
	}
	while (output.at(-1) && isBlank(output.at(-1)!)) output.pop();
	return output;
};

export const markdownRows = (message: UiMessage, content: string, width: number): TranscriptRow[] => {
	const tokens = marked.lexer(cleanMarkdownSource(content), {gfm: true, breaks: false, pedantic: false});
	const rendered = normalizeSpacing(
		renderBlocks(tokens, {width: Math.max(1, width), prefix: [], style: {}, listDepth: 0}),
	);
	return rendered.map((row, index) => makeRow(message, index, row.segments));
};
