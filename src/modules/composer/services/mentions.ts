import type {WorkspaceMention} from '../../agent/index.js';
import type {EditorState, ProjectPathEntry} from '../types.js';

export type MentionQuery = {
	start: number;
	end: number;
	query: string;
	quoted: boolean;
};

const boundaryPattern = /[\s([{,;:]/u;
const plainTerminatorPattern = /[\s,;:!?()[\]{}"'\\]/u;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/u;

const clampCursor = (value: string, cursor: number): number => Math.max(0, Math.min(value.length, cursor));

const isBoundary = (value: string, index: number): boolean =>
	index === 0 || boundaryPattern.test(value[index - 1] ?? '');

const quotedValue = (raw: string): string => {
	try {
		return JSON.parse(`"${raw}"`) as string;
	} catch {
		return raw.replace(/\\(["\\/bfnrt])/gu, '$1');
	}
};

const quotedEnd = (value: string, start: number): {contentEnd: number; tokenEnd: number; closed: boolean} => {
	let escaped = false;
	for (let index = start; index < value.length; index++) {
		const character = value[index] ?? '';
		if (escaped) {
			escaped = false;
			continue;
		}
		if (character === '\\') {
			escaped = true;
			continue;
		}
		if (character === '"') return {contentEnd: index, tokenEnd: index + 1, closed: true};
	}
	return {contentEnd: value.length, tokenEnd: value.length, closed: false};
};

const plainEnd = (value: string, start: number): number => {
	let index = start;
	while (index < value.length && !plainTerminatorPattern.test(value[index] ?? '')) index++;
	return index;
};

export const mentionQueryAtCursor = (state: EditorState): MentionQuery | undefined => {
	const cursor = clampCursor(state.value, state.cursor);
	for (let index = cursor - 1; index >= 0; index--) {
		if (state.value[index] !== '@' || !isBoundary(state.value, index)) continue;
		const quoted = state.value[index + 1] === '"';
		if (quoted) {
			const range = quotedEnd(state.value, index + 2);
			if (cursor < index + 2 || cursor > range.contentEnd) return undefined;
			return {
				start: index,
				end: range.tokenEnd,
				query: quotedValue(state.value.slice(index + 2, cursor)),
				quoted: true,
			};
		}
		const end = plainEnd(state.value, index + 1);
		if (cursor < index + 1 || cursor > end) return undefined;
		return {start: index, end, query: state.value.slice(index + 1, cursor), quoted: false};
	}
	return undefined;
};

const needsQuotes = (path: string): boolean => plainTerminatorPattern.test(path);

export const mentionTokenFor = (entry: ProjectPathEntry): string => {
	const displayPath = entry.kind === 'directory' ? `${entry.path}/` : entry.path;
	return needsQuotes(displayPath) ? `@${JSON.stringify(displayPath)}` : `@${displayPath}`;
};

export const insertMention = (state: EditorState, entry: ProjectPathEntry): EditorState => {
	const query = mentionQueryAtCursor(state);
	if (!query) return state;
	const token = mentionTokenFor(entry);
	const suffix = state.value.slice(query.end);
	const spacing = !suffix || (!/^[\s,.;:!?)]/u.test(suffix) && !suffix.startsWith('}')) ? ' ' : '';
	return {
		value: state.value.slice(0, query.start) + token + spacing + suffix,
		cursor: query.start + token.length + spacing.length,
	};
};

type ParsedMention = {path: string; directorySyntax: boolean};

const parsedMentions = (value: string): ParsedMention[] => {
	const mentions: ParsedMention[] = [];
	for (let index = 0; index < value.length; index++) {
		if (value[index] !== '@' || !isBoundary(value, index)) continue;
		let path: string;
		let tokenEnd: number;
		if (value[index + 1] === '"') {
			const range = quotedEnd(value, index + 2);
			if (!range.closed) continue;
			path = quotedValue(value.slice(index + 2, range.contentEnd));
			tokenEnd = range.tokenEnd;
		} else {
			tokenEnd = plainEnd(value, index + 1);
			path = value.slice(index + 1, tokenEnd);
		}
		if (!path || controlCharacterPattern.test(path)) continue;
		const directorySyntax = path.endsWith('/');
		mentions.push({path: directorySyntax ? path.slice(0, -1) : path, directorySyntax});
		index = tokenEnd - 1;
	}
	return mentions;
};

export const workspaceMentionsFor = (value: string, entries: readonly ProjectPathEntry[]): WorkspaceMention[] => {
	const catalog = new Map(entries.map((entry) => [entry.path, entry]));
	const seen = new Set<string>();
	const output: WorkspaceMention[] = [];
	for (const parsed of parsedMentions(value)) {
		const entry = catalog.get(parsed.path);
		if (!entry || (parsed.directorySyntax && entry.kind !== 'directory') || seen.has(entry.path)) continue;
		seen.add(entry.path);
		output.push({path: entry.path, kind: entry.kind});
	}
	return output;
};
