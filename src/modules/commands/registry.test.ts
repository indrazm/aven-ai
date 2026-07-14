import {describe, expect, it} from 'vitest';
import {actionForCommand, commandItems, routeForCommand} from './registry.js';

describe('command registry', () => {
	it('drives canonical slash command routing', () => {
		for (const command of commandItems) expect(routeForCommand(command.label)).toBe(command.route);
		expect(commandItems.map((command) => command.label)).not.toContain('/setup');
		expect(commandItems.map((command) => command.label)).not.toContain('/commands');
		expect(routeForCommand('/setup')).toBeUndefined();
		expect(routeForCommand('/commands')).toBeUndefined();
		expect(commandItems.map((command) => command.label)).not.toContain('/history');
		expect(routeForCommand('/history')).toBeUndefined();
		expect(routeForCommand('/resume')).toBe('sessions');
		expect(routeForCommand('/sessions')).toBeUndefined();
		expect(actionForCommand('/new')).toBe('newSession');
		expect(actionForCommand('/resume-last')).toBe('resumeLastSession');
	});
});
