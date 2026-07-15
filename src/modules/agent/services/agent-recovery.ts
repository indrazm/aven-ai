import {createHook, createMiddleware} from '@anvia/core';

export const FAILURE_WARNING_THRESHOLD = 3;
export const FAILURE_STOP_THRESHOLD = 5;
export const GLOBAL_FAILURE_STOP_THRESHOLD = 10;
export const LOOP_WARNING_THRESHOLD = 3;
export const LOOP_STOP_THRESHOLD = 5;

type JsonRecord = Record<string, unknown>;

type LoopMatch = {
	patternLength: number;
	repetitions: number;
};

type FailureStreak = {
	signature: string;
	count: number;
};

type RecoveryState = {
	failure: FailureStreak | undefined;
	consecutiveFailures: number;
	toolCalls: string[];
	loopsByCall: Map<string, LoopMatch>;
	stopReason?: string;
};

const isRecord = (value: unknown): value is JsonRecord =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const parseRecord = (value: string): JsonRecord | undefined => {
	try {
		const parsed: unknown = JSON.parse(value);
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
};

const canonicalValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonicalValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.keys(value)
			.sort()
			.map((key) => [key, canonicalValue(value[key])]),
	);
};

export const canonicalToolSignature = (toolName: string, args: string): string => {
	let normalized: unknown = args.trim();
	try {
		normalized = canonicalValue(JSON.parse(args));
	} catch {
		// Malformed arguments still need a stable signature for repetition checks.
	}
	return `${toolName}:${typeof normalized === 'string' ? normalized : JSON.stringify(normalized)}`;
};

export const repeatingSuffix = (sequence: readonly string[]): LoopMatch | undefined => {
	let best: LoopMatch | undefined;
	for (let patternLength = 1; patternLength <= Math.floor(sequence.length / LOOP_WARNING_THRESHOLD); patternLength++) {
		const patternStart = sequence.length - patternLength;
		const pattern = sequence.slice(patternStart);
		let repetitions = 1;
		for (let end = patternStart; end >= patternLength; end -= patternLength) {
			const candidate = sequence.slice(end - patternLength, end);
			if (!candidate.every((item, index) => item === pattern[index])) break;
			repetitions += 1;
		}
		if (
			repetitions >= LOOP_WARNING_THRESHOLD &&
			(!best ||
				repetitions > best.repetitions ||
				(repetitions === best.repetitions && patternLength < best.patternLength))
		) {
			best = {patternLength, repetitions};
		}
	}
	return best;
};

const failureReason = (toolName: string, result: string): string | undefined => {
	const parsed = parseRecord(result);
	if (!parsed) return 'The tool returned an unstructured or malformed result.';
	if (parsed.status === 'error') return typeof parsed.error === 'string' ? parsed.error : 'The tool reported an error.';
	if (toolName === 'ExecCommand') {
		if (parsed.timedOut === true) return 'The command timed out.';
		if (typeof parsed.signal === 'number' && parsed.signal !== 0)
			return `The command exited after signal ${parsed.signal}.`;
		if (typeof parsed.exitCode !== 'number') return 'The command result did not include a valid exit code.';
		if (parsed.exitCode !== 0) return `The command exited with code ${parsed.exitCode}.`;
		return undefined;
	}
	if (toolName === 'Read') {
		return parsed.status === 'success' || parsed.status === 'unchanged'
			? undefined
			: 'Read returned an unexpected result shape.';
	}
	if (toolName === 'Edit' || toolName === 'Write') {
		return parsed.status === 'success' ? undefined : `${toolName} returned an unexpected result shape.`;
	}
	return undefined;
};

const failureGuidance = (
	toolName: string,
	reason: string,
	failureCount: number,
	consecutiveFailures: number,
): string => {
	const attemptsRemaining = Math.max(
		0,
		Math.min(FAILURE_STOP_THRESHOLD - failureCount, GLOBAL_FAILURE_STOP_THRESHOLD - consecutiveFailures),
	);
	const warning =
		failureCount >= FAILURE_WARNING_THRESHOLD
			? 'Do not repeat the same call unchanged; inspect the error and choose a materially different approach.'
			: consecutiveFailures >= FAILURE_WARNING_THRESHOLD
				? 'Several different calls have failed without a success; inspect their errors instead of continuing to guess.'
				: 'Inspect the error, correct the arguments or approach, and retry only when there is a concrete reason it should succeed.';
	return `${toolName} failed (${failureCount}/${FAILURE_STOP_THRESHOLD}): ${reason} Consecutive tool failures without a success: ${consecutiveFailures}/${GLOBAL_FAILURE_STOP_THRESHOLD}. ${warning} Attempts remaining before this run stops: ${attemptsRemaining}.`;
};

const loopGuidance = ({patternLength, repetitions}: LoopMatch): string =>
	`A repeating tool-call pattern of length ${patternLength} has occurred ${repetitions} times. The repeated call was skipped. Change tools, arguments, or strategy before continuing.`;

const guidedResult = (toolName: string, result: string, guidance: string): string => {
	const parsed = parseRecord(result);
	if (parsed) return JSON.stringify({...parsed, agent_guidance: guidance});
	return JSON.stringify({status: 'error', tool: toolName, error: result, agent_guidance: guidance});
};

export const createAgentRecovery = () => {
	const state: RecoveryState = {
		failure: undefined,
		consecutiveFailures: 0,
		toolCalls: [],
		loopsByCall: new Map(),
	};

	const middleware = createMiddleware({
		onToolOutput: ({toolName, args, result, internalCallId}) => {
			const loop = state.loopsByCall.get(internalCallId);
			state.loopsByCall.delete(internalCallId);
			const reason = failureReason(toolName, result);
			if (!reason && !loop) {
				state.failure = undefined;
				state.consecutiveFailures = 0;
				return undefined;
			}

			const signature = canonicalToolSignature(toolName, args);
			const failureCount = state.failure?.signature === signature ? state.failure.count + 1 : 1;
			state.failure = {signature, count: failureCount};
			state.consecutiveFailures += 1;
			if (failureCount >= FAILURE_STOP_THRESHOLD && !state.stopReason) {
				state.stopReason = `${toolName} failed ${failureCount} consecutive times with the same arguments.`;
			} else if (state.consecutiveFailures >= GLOBAL_FAILURE_STOP_THRESHOLD && !state.stopReason) {
				state.stopReason = `Tool calls failed ${state.consecutiveFailures} consecutive times without a success.`;
			}
			const guidance = [
				loop ? loopGuidance(loop) : '',
				failureGuidance(toolName, reason ?? 'The repeated call was skipped.', failureCount, state.consecutiveFailures),
			]
				.filter(Boolean)
				.join(' ');
			return guidedResult(toolName, result, guidance);
		},
	});

	const hook = createHook({
		onTurnStart: ({run}) => (state.stopReason ? run.cancel(state.stopReason) : undefined),
		onToolCall: ({toolName, args, internalCallId, tool}) => {
			const signature = canonicalToolSignature(toolName, args);
			state.toolCalls.push(signature);
			const loop = repeatingSuffix(state.toolCalls);
			if (!loop) return undefined;
			state.loopsByCall.set(internalCallId, loop);
			if (loop.repetitions >= LOOP_STOP_THRESHOLD && !state.stopReason) {
				state.stopReason = `A repeating tool-call pattern occurred ${loop.repetitions} times.`;
			}
			return tool.skip(loopGuidance(loop));
		},
	});

	return {hook, middleware};
};
