import type {OverlayItem, OverlayRoute} from '../types.js';
import {commandItems} from '../../commands/index.js';

export const overlayTitle: Record<OverlayRoute, string> = {
	help: 'Help',
	sessions: 'Project sessions',
	commands: 'Commands',
	connect: 'Connect provider',
	setupProvider: 'Set up provider',
	setupBaseUrl: 'Enter workspace URL',
	setupKey: 'Enter API key',
	model: 'Model',
	theme: 'Theme',
	search: 'Search transcript',
};

const items: Record<OverlayRoute, readonly OverlayItem[]> = {
	help: [
		{label: 'Enter', description: 'submit prompt'},
		{label: 'Shift/Alt+Enter', description: 'insert newline'},
		{label: '@', description: 'mention a project file or folder; Tab/Enter inserts'},
		{label: 'Ctrl+O', description: 'toggle transcript navigation and expand tool output'},
		{label: 'Ctrl+C', description: 'interrupt; press twice while idle to exit'},
		{label: 'Ctrl+D', description: 'press twice on empty input to exit'},
		{label: '! on empty input', description: 'enter direct PTY command mode'},
		{label: 'Mouse', description: 'wheel scroll; drag/double/triple click selects'},
	],
	sessions: [],
	connect: [],
	setupProvider: [],
	setupBaseUrl: [],
	setupKey: [],
	model: [],
	theme: [
		{label: 'Aven Dark', description: 'Active'},
		{label: 'Low contrast', description: 'Preview only'},
		{label: 'ANSI', description: 'Preview only'},
	],
	commands: commandItems,
	search: [],
};

export const overlayItems = (route: OverlayRoute): readonly OverlayItem[] => items[route];
