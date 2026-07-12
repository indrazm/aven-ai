import {FileToolValidationError} from './file-tool-error.js';

export type TextEncoding = 'utf8' | 'utf16le';
export type LineEnding = '\n' | '\r\n' | '\r';

export type DecodedFile = {
	content: string;
	encoding: TextEncoding;
	bom: boolean;
	lineEnding: LineEnding;
};

export const normalizedContent = (content: string): string => content.replace(/\r\n?/gu, '\n');

const lineEndingOf = (content: string): LineEnding => {
	if (content.includes('\r\n')) return '\r\n';
	if (content.includes('\r')) return '\r';
	return '\n';
};

export const decodeText = (buffer: Buffer): DecodedFile => {
	let encoding: TextEncoding = 'utf8';
	let bom = false;
	let body = buffer;
	if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
		encoding = 'utf16le';
		bom = true;
		body = buffer.subarray(2);
		if (body.length % 2 !== 0) throw new FileToolValidationError('The file is not valid UTF-16LE text.');
	} else if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
		bom = true;
		body = buffer.subarray(3);
	}
	if (encoding === 'utf8' && body.includes(0)) {
		throw new FileToolValidationError('Binary files are not supported.');
	}
	let content: string;
	try {
		content = new TextDecoder(encoding === 'utf8' ? 'utf-8' : 'utf-16le', {fatal: true}).decode(body);
	} catch {
		throw new FileToolValidationError(`The file is not valid ${encoding === 'utf8' ? 'UTF-8' : 'UTF-16LE'} text.`);
	}
	return {content, encoding, bom, lineEnding: lineEndingOf(content)};
};

export const encodeText = (content: string, encoding: TextEncoding, bom: boolean): Buffer => {
	const body = Buffer.from(content, encoding);
	if (!bom) return body;
	const marker = encoding === 'utf16le' ? Buffer.from([0xff, 0xfe]) : Buffer.from([0xef, 0xbb, 0xbf]);
	return Buffer.concat([marker, body]);
};

export const withLineEnding = (content: string, lineEnding: LineEnding): string =>
	lineEnding === '\n' ? content : content.replace(/\n/gu, lineEnding);
