import type {Token, Tokens} from 'marked';
import type {RowSegment} from '../types.js';
import {cleanText, cleanTextSource} from './text-cleaning.js';

export type SegmentStyle = Omit<RowSegment, 'text'>;
export const cleanMarkdownSource = cleanTextSource;

export const cleanMarkdownText = cleanText;

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
