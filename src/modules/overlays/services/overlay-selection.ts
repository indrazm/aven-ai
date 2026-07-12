import {isProviderId, type ProviderId} from '../../providers/index.js';
import type {ConnectionState, ProviderStatus} from '../../providers/index.js';
import type {OverlayItem, OverlayState} from '../types.js';

export type OverlaySelectionIntent =
	| {type: 'restorePrompt'; value: string}
	| {type: 'switchSession'; sessionId: string}
	| {type: 'requestApiKey'; provider: ProviderId}
	| {type: 'connectProvider'; provider: ProviderId}
	| {type: 'selectModel'; model: string}
	| {type: 'handled'};

export const overlaySelectionIntent = (
	overlay: OverlayState,
	items: readonly OverlayItem[],
	connection: ConnectionState,
	providers: readonly ProviderStatus[],
): OverlaySelectionIntent => {
	const selected = items[overlay.selectedIndex];
	if (overlay.route === 'history' && selected) return {type: 'restorePrompt', value: selected.label};
	if (overlay.route === 'sessions' && selected?.value) return {type: 'switchSession', sessionId: selected.value};
	if (
		(overlay.route === 'connect' || overlay.route === 'setupProvider') &&
		selected?.value &&
		isProviderId(selected.value)
	) {
		const provider = selected.value;
		const status = providers.find((item) => item.id === provider);
		if (overlay.route === 'setupProvider' || !status?.configured) return {type: 'requestApiKey', provider};
		if (connection.status !== 'connecting') return {type: 'connectProvider', provider};
	}
	if (overlay.route === 'model' && selected?.value && connection.status === 'connected') {
		return {type: 'selectModel', model: selected.value};
	}
	return {type: 'handled'};
};
