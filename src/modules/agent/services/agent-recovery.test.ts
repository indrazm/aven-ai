import {Message, runControl, toolCallControl} from '@anvia/core';
import {describe, expect, it} from 'vitest';
import {canonicalToolSignature, createAgentRecovery, repeatingSuffix} from './agent-recovery.js';

const failedCommandResult = JSON.stringify({
	command: 'false',
	cwd: '/workspace',
	exitCode: 1,
	signal: null,
	timedOut: false,
	truncated: false,
	output: '',
});

const successfulCommandResult = JSON.stringify({
	command: 'true',
	cwd: '/workspace',
	exitCode: 0,
	signal: null,
	timedOut: false,
	truncated: false,
	output: '',
});

const applyResult = async (
	recovery: ReturnType<typeof createAgentRecovery>,
	result: string,
	call = 1,
): Promise<Record<string, unknown> | undefined> => {
	const output = await recovery.middleware.onToolOutput?.({
		toolName: 'ExecCommand',
		args: '{}',
		result,
		originalResult: result,
		turn: call,
		internalCallId: `call-${call}`,
	});
	if (output === undefined) return undefined;
	if (typeof output !== 'string') throw new Error('Expected serialized recovery output.');
	return JSON.parse(output) as Record<string, unknown>;
};

const startNextTurn = async (recovery: ReturnType<typeof createAgentRecovery>) =>
	recovery.hook.onTurnStart?.({turn: 6, prompt: Message.user('continue'), history: [], run: runControl});

const callTool = async (recovery: ReturnType<typeof createAgentRecovery>, internalCallId: string, command: string) =>
	recovery.hook.onToolCall?.({
		toolName: 'ExecCommand',
		args: JSON.stringify({command}),
		internalCallId,
		tool: toolCallControl,
	});

describe('agent recovery', () => {
	it('canonicalizes object key order and detects repeated suffix patterns', () => {
		expect(canonicalToolSignature('Read', '{"line":1,"file_path":"a"}')).toBe(
			canonicalToolSignature('Read', '{"file_path":"a","line":1}'),
		);
		expect(repeatingSuffix(['A', 'B', 'A', 'B', 'A', 'B'])).toEqual({patternLength: 2, repetitions: 3});
		expect(repeatingSuffix(['A', 'B', 'A', 'B', 'A'])).toBeUndefined();
	});

	it('adds reflection guidance, warns at three failures, and stops after the fifth visible failure', async () => {
		const recovery = createAgentRecovery();

		for (let call = 1; call <= 5; call++) {
			const result = await applyResult(recovery, failedCommandResult, call);
			expect(result?.agent_guidance).toContain(`(${call}/5)`);
			if (call < 3) expect(result?.agent_guidance).not.toContain('Do not repeat the same call unchanged');
			if (call >= 3) expect(result?.agent_guidance).toContain('Do not repeat the same call unchanged');
		}

		expect(await startNextTurn(recovery)).toEqual({
			type: 'terminate',
			reason: 'ExecCommand failed 5 consecutive times.',
		});
	});

	it('resets a tool failure streak after a successful result', async () => {
		const recovery = createAgentRecovery();
		await applyResult(recovery, failedCommandResult, 1);
		await applyResult(recovery, failedCommandResult, 2);
		expect(await applyResult(recovery, successfulCommandResult, 3)).toBeUndefined();

		const result = await applyResult(recovery, failedCommandResult, 4);
		expect(result?.agent_guidance).toContain('(1/5)');
	});

	it('skips the third repeated call and stops after the fifth repetition', async () => {
		const recovery = createAgentRecovery();
		expect(await callTool(recovery, 'call-1', 'pwd')).toBeUndefined();
		expect(await callTool(recovery, 'call-2', 'pwd')).toBeUndefined();
		expect(await callTool(recovery, 'call-3', 'pwd')).toEqual(
			expect.objectContaining({type: 'skip', reason: expect.stringContaining('occurred 3 times')}),
		);
		await callTool(recovery, 'call-4', 'pwd');
		expect(await callTool(recovery, 'call-5', 'pwd')).toEqual(
			expect.objectContaining({type: 'skip', reason: expect.stringContaining('occurred 5 times')}),
		);
		expect(await startNextTurn(recovery)).toEqual(
			expect.objectContaining({type: 'terminate', reason: expect.stringContaining('occurred 5 times')}),
		);
	});

	it('detects alternating call loops as a repeated pattern', async () => {
		const recovery = createAgentRecovery();
		for (const [index, command] of ['A', 'B', 'A', 'B', 'A'].entries()) {
			expect(await callTool(recovery, `call-${index}`, command)).toBeUndefined();
		}
		expect(await callTool(recovery, 'call-6', 'B')).toEqual(
			expect.objectContaining({type: 'skip', reason: expect.stringContaining('pattern of length 2')}),
		);
	});
});
