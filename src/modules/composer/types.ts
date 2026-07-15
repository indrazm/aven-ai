export type EditorState = {
	value: string;
	cursor: number;
};

export type ProjectPathEntry = {
	path: string;
	kind: 'file' | 'directory';
};

type SuggestionBase = {
	label: string;
	description: string;
};

export type CommandSuggestion = SuggestionBase & {
	kind: 'command';
};

export type MentionSuggestion = SuggestionBase & {
	kind: 'mention';
	path: string;
	pathKind: ProjectPathEntry['kind'];
};

export type Suggestion = CommandSuggestion | MentionSuggestion;

export type SuggestionStatus = {
	kind: 'loading' | 'empty' | 'error';
	message: string;
};
