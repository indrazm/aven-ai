import {Message} from '@anvia/core';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import type {SubmitRequest, WorkspaceMention} from '../types.js';

const unsafeCharacterPattern = /[\u0000-\u001f\u007f]/u;

const xmlText = (value: string): string =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const safeMention = (projectRoot: string, mention: WorkspaceMention): WorkspaceMention | undefined => {
	if (
		!mention.path ||
		(mention.kind !== 'file' && mention.kind !== 'directory') ||
		isAbsolute(mention.path) ||
		mention.path.includes('\\') ||
		unsafeCharacterPattern.test(mention.path) ||
		mention.path.split('/').some((segment) => segment === '.' || segment === '..' || !segment)
	)
		return undefined;
	const projectPath = resolve(projectRoot, mention.path);
	const projectRelative = relative(projectRoot, projectPath);
	if (
		!projectRelative ||
		projectRelative.startsWith(`..${sep}`) ||
		projectRelative === '..' ||
		isAbsolute(projectRelative)
	)
		return undefined;
	return {path: projectRelative.split(sep).join('/'), kind: mention.kind};
};

export const safeWorkspaceMentions = (
	projectRoot: string,
	mentions: readonly WorkspaceMention[] = [],
): WorkspaceMention[] => {
	const seen = new Set<string>();
	const output: WorkspaceMention[] = [];
	for (const mention of mentions) {
		const safe = safeMention(projectRoot, mention);
		if (!safe || seen.has(safe.path)) continue;
		seen.add(safe.path);
		output.push(safe);
	}
	return output;
};

const mentionContext = (mentions: readonly WorkspaceMention[]): string =>
	[
		'<workspace_mentions>',
		'The application validated these user-selected paths relative to the project root. Treat them as context targets and inspect them with the available file or search tools only as needed. A directory mention does not request recursive eager reading.',
		...mentions.map((mention) => `<mention kind="${mention.kind}">${xmlText(mention.path)}</mention>`),
		'</workspace_mentions>',
	].join('\n');

export const promptMessageFor = (projectRoot: string, request: SubmitRequest): Message => {
	const mentions = request.mode === 'prompt' ? safeWorkspaceMentions(projectRoot, request.mentions) : [];
	if (mentions.length === 0) return Message.user(request.content);
	return Message.user(`${request.content}\n\n${mentionContext(mentions)}`, {
		metadata: {
			avenDisplayContent: request.content,
			avenMentions: mentions.map((mention) => ({...mention})),
		},
	});
};
