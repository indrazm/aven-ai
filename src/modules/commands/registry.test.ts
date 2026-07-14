import {describe, expect, it} from 'vitest';
import {overlayItems} from '../overlays/index.js';
import {actionForCommand, commandItems, routeForCommand} from './registry.js';

describe('command registry', () => {
	it('drives command routing and the commands overlay from one source', () => {
		expect(overlayItems('commands')).toEqual(commandItems);
		for (const command of commandItems) expect(routeForCommand(command.label)).toBe(command.route);
		expect(commandItems.map((command) => command.label)).toContain('/commands');
		expect(commandItems.map((command) => command.label)).not.toContain('/history');
		expect(routeForCommand('/history')).toBeUndefined();
		expect(routeForCommand('/resume')).toBe('sessions');
		expect(routeForCommand('/sessions')).toBeUndefined();
		expect(actionForCommand('/new')).toBe('newSession');
		expect(actionForCommand('/resume-last')).toBe('resumeLastSession');
	});
});
