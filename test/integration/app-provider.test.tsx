import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {App} from '../../src/modules/app/index.js';
import {SetupRuntime} from '../support/runtime-fakes.js';

describe('App provider flows', () => {
	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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

	it('collects and normalizes a Databricks workspace URL before masking its API key', async () => {
		const runtime = new SetupRuntime();
		const {lastFrame, stdin, unmount} = render(<App runtime={runtime} />);
		await tick();

		stdin.write('/setup');
		await tick();
		stdin.write('\r');
		await tick();
		for (let index = 0; index < 7; index += 1) {
			stdin.write('\u001B[B');
			await tick();
		}
		expect(lastFrame()).toContain('Databricks');
		stdin.write('\r');
		await tick();
		expect(lastFrame()).toContain('Enter workspace URL');

		stdin.write('dbc.example.databricks.com');
		await tick();
		expect(lastFrame()).toContain('dbc.example.databricks.com');
		stdin.write('\r');
		await tick();
		expect(lastFrame()).toContain('Enter API key');

		stdin.write('databricks-secret');
		await tick();
		expect(lastFrame()).not.toContain('databricks-secret');
		stdin.write('\r');
		await tick();
		await tick();

		expect(runtime.lastCredentials).toEqual({
			apiKey: 'databricks-secret',
			baseUrl: 'https://dbc.example.databricks.com/ai-gateway/mlflow/v1',
		});
		expect(lastFrame()).toContain('Databricks · test-model');
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
