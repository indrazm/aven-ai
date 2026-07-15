import {styledCharsFromTokens, tokenize, type StyledChar} from '@alcalzone/ansi-tokenize';
import {highlight, supportsLanguage, type Theme} from 'cli-highlight';
import {basename, extname} from 'node:path';
import type {RowSegment} from '../types.js';
import {cleanText} from './text-cleaning.js';

type CodeStyle = Omit<RowSegment, 'text'>;
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

const highlightedStyle = (character: StyledChar): CodeStyle => {
	const style: CodeStyle = {tone: 'code'};
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

const sameStyle = (a: RowSegment, b: CodeStyle): boolean =>
	a.tone === b.tone &&
	a.color === b.color &&
	a.bold === b.bold &&
	a.dim === b.dim &&
	a.italic === b.italic &&
	a.underline === b.underline &&
	a.strikethrough === b.strikethrough;

const plainCodeLines = (text: string): RowSegment[][] =>
	cleanText(text)
		.split('\n')
		.map((line) => [{text: line, tone: 'code'}]);

export const highlightCode = (text: string, language?: string): RowSegment[][] => {
	const clean = cleanText(text);
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

const SPECIAL_FILENAMES: Readonly<Record<string, string>> = {
	dockerfile: 'dockerfile',
	makefile: 'makefile',
	gemfile: 'ruby',
	rakefile: 'ruby',
	'cmakelists.txt': 'cmake',
	'.bashrc': 'bash',
	'.zshrc': 'bash',
};

const EXTENSION_ALIASES: Readonly<Record<string, string>> = {
	cjs: 'javascript',
	mjs: 'javascript',
	cts: 'typescript',
	mts: 'typescript',
	pyw: 'python',
	rs: 'rust',
	sh: 'bash',
	zsh: 'bash',
};

const languageFromShebang = (firstLine: string | undefined): string | undefined => {
	if (!firstLine) return undefined;
	const line = firstLine.trimStart().toLowerCase();
	if (line.startsWith('<?php')) return 'php';
	if (line.startsWith('<?xml')) return 'xml';
	if (!line.startsWith('#!')) return undefined;
	if (/\b(?:bash|sh|zsh)\b/u.test(line)) return 'bash';
	if (/\bpython(?:\d+(?:\.\d+)*)?\b/u.test(line)) return 'python';
	if (/\b(?:node|deno|bun)\b/u.test(line)) return 'javascript';
	if (/\bruby\b/u.test(line)) return 'ruby';
	if (/\bperl\b/u.test(line)) return 'perl';
	return undefined;
};

export const languageForFile = (filePath: string, firstLine?: string): string | undefined => {
	const fileName = basename(filePath).toLowerCase();
	const special = SPECIAL_FILENAMES[fileName];
	if (special && supportsLanguage(special)) return special;

	const extension = extname(fileName).slice(1);
	const candidate = EXTENSION_ALIASES[extension] ?? extension;
	if (candidate && supportsLanguage(candidate)) return candidate;
	return languageFromShebang(firstLine);
};

export {cleanText as cleanCodeText};
