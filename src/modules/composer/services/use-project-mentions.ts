import {useEffect, useMemo, useState} from 'react';
import type {InputMode} from '../../agent/index.js';
import type {EditorState, MentionSuggestion, ProjectPathEntry, SuggestionStatus} from '../types.js';
import {mentionQueryAtCursor, type MentionQuery} from './mentions.js';
import {loadProjectPaths} from './project-paths.js';
import {createMentionSearch} from './suggestions.js';

export type ProjectMentions = {
	query?: MentionQuery;
	entries: readonly ProjectPathEntry[];
	suggestions: readonly MentionSuggestion[];
	status?: SuggestionStatus;
};

export const useProjectMentions = (
	projectRoot: string,
	editor: EditorState,
	inputMode: InputMode,
	visible: boolean,
): ProjectMentions => {
	const query = useMemo(
		() => (inputMode === 'prompt' && visible ? mentionQueryAtCursor(editor) : undefined),
		[editor, inputMode, visible],
	);
	const [catalog, setCatalog] = useState<{root: string; entries: readonly ProjectPathEntry[]} | undefined>();
	const [loading, setLoading] = useState(false);
	const [showLoading, setShowLoading] = useState(false);
	const [error, setError] = useState(false);
	const active = Boolean(query);
	const queryStart = query?.start;
	const entries = useMemo(() => (catalog?.root === projectRoot ? catalog.entries : []), [catalog, projectRoot]);
	const loaded = catalog?.root === projectRoot;

	useEffect(() => {
		if (!active) return;
		const controller = new AbortController();
		setLoading(true);
		setError(false);
		const loadingTimer = setTimeout(() => setShowLoading(true), 200);
		void loadProjectPaths(projectRoot, controller.signal)
			.then((paths) => {
				if (!controller.signal.aborted) setCatalog({root: projectRoot, entries: paths});
			})
			.catch(() => {
				if (!controller.signal.aborted) setError(true);
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					clearTimeout(loadingTimer);
					setLoading(false);
					setShowLoading(false);
				}
			});
		return () => {
			clearTimeout(loadingTimer);
			controller.abort();
			setLoading(false);
			setShowLoading(false);
		};
	}, [active, projectRoot, queryStart]);

	const search = useMemo(() => createMentionSearch(entries), [entries]);
	const suggestions = useMemo(() => (query ? search(query.query) : []), [query, search]);
	const status: SuggestionStatus | undefined = !query
		? undefined
		: error && entries.length === 0
			? {kind: 'error', message: 'Unable to scan project paths; @ remains plain text'}
			: loading && showLoading && entries.length === 0
				? {kind: 'loading', message: 'Indexing project paths…'}
				: loaded && !loading && suggestions.length === 0
					? {kind: 'empty', message: 'No matching files or folders'}
					: undefined;

	return {entries, suggestions, ...(query ? {query} : {}), ...(status ? {status} : {})};
};
