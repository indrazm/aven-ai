import {describe, expect, it} from 'vitest';
import {activeTurnInputAction, hasActiveTurn} from './use-app-input.js';

describe('active-turn composer input', () => {
	it('recognizes an active turn from either its id or running status', () => {
		expect(hasActiveTurn('idle', 'turn-1')).toBe(true);
		expect(hasActiveTurn('thinking', null)).toBe(true);
		expect(hasActiveTurn('runningTool', null)).toBe(true);
		expect(hasActiveTurn('waitingPermission', null)).toBe(true);
		expect(hasActiveTurn('idle', null)).toBe(false);
		expect(hasActiveTurn('error', null)).toBe(false);
	});

	it('uses plain Enter to steer and plain Tab to enqueue nonblank text', () => {
		expect(activeTurnInputAction('follow this', {return: true}, true)).toBe('steer');
		expect(activeTurnInputAction('follow this', {tab: true}, true)).toBe('enqueue');
	});

	it('leaves inactive, blank, and modified keys to normal composer behavior', () => {
		expect(activeTurnInputAction('follow this', {return: true}, false)).toBeUndefined();
		expect(activeTurnInputAction('   ', {return: true}, true)).toBeUndefined();
		expect(activeTurnInputAction('follow this', {return: true, shift: true}, true)).toBeUndefined();
		expect(activeTurnInputAction('follow this', {return: true, meta: true}, true)).toBeUndefined();
		expect(activeTurnInputAction('follow this', {tab: true, shift: true}, true)).toBeUndefined();
	});
});
