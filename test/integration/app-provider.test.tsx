import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {App} from '../../src/modules/app/index.js';
import {SetupRuntime} from '../support/runtime-fakes.js';

describe('App provider flows', () => {
	it('sets up a provider without rendering the API key', async () => {
		const runtime = new SetupRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		await new Promise((resolve) => setTimeout(resolve, 0));

		stdin.write('/setup');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('Set up provider');
		expect(lastFrame()).toContain('OpenAI');

		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('sk-super-secret');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('Enter API key');
		expect(lastFrame()).not.toContain('sk-super-secret');
		expect(lastFrame()).toContain('•••••••••••••••');

		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(runtime.lastApiKey).toBe('sk-super-secret');
		expect(lastFrame()).toContain('OpenAI · gpt-5');
		expect(lastFrame()).not.toContain('sk-super-secret');
		unmount();
	});

	it('selects a model from the cached provider model list', async () => {
		const runtime = new SetupRuntime();
		runtime.configured = true;
		runtime.connection = {status: 'connected', provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-5'};
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		await new Promise((resolve) => setTimeout(resolve, 0));

		stdin.write('/model');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(lastFrame()).toContain('gpt-5-mini');
		stdin.write('\u001B[B');
		await new Promise((resolve) => setTimeout(resolve, 0));
		stdin.write('\r');
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(runtime.selectedModel).toBe('gpt-5-mini');
		expect(lastFrame()).toContain('OpenAI · gpt-5-mini');
		unmount();
	});
});
