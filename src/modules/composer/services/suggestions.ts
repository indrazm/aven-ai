import Fuse from 'fuse.js';
import {commandItems} from '../../commands/index.js';
import {mentionTokenFor} from './mentions.js';
import type {CommandSuggestion, MentionSuggestion, ProjectPathEntry, Suggestion} from '../types.js';

export const commandSuggestionsFor = (value: string, visible: boolean): readonly CommandSuggestion[] => {
	if (!visible || !value.startsWith('/')) return [];
	const query = value.toLowerCase();
	return commandItems
		.filter((item) => item.label.startsWith(query))
		.map((item) => ({...item, kind: 'command' as const}));
};

type IndexedPath = {entry: ProjectPathEntry; name: string};

const pathDepth = (path: string): number => path.split('/').length;

const defaultPathOrder = (left: ProjectPathEntry, right: ProjectPathEntry): number =>
	pathDepth(left.path) - pathDepth(right.path) ||
	(left.kind === right.kind ? 0 : left.kind === 'directory' ? -1 : 1) ||
	left.path.localeCompare(right.path);

const mentionSuggestion = (entry: ProjectPathEntry): MentionSuggestion => ({
	kind: 'mention',
	label: mentionTokenFor(entry),
	description: entry.kind === 'directory' ? 'folder' : 'file',
	path: entry.path,
	pathKind: entry.kind,
});

export type MentionSearch = (query: string) => readonly MentionSuggestion[];

export const createMentionSearch = (entries: readonly ProjectPathEntry[], limit = 50): MentionSearch => {
	const indexed: IndexedPath[] = entries.map((entry) => ({
		entry,
		name: entry.path.slice(entry.path.lastIndexOf('/') + 1),
	}));
	const fuse = new Fuse(indexed, {
		keys: [
			{name: 'name', weight: 0.65},
			{name: 'entry.path', weight: 0.35},
		],
		includeScore: true,
		ignoreLocation: true,
		threshold: 0.4,
	});
	const defaults = [...entries].sort(defaultPathOrder).slice(0, limit);

	return (query) => {
		const normalized = query.trim().replace(/\/$/u, '');
		if (!normalized) return defaults.map(mentionSuggestion);
		return fuse
			.search(normalized, {limit})
			.sort((left, right) => {
				const leftPrefix = left.item.entry.path.toLowerCase().startsWith(normalized.toLowerCase());
				const rightPrefix = right.item.entry.path.toLowerCase().startsWith(normalized.toLowerCase());
				return (
					Number(rightPrefix) - Number(leftPrefix) ||
					(left.score ?? 1) - (right.score ?? 1) ||
					defaultPathOrder(left.item.entry, right.item.entry)
				);
			})
			.map((result) => mentionSuggestion(result.item.entry));
	};
};

export type VisibleSuggestion = {
	suggestion: Suggestion;
	index: number;
};

export const suggestionWindow = (
	suggestions: readonly Suggestion[],
	selectedIndex: number,
	windowSize = 6,
): VisibleSuggestion[] => {
	if (suggestions.length === 0 || windowSize <= 0) return [];
	const selected = Math.max(0, Math.min(suggestions.length - 1, selectedIndex));
	const start = Math.max(0, Math.min(selected - windowSize + 1, suggestions.length - windowSize));
	return suggestions.slice(start, start + windowSize).map((suggestion, offset) => ({
		suggestion,
		index: start + offset,
	}));
};
