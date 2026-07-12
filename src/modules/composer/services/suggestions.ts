import {commandItems, type CommandDefinition} from '../../commands/index.js';
import type {Suggestion} from '../types.js';

export const commandSuggestionsFor = (value: string, visible: boolean): readonly CommandDefinition[] => {
	if (!visible || !value.startsWith('/')) return [];
	const query = value.toLowerCase();
	return commandItems.filter((item) => item.label.startsWith(query));
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
