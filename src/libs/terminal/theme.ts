export type RowTone =
	| 'text'
	| 'muted'
	| 'subtle'
	| 'accent'
	| 'user'
	| 'tool'
	| 'permission'
	| 'success'
	| 'warning'
	| 'error'
	| 'code'
	| 'addition'
	| 'deletion';

export const theme = {
	text: '#d6d6d6',
	muted: '#8a8a8a',
	subtle: '#626262',
	accent: '#f2f2f2',
	user: '#d6d6d6',
	tool: '#b8b8b8',
	permission: '#a3a3a3',
	success: '#b8b8b8',
	warning: '#b0b0b0',
	error: '#eeeeee',
	code: '#c9c9c9',
	addition: '#c2c2c2',
	deletion: '#9c9c9c',
	userBackground: '#2b2b2b',
	codeBackground: '#222222',
	selectionBackground: '#454545',
	hoverBackground: '#343434',
	promptBorder: '#777777',
	provider: '#e5c07b',
} as const;

export const toneColor = (tone: RowTone | undefined): string => theme[tone ?? 'text'];
