import {describe, expect, it} from 'vitest';
import {promptMessageFor, safeWorkspaceMentions} from './workspace-mentions.js';

describe('workspace mention prompt context', () => {
	it('adds escaped, deduplicated project-relative references while preserving display metadata', () => {
		const message = promptMessageFor('/workspace/project', {
			id: 'request',
			content: 'Review @"docs/a&b.md" and @src/',
			mode: 'prompt',
			mentions: [
				{path: 'docs/a&b.md', kind: 'file'},
				{path: 'src', kind: 'directory'},
				{path: 'src', kind: 'directory'},
			],
		});
		expect(message.role).toBe('user');
		if (message.role !== 'user') throw new Error('Expected a user message');
		const content = message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
		expect(content).toContain('<mention kind="file">docs/a&amp;b.md</mention>');
		expect(content).toContain('<mention kind="directory">src</mention>');
		expect(content.match(/<mention kind="directory">src<\/mention>/gu)).toHaveLength(1);
		expect(message.metadata).toMatchObject({avenDisplayContent: 'Review @"docs/a&b.md" and @src/'});
	});

	it('drops absolute, escaping, malformed, and duplicate references', () => {
		expect(
			safeWorkspaceMentions('/workspace/project', [
				{path: '/etc/passwd', kind: 'file'},
				{path: '../outside', kind: 'file'},
				{path: 'src/../secret', kind: 'file'},
				{path: 'src/app.ts', kind: 'file'},
				{path: 'src/app.ts', kind: 'file'},
			]),
		).toEqual([{path: 'src/app.ts', kind: 'file'}]);
	});
});
