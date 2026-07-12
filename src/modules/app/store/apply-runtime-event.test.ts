import {describe, expect, it} from 'vitest';
import {createAppStore} from './create-app-store.js';

describe('application store runtime events', () => {
	it('applies an ordered turn and streaming assistant deltas', () => {
		const store = createAppStore();
		const actions = store.getState();
		actions.applyRuntimeEvent({
			type: 'turn.started',
			request: {id: 'turn-1', content: 'hello', mode: 'prompt'},
		});
		actions.applyRuntimeEvent({type: 'assistant.delta', messageId: 'answer-1', delta: 'Hello'});
		actions.applyRuntimeEvent({type: 'assistant.delta', messageId: 'answer-1', delta: ' world'});
		actions.applyRuntimeEvent({type: 'turn.completed', turnId: 'turn-1'});

		expect(store.getState()).toMatchObject({status: 'idle', activeTurnId: null});
		expect(store.getState().messages).toMatchObject([
			{kind: 'user', content: 'hello'},
			{kind: 'assistant', content: 'Hello world'},
		]);
	});

	it('does not create transcript rows for whitespace-only assistant turns', () => {
		const store = createAppStore();
		store.getState().applyRuntimeEvent({type: 'assistant.delta', messageId: 'empty-answer', delta: '\n\n'});

		expect(store.getState().messages).toEqual([]);
	});

	it('keeps app instances isolated', () => {
		const first = createAppStore();
		const second = createAppStore();
		first.getState().setEditor({value: 'first', cursor: 5});
		expect(first.getState().editor.value).toBe('first');
		expect(second.getState().editor.value).toBe('');
	});

	it('queues and shifts requests in order', () => {
		const store = createAppStore();
		store.getState().enqueueRequest({id: 'one', content: 'first', mode: 'prompt'});
		store.getState().enqueueRequest({id: 'two', content: 'second', mode: 'prompt'});
		expect(store.getState().shiftQueuedRequest()?.id).toBe('one');
		expect(store.getState().shiftQueuedRequest()?.id).toBe('two');
	});

	it('resets session-scoped state when changing conversations', () => {
		const store = createAppStore();
		store.getState().applyRuntimeEvent({
			type: 'turn.started',
			request: {id: 'active', content: 'old prompt', mode: 'prompt'},
		});
		store.getState().enqueueRequest({id: 'queued', content: 'queued prompt', mode: 'prompt'});
		store.getState().setEditor({value: 'draft', cursor: 5});
		store.getState().setOverlay({route: 'history', query: 'old', selectedIndex: 0});
		store.getState().setTranscriptMode(true);

		store.getState().resetSession([{id: 'restored', kind: 'user', variant: 'prompt', content: 'restored'}]);

		expect(store.getState()).toMatchObject({
			status: 'idle',
			activeTurnId: null,
			queuedRequests: [],
			editor: {value: '', cursor: 0},
			overlay: null,
			transcriptMode: false,
		});
		expect(store.getState().messages).toEqual([{id: 'restored', kind: 'user', variant: 'prompt', content: 'restored'}]);
	});

	it('replaces tool state and exposes runtime failures without leaving an active turn', () => {
		const store = createAppStore();
		store.getState().applyRuntimeEvent({
			type: 'turn.started',
			request: {id: 'turn', content: 'hello', mode: 'prompt'},
		});
		store.getState().applyRuntimeEvent({
			type: 'message.appended',
			message: {id: 'tool', kind: 'tool', name: 'Read', status: 'running', summary: 'Reading'},
		});
		store.getState().applyRuntimeEvent({
			type: 'message.replaced',
			message: {id: 'tool', kind: 'tool', name: 'Read', status: 'success', summary: 'Read file'},
		});
		store.getState().applyRuntimeEvent({type: 'turn.failed', turnId: 'turn', error: 'runtime unavailable'});

		expect(store.getState()).toMatchObject({status: 'error', activeTurnId: null});
		expect(store.getState().messages.find((message) => message.id === 'tool')).toMatchObject({status: 'success'});
		expect(store.getState().messages.at(-1)).toMatchObject({
			kind: 'system',
			level: 'error',
			content: 'runtime unavailable',
		});
		store.getState().recover();
		expect(store.getState()).toMatchObject({status: 'idle', activeTurnId: null});
	});

	it('never rewrites multiple transcript blocks when a runtime accidentally repeats an id', () => {
		const store = createAppStore();
		const running = {id: 'duplicate', kind: 'tool', name: 'Read', status: 'running', summary: 'file'} as const;
		store.getState().applyRuntimeEvent({type: 'message.appended', message: running});
		store.getState().applyRuntimeEvent({type: 'message.appended', message: running});
		store.getState().applyRuntimeEvent({
			type: 'message.replaced',
			message: {...running, status: 'success'},
		});

		expect(store.getState().messages.map((message) => (message.kind === 'tool' ? message.status : undefined))).toEqual([
			'success',
			'running',
		]);
	});

	it('ignores completion and failure events from a superseded turn', () => {
		const store = createAppStore();
		store.getState().applyRuntimeEvent({
			type: 'turn.started',
			request: {id: 'current', content: 'hello', mode: 'prompt'},
		});
		store.getState().applyRuntimeEvent({type: 'turn.completed', turnId: 'stale'});
		store.getState().applyRuntimeEvent({type: 'turn.failed', turnId: 'stale', error: 'late failure'});

		expect(store.getState()).toMatchObject({status: 'thinking', activeTurnId: 'current'});
		expect(store.getState().messages).not.toContainEqual(expect.objectContaining({content: 'late failure'}));
	});
});
