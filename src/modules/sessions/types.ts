import {singleLineLabel} from '../../utils/text.js';

export type ProjectSessionSummary = {
	id: string;
	projectRoot: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	active: boolean;
	persisted: boolean;
};

export const NEW_SESSION_TITLE = 'New session';

export {singleLineLabel} from '../../utils/text.js';

export const sessionTitleFromActivity = (content: string, mode: 'prompt' | 'bash'): string => {
	const normalized = singleLineLabel(content);
	const source = mode === 'bash' ? `$ ${normalized}` : normalized;
	const characters = [...source];
	if (characters.length <= 60) return source || NEW_SESSION_TITLE;
	return `${characters.slice(0, 59).join('')}…`;
};
