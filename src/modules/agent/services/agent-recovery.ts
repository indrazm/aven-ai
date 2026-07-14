import {createHook, createMiddleware} from '@anvia/core';

export const FAILURE_WARNING_THRESHOLD = 3;
export const FAILURE_STOP_THRESHOLD = 5;
export const LOOP_WARNING_THRESHOLD = 3;
export const LOOP_STOP_THRESHOLD = 5;

type JsonRecord = Record<string, unknown>;

type LoopMatch = {
	patternLength: number;
	repetitions: number;
};

type RecoveryState = {
	failures: Map<string, number>;
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

const failureGuidance = (toolName: string, reason: string, failureCount: number): string => {
	const attemptsRemaining = Math.max(0, FAILURE_STOP_THRESHOLD - failureCount);
	const warning =
		failureCount >= FAILURE_WARNING_THRESHOLD
			? 'Do not repeat the same call unchanged; inspect the error and choose a materially different approach.'
			: 'Inspect the error, correct the arguments or approach, and retry only when there is a concrete reason it should succeed.';
	return `${toolName} failed (${failureCount}/${FAILURE_STOP_THRESHOLD}): ${reason} ${warning} Attempts remaining before this run stops: ${attemptsRemaining}.`;
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
		failures: new Map(),
		toolCalls: [],
		loopsByCall: new Map(),
	};

	const middleware = createMiddleware({
		onToolOutput: ({toolName, result, internalCallId}) => {
			const loop = state.loopsByCall.get(internalCallId);
			state.loopsByCall.delete(internalCallId);
			const reason = failureReason(toolName, result);
			if (!reason && !loop) {
				state.failures.delete(toolName);
				return undefined;
			}

			const failureCount = (state.failures.get(toolName) ?? 0) + 1;
			state.failures.set(toolName, failureCount);
			if (failureCount >= FAILURE_STOP_THRESHOLD && !state.stopReason) {
				state.stopReason = `${toolName} failed ${failureCount} consecutive times.`;
			}
			const guidance = [
				loop ? loopGuidance(loop) : '',
				failureGuidance(toolName, reason ?? 'The repeated call was skipped.', failureCount),
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
