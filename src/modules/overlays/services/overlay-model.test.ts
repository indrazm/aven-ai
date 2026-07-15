import {describe, expect, it} from 'vitest';
import {buildOverlayItems, type OverlayItemContext} from './overlay-items.js';
import {overlaySelectionIntent} from './overlay-selection.js';

const context: OverlayItemContext = {
	messages: [],
	connection: {
		state: {status: 'disconnected'},
		providers: [{id: 'openai', label: 'OpenAI', model: 'gpt-5', configured: false, active: false}],
		models: [],
	},
	workspace: {supported: false, sessions: []},
};

describe('overlay models', () => {
	it('builds route-specific items without React state', () => {
		expect(buildOverlayItems({route: 'sessions', query: '', selectedIndex: 0}, context)[0]?.label).toBe('Unavailable');
		expect(buildOverlayItems({route: 'connect', query: '', selectedIndex: 0}, context)[0]?.description).toContain(
			'credentials required',
		);
	});

	it('projects session, model, search, and static routes', () => {
		const connected: OverlayItemContext = {
			messages: [
				{id: 'tool', kind: 'tool', name: 'Read', status: 'success', summary: '/tmp/a', group: 'read'},
				{
					id: 'diff',
					kind: 'diff',
					file: '/tmp/a',
					tool: 'Edit',
					presentation: 'patch',
					hunks: [{oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-a', '+b']}],
					additions: 1,
					deletions: 1,
				},
				{id: 'system', kind: 'system', level: 'info', content: 'first\nsecond'},
			],
			connection: {
				state: {status: 'connected', provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-5'},
				providers: [{id: 'openai', label: 'OpenAI', model: 'gpt-5', configured: true, active: true}],
				models: [
					{id: 'gpt-5', active: true},
					{id: 'gpt-5-mini', active: false},
				],
			},
			workspace: {
				supported: true,
				sessions: [
					{
						id: 'session',
						projectRoot: '/project',
						title: 'Work',
						createdAt: '2026-01-01T00:00:00Z',
						updatedAt: '2026-01-02T03:04:00Z',
						active: true,
						persisted: true,
					},
				],
			},
		};
		expect(buildOverlayItems({route: 'sessions', query: '', selectedIndex: 0}, connected)[0]).toMatchObject({
			label: 'Work',
			value: 'session',
			description: expect.stringContaining('active'),
		});
		expect(buildOverlayItems({route: 'connect', query: '', selectedIndex: 0}, connected)[0]?.description).toContain(
			'connected',
		);
		expect(
			buildOverlayItems({route: 'model', query: '', selectedIndex: 0}, connected).map((item) => item.description),
		).toEqual(['OpenAI · active', 'OpenAI · cached']);
		expect(
			buildOverlayItems({route: 'search', query: '', selectedIndex: 0}, connected).map((item) => item.label),
		).toEqual(['Read: /tmp/a', '/tmp/a', 'first']);
		expect(buildOverlayItems({route: 'help', query: '', selectedIndex: 0}, connected).length).toBeGreaterThan(0);
		expect(buildOverlayItems({route: 'help', query: '', selectedIndex: 0}, connected)).not.toContainEqual(
			expect.objectContaining({label: 'Ctrl+R'}),
		);
		expect(
			buildOverlayItems(
				{route: 'sessions', query: '', selectedIndex: 0},
				{
					...connected,
					workspace: {supported: true, sessions: [], error: 'Catalog failed'},
				},
			)[0]?.label,
		).toBe('Catalog failed');
		expect(buildOverlayItems({route: 'model', query: '', selectedIndex: 0}, context)[0]?.label).toBe('Not connected');
	});

	it('resolves selections into typed effect intents', () => {
		const items = [{label: 'OpenAI', description: '', value: 'openai'}];
		expect(
			overlaySelectionIntent(
				{route: 'connect', query: '', selectedIndex: 0},
				items,
				{status: 'disconnected'},
				context.connection.providers,
			),
		).toEqual({type: 'requestApiKey', provider: 'openai'});
		expect(
			overlaySelectionIntent(
				{route: 'model', query: '', selectedIndex: 0},
				[{label: 'gpt-5', description: '', value: 'gpt-5'}],
				{status: 'connected', provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-5'},
				[],
			),
		).toEqual({type: 'selectModel', model: 'gpt-5'});
	});

	it('resolves every actionable route and safely handles unavailable selections', () => {
		expect(
			overlaySelectionIntent(
				{route: 'sessions', query: '', selectedIndex: 0},
				[{label: 'Work', description: '', value: 'session'}],
				{status: 'disconnected'},
				[],
			),
		).toEqual({type: 'switchSession', sessionId: 'session'});
		const configured = [{id: 'openai' as const, label: 'OpenAI', model: 'gpt-5', configured: true, active: false}];
		expect(
			overlaySelectionIntent(
				{route: 'connect', query: '', selectedIndex: 0},
				[{label: 'OpenAI', description: '', value: 'openai'}],
				{status: 'disconnected'},
				configured,
			),
		).toEqual({type: 'connectProvider', provider: 'openai'});
		expect(
			overlaySelectionIntent(
				{route: 'connect', query: '', selectedIndex: 0},
				[{label: 'OpenAI', description: '', value: 'openai'}],
				{status: 'connecting'},
				configured,
			),
		).toEqual({type: 'handled'});
		expect(
			overlaySelectionIntent(
				{route: 'model', query: '', selectedIndex: 0},
				[{label: 'gpt-5', description: '', value: 'gpt-5'}],
				{status: 'disconnected'},
				[],
			),
		).toEqual({type: 'handled'});
		expect(
			overlaySelectionIntent({route: 'help', query: '', selectedIndex: 5}, [], {status: 'disconnected'}, []),
		).toEqual({type: 'handled'});
	});
});
