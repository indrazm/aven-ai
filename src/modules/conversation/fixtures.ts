import type {UiMessage} from './types.js';

// Rendering-only fixtures. The production app starts with live runtime state.
export const demoMessages: UiMessage[] = [
	{id: 'user-1', kind: 'user', variant: 'prompt', content: 'Inspect the workspace.'},
	{
		id: 'assistant-1',
		kind: 'assistant',
		variant: 'text',
		content: 'Example output:\n\n```ts\nconst ready = true;\n```',
	},
	{
		id: 'tool-1',
		kind: 'tool',
		name: 'exec_command',
		status: 'success',
		summary: 'pwd',
		detail: '/workspace',
		group: 'bash',
	},
	{id: 'system-1', kind: 'system', level: 'info', content: 'Rendering fixture'},
	{id: 'diff-1', kind: 'diff', file: 'source/server.ts', before: 'old\n', after: 'new\n'},
];
