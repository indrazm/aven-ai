import type {UiMessage} from '../../conversation/index.js';

export const promptHistoryFromMessages = (messages: readonly UiMessage[]): string[] => {
	const history: string[] = [];
	const seen = new Set<string>();
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.kind !== 'user' || message.variant !== 'prompt' || seen.has(message.content)) continue;
		seen.add(message.content);
		history.push(message.content);
	}
	return history;
};
