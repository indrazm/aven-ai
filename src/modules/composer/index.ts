export {Composer} from './components/composer.js';
export {backspace, deleteForward, insertText, moveCursor, moveLineBoundary, normalizeInput} from './services/editor.js';
export {composerInputIntent, type ComposerInputContext, type ComposerInputIntent} from './services/input-intent.js';
export {commandSuggestionsFor, suggestionWindow, type VisibleSuggestion} from './services/suggestions.js';
export type {EditorState, Suggestion} from './types.js';
