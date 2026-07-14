import type {UiMessage} from '../../conversation/index.js';
import type {ProjectSessionSummary} from '../../sessions/index.js';
import type {ConnectionState, ModelStatus, ProviderStatus} from '../../providers/index.js';
import {overlayItems as staticOverlayItems} from './overlay-registry.js';
import type {OverlayItem, OverlayState} from '../types.js';

export type OverlayItemContext = {
	messages: readonly UiMessage[];
	connection: {
		state: ConnectionState;
		providers: readonly ProviderStatus[];
		models: readonly ModelStatus[];
	};
	workspace: {
		supported: boolean;
		sessions: readonly ProjectSessionSummary[];
		error?: string;
	};
};

export const buildOverlayItems = (
	overlay: OverlayState | null,
	context: OverlayItemContext,
): readonly OverlayItem[] => {
	if (!overlay) return [];
	if (overlay.route === 'sessions') {
		if (!context.workspace.supported) {
			return [{label: 'Unavailable', description: 'Runtime does not support project sessions'}];
		}
		if (context.workspace.error) {
			return [{label: context.workspace.error, description: 'Current chat remains available'}];
		}
		return context.workspace.sessions.map((session) => ({
			label: session.title,
			description: `${session.active ? 'active · ' : ''}${session.updatedAt.slice(0, 16).replace('T', ' ')}`,
			value: session.id,
		}));
	}
	if (overlay.route === 'connect') {
		return context.connection.providers.map((provider) => ({
			label: provider.label,
			description: provider.active
				? `${provider.model ? `${provider.model} · ` : ''}connected`
				: provider.configured
					? `${provider.model ? `${provider.model} · ` : ''}configured`
					: 'credentials required',
			value: provider.id,
		}));
	}
	if (overlay.route === 'model') {
		if (context.connection.state.status !== 'connected') {
			return [{label: 'Not connected', description: 'Run /connect'}];
		}
		return context.connection.models.map((model) => ({
			label: model.id,
			description: model.active
				? `${context.connection.state.providerLabel} · active`
				: `${context.connection.state.providerLabel} · cached`,
			value: model.id,
		}));
	}
	if (overlay.route === 'search') {
		return context.messages.map((message) => ({
			label:
				message.kind === 'tool'
					? `${message.name}: ${message.summary}`
					: message.kind === 'diff'
						? message.file
						: (message.content.split('\n')[0] ?? ''),
			description: message.kind,
		}));
	}
	return staticOverlayItems(overlay.route);
};
