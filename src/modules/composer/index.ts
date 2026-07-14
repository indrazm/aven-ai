export {Composer} from './components/composer.js';
export {backspace, deleteForward, insertText, moveCursor, moveLineBoundary, normalizeInput} from './services/editor.js';
export {composerInputIntent, type ComposerInputContext, type ComposerInputIntent} from './services/input-intent.js';
export {
	insertMention,
	mentionQueryAtCursor,
	mentionTokenFor,
	workspaceMentionsFor,
	type MentionQuery,
} from './services/mentions.js';
export {loadProjectPaths} from './services/project-paths.js';
export {
	commandSuggestionsFor,
	createMentionSearch,
	suggestionWindow,
	type MentionSearch,
	type VisibleSuggestion,
} from './services/suggestions.js';
export {useProjectMentions, type ProjectMentions} from './services/use-project-mentions.js';
export type {
	CommandSuggestion,
	EditorState,
	MentionSuggestion,
	ProjectPathEntry,
	Suggestion,
	SuggestionStatus,
} from './types.js';
