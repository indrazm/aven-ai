import type {Key} from 'ink';

export type TranscriptInputIntent =
	| {type: 'close'}
	| {type: 'scroll'; amount: number}
	| {type: 'page'; direction: -1 | 1}
	| {type: 'start'}
	| {type: 'end'}
	| {type: 'handled'};

export const transcriptInputIntent = (input: string, key: Partial<Key>): TranscriptInputIntent => {
	if (key.escape || input === 'q' || (key.ctrl && input === 'o')) return {type: 'close'};
	if (key.upArrow || input === 'k') return {type: 'scroll', amount: -1};
	if (key.downArrow || input === 'j') return {type: 'scroll', amount: 1};
	if (key.pageUp) return {type: 'page', direction: -1};
	if (key.pageDown) return {type: 'page', direction: 1};
	if (input === 'g') return {type: 'start'};
	if (input === 'G') return {type: 'end'};
	return {type: 'handled'};
};
