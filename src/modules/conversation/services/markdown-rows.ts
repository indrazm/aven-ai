import {marked, type Token, type Tokens} from 'marked';
import type {UiMessage} from '../types.js';
import {makeRow} from './row-model.js';
import type {RowSegment, TranscriptRow} from '../types.js';
import {wrapSegments} from './wrapping.js';

export const inlineSegments = (text: string): RowSegment[] => {
	const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/gu;
	const output: RowSegment[] = [];
	let cursor = 0;
	for (const match of text.matchAll(pattern)) {
		const index = match.index;
		if (index > cursor) output.push({text: text.slice(cursor, index)});
		const value = match[0];
		if (value.startsWith('**')) output.push({text: value.slice(2, -2), bold: true});
		else if (value.startsWith('`')) output.push({text: value.slice(1, -1), tone: 'code'});
		else if (value.startsWith('[')) {
			const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(value);
			output.push({text: link?.[1] ?? value, tone: 'accent', underline: true, ...(link?.[2] ? {link: link[2]} : {})});
		} else output.push({text: value.slice(1, -1), italic: true});
		cursor = index + value.length;
	}
	if (cursor < text.length) output.push({text: text.slice(cursor)});
	return output;
};

const syntaxSegments = (line: string): RowSegment[] => {
	const pattern =
		/(\/\/.*$|#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:const|let|function|return|type|interface|import|export|async|await|if|else|true|false|null)\b)/gu;
	const output: RowSegment[] = [];
	let cursor = 0;
	for (const match of line.matchAll(pattern)) {
		const index = match.index;
		if (index > cursor) output.push({text: line.slice(cursor, index), tone: 'code'});
		const value = match[0];
		output.push({
			text: value,
			tone:
				value.startsWith('//') || value.startsWith('#')
					? 'muted'
					: value.startsWith('"') || value.startsWith("'")
						? 'success'
						: 'accent',
			bold: !value.startsWith('/') && !value.startsWith('#') && !value.startsWith('"') && !value.startsWith("'"),
		});
		cursor = index + value.length;
	}
	if (cursor < line.length) output.push({text: line.slice(cursor), tone: 'code'});
	return output;
};

export const markdownRows = (message: UiMessage, content: string, width: number): TranscriptRow[] => {
	const rows: TranscriptRow[] = [];
	let index = 0;
	const pushWrapped = (segments: RowSegment[], background?: TranscriptRow['background']) => {
		for (const line of wrapSegments(segments, width)) rows.push(makeRow(message, index++, line, background));
	};

	for (const token of marked.lexer(content) as Token[]) {
		switch (token.type) {
			case 'space':
				rows.push(makeRow(message, index++, [{text: ''}]));
				break;
			case 'heading':
				pushWrapped([{text: (token as Tokens.Heading).text, bold: true, tone: 'text'}]);
				break;
			case 'code': {
				const code = token as Tokens.Code;
				rows.push(makeRow(message, index++, [{text: ` ${code.lang ?? 'code'} `, tone: 'muted', bold: true}], 'code'));
				for (const line of code.text.split('\n'))
					rows.push(
						makeRow(
							message,
							index++,
							[{text: '│ ', tone: 'subtle', selectable: false}, ...syntaxSegments(line)],
							'code',
						),
					);
				break;
			}
			case 'list':
				for (const item of (token as Tokens.List).items)
					pushWrapped([{text: '  • ', tone: 'muted', selectable: false}, ...inlineSegments(item.text)]);
				break;
			case 'blockquote':
				pushWrapped([
					{text: '│ ', tone: 'subtle', selectable: false},
					{text: (token as Tokens.Blockquote).text.trim(), tone: 'muted'},
				]);
				break;
			case 'hr':
				rows.push(
					makeRow(message, index++, [{text: '─'.repeat(Math.max(1, width)), tone: 'subtle', selectable: false}]),
				);
				break;
			default: {
				const text = 'text' in token && typeof token.text === 'string' ? token.text : token.raw;
				pushWrapped(inlineSegments(text.trim()));
			}
		}
	}
	return rows;
};
