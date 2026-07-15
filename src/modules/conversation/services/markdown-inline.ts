import {styledCharsFromTokens, tokenize, type StyledChar} from '@alcalzone/ansi-tokenize';
import {highlight, supportsLanguage, type Theme} from 'cli-highlight';
import type {Token, Tokens} from 'marked';
import type {RowSegment} from '../types.js';

export type SegmentStyle = Omit<RowSegment, 'text'>;
type Formatter = (text: string) => string;

const plain: Formatter = (text) => text;
const ansi =
	(open: string, close: string): Formatter =>
	(text) =>
		`${open}${text}${close}`;
const combine =
	(...formatters: Formatter[]): Formatter =>
	(text) =>
		formatters.reduceRight((output, formatter) => formatter(output), text);

const blue = ansi('\u001B[34m', '\u001B[39m');
const cyan = ansi('\u001B[36m', '\u001B[39m');
const green = ansi('\u001B[32m', '\u001B[39m');
const red = ansi('\u001B[31m', '\u001B[39m');
const yellow = ansi('\u001B[33m', '\u001B[39m');
const gray = ansi('\u001B[90m', '\u001B[39m');
const bold = ansi('\u001B[1m', '\u001B[22m');
const dim = ansi('\u001B[2m', '\u001B[22m');
const italic = ansi('\u001B[3m', '\u001B[23m');
const underline = ansi('\u001B[4m', '\u001B[24m');

const CODE_THEME: Theme = {
	keyword: blue,
	built_in: cyan,
	type: combine(cyan, dim),
	literal: blue,
	number: green,
	regexp: red,
	string: red,
	subst: plain,
	symbol: plain,
	class: blue,
	function: yellow,
	title: plain,
	params: plain,
	comment: green,
	doctag: green,
	meta: gray,
	'meta-keyword': plain,
	'meta-string': plain,
	section: plain,
	tag: gray,
	name: blue,
	'builtin-name': plain,
	attr: cyan,
	attribute: plain,
	variable: plain,
	bullet: plain,
	code: plain,
	emphasis: italic,
	strong: bold,
	formula: plain,
	link: underline,
	quote: plain,
	'selector-tag': plain,
	'selector-id': plain,
	'selector-class': plain,
	'selector-attr': plain,
	'selector-pseudo': plain,
	'template-tag': plain,
	'template-variable': plain,
	addition: green,
	deletion: red,
	default: plain,
};

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu;

export const cleanMarkdownSource = (text: string): string =>
	text.replace(/\r\n?/gu, '\n').replace(CONTROL_CHARACTERS, '');

export const cleanMarkdownText = (text: string): string => cleanMarkdownSource(text).replace(/\t/gu, '    ');

const inlineText = (text: string): string => cleanMarkdownText(text);

export const renderInlineTokens = (tokens: readonly Token[] | undefined, style: SegmentStyle = {}): RowSegment[] => {
	if (!tokens) return [];
	const output: RowSegment[] = [];
	for (const token of tokens) {
		switch (token.type) {
			case 'text': {
				const text = token as Tokens.Text;
				if (text.tokens) output.push(...renderInlineTokens(text.tokens, style));
				else output.push({text: inlineText(text.text), ...style});
				break;
			}
			case 'escape':
				output.push({text: inlineText((token as Tokens.Escape).text), ...style});
				break;
			case 'strong':
				output.push(...renderInlineTokens((token as Tokens.Strong).tokens, {...style, bold: true}));
				break;
			case 'em':
				output.push(...renderInlineTokens((token as Tokens.Em).tokens, {...style, italic: true}));
				break;
			case 'del':
				output.push(...renderInlineTokens((token as Tokens.Del).tokens, {...style, strikethrough: true}));
				break;
			case 'codespan':
				output.push({text: inlineText((token as Tokens.Codespan).text), ...style, tone: 'code'});
				break;
			case 'link': {
				const link = token as Tokens.Link;
				output.push(...renderInlineTokens(link.tokens, {...style, tone: 'accent', underline: true, link: link.href}));
				break;
			}
			case 'image': {
				const image = token as Tokens.Image;
				output.push({
					text: inlineText(image.href),
					...style,
					tone: 'accent',
					underline: true,
					link: image.href,
				});
				break;
			}
			case 'br':
				output.push({text: '\n', ...style});
				break;
			case 'html':
				output.push({text: inlineText((token as Tokens.HTML).raw), ...style});
				break;
			case 'checkbox':
			case 'def':
				break;
			default: {
				const children = 'tokens' in token && Array.isArray(token.tokens) ? token.tokens : undefined;
				if (children) output.push(...renderInlineTokens(children, style));
				else output.push({text: inlineText(token.raw), ...style});
			}
		}
	}
	return output.filter((segment) => segment.text !== '');
};

const highlightedStyle = (character: StyledChar): SegmentStyle => {
	const style: SegmentStyle = {tone: 'code'};
	for (const ansiStyle of character.styles) {
		switch (ansiStyle.code) {
			case '\u001B[1m':
				style.bold = true;
				break;
			case '\u001B[2m':
				style.dim = true;
				break;
			case '\u001B[3m':
				style.italic = true;
				break;
			case '\u001B[4m':
				style.underline = true;
				break;
			case '\u001B[9m':
				style.strikethrough = true;
				break;
			case '\u001B[31m':
				style.color = 'red';
				break;
			case '\u001B[32m':
				style.color = 'green';
				break;
			case '\u001B[33m':
				style.color = 'yellow';
				break;
			case '\u001B[34m':
				style.color = 'blue';
				break;
			case '\u001B[36m':
				style.color = 'cyan';
				break;
			case '\u001B[90m':
				style.color = 'gray';
				break;
		}
	}
	return style;
};

const sameStyle = (a: RowSegment, b: SegmentStyle): boolean =>
	a.tone === b.tone &&
	a.color === b.color &&
	a.bold === b.bold &&
	a.dim === b.dim &&
	a.italic === b.italic &&
	a.underline === b.underline &&
	a.strikethrough === b.strikethrough;

const plainCodeLines = (text: string): RowSegment[][] =>
	cleanMarkdownText(text)
		.split('\n')
		.map((line) => [{text: line, tone: 'code'}]);

export const highlightCode = (text: string, language?: string): RowSegment[][] => {
	const clean = cleanMarkdownText(text);
	if (!language || !supportsLanguage(language)) return plainCodeLines(clean);

	try {
		const highlighted = highlight(clean, {language, ignoreIllegals: true, theme: CODE_THEME});
		const lines: RowSegment[][] = [[]];
		for (const character of styledCharsFromTokens(tokenize(highlighted))) {
			if (character.value === '\n') {
				lines.push([]);
				continue;
			}
			const style = highlightedStyle(character);
			const previous = lines.at(-1)?.at(-1);
			if (previous && sameStyle(previous, style)) previous.text += character.value;
			else lines.at(-1)!.push({text: character.value, ...style});
		}
		return lines;
	} catch {
		return plainCodeLines(clean);
	}
};
