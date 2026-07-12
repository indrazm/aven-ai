import type {RuntimeEvent} from '../../agent/index.js';
import type {AppStoreState} from './app-state.js';

export const applyRuntimeEvent = (state: AppStoreState, event: RuntimeEvent): AppStoreState => {
	switch (event.type) {
		case 'turn.started':
			return {
				...state,
				messages: [
					...state.messages,
					{
						id: `user-${event.request.id}`,
						kind: 'user',
						variant: event.request.mode === 'bash' ? 'bash' : 'prompt',
						content: event.request.content,
					},
				],
				status: event.request.mode === 'bash' ? 'idle' : 'thinking',
				activeTurnId: event.request.id,
			};
		case 'status.changed':
			return {...state, status: event.status};
		case 'message.appended':
			return {...state, messages: [...state.messages, event.message]};
		case 'message.replaced': {
			const index = state.messages.findIndex((message) => message.id === event.message.id);
			return index === -1
				? {...state, messages: [...state.messages, event.message]}
				: {
						...state,
						messages: state.messages.map((message, messageIndex) => (messageIndex === index ? event.message : message)),
					};
		}
		case 'assistant.delta': {
			const existing = state.messages.find((message) => message.id === event.messageId);
			if (existing?.kind !== 'assistant') {
				if (!event.delta.trim()) return state;
				return {
					...state,
					messages: [
						...state.messages,
						{
							id: event.messageId,
							kind: 'assistant',
							variant: 'text',
							content: event.delta,
						},
					],
				};
			}
			return {
				...state,
				messages: state.messages.map((message) =>
					message.id === event.messageId && message.kind === 'assistant'
						? {...message, content: message.content + event.delta}
						: message,
				),
			};
		}
		case 'turn.completed':
			return state.activeTurnId === event.turnId ? {...state, status: 'idle', activeTurnId: null} : state;
		case 'turn.failed':
			if (state.activeTurnId !== event.turnId) return state;
			return {
				...state,
				status: 'error',
				activeTurnId: null,
				messages: [
					...state.messages,
					{id: `runtime-error-${event.turnId}`, kind: 'system', level: 'error', content: event.error},
				],
			};
	}
};
