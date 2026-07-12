import Fuse from 'fuse.js';
import {useCallback, useMemo} from 'react';
import type {Key} from 'ink';
import type {OverlayItem, OverlayRoute} from '../../overlays/index.js';
import {buildOverlayItems} from '../../overlays/index.js';
import {overlaySelectionIntent} from '../../overlays/index.js';
import {normalizeProviderBaseUrl, providerCatalog as providers} from '../../providers/index.js';
import {normalizeInput} from '../../composer/index.js';
import {useAppStore, useAppStoreApi} from '../components/app-provider.js';
import type {RuntimeConnection} from '../services/use-runtime-connection.js';
import type {RuntimeWorkspace} from '../services/use-runtime-workspace.js';
import {promptHistoryFromMessages} from './prompt-history.js';

export type OverlayController = {
	active: boolean;
	items: readonly OverlayItem[];
	history: readonly string[];
	open: (route: OverlayRoute) => void;
	handleInput: (input: string, key: Key) => boolean;
	handlePaste: (text: string) => boolean;
};

export const useOverlayController = (connection: RuntimeConnection, workspace: RuntimeWorkspace): OverlayController => {
	const store = useAppStoreApi();
	const overlay = useAppStore((state) => state.overlay);
	const messages = useAppStore((state) => state.messages);
	const promptHistory = useMemo(() => promptHistoryFromMessages(messages), [messages]);

	const baseItems = useMemo<readonly OverlayItem[]>(
		() =>
			buildOverlayItems(overlay, {
				messages,
				promptHistory,
				connection: {state: connection.state, providers: connection.providers, models: connection.models},
				workspace: {
					supported: workspace.supported,
					sessions: workspace.sessions,
					...(workspace.error ? {error: workspace.error} : {}),
				},
			}),
		[
			connection.models,
			connection.providers,
			connection.state,
			messages,
			overlay,
			promptHistory,
			workspace.error,
			workspace.sessions,
			workspace.supported,
		],
	);

	const items = useMemo(() => {
		if (!overlay?.query || overlay.route === 'setupKey' || overlay.route === 'setupBaseUrl') return baseItems;
		return new Fuse(baseItems, {keys: ['label', 'description'], threshold: 0.4})
			.search(overlay.query)
			.map((result) => result.item);
	}, [baseItems, overlay?.query, overlay?.route]);

	const open = useCallback(
		(route: OverlayRoute) => {
			const actions = store.getState();
			actions.setOverlay({route, query: '', selectedIndex: 0});
			actions.setTranscriptMode(false);
			if (route === 'connect' || route === 'setupProvider') void connection.refreshProviders();
			if (route === 'model') void connection.refreshModels();
			if (route === 'sessions') void workspace.refresh();
		},
		[connection, store, workspace],
	);

	const appendConnectionMessage = useCallback(
		(level: 'error' | 'success', content: string) => {
			store.getState().appendMessage({id: `connection-${Date.now()}`, kind: 'system', level, content});
		},
		[store],
	);

	const handleInput = useCallback(
		(input: string, key: Key): boolean => {
			if (!overlay) return false;
			const actions = store.getState();
			if (key.escape) {
				actions.setOverlay(null);
				return true;
			}
			if (key.upArrow || key.downArrow) {
				const amount = key.upArrow ? -1 : 1;
				actions.setOverlay((current) =>
					current
						? {
								...current,
								selectedIndex: Math.max(0, Math.min(items.length - 1, current.selectedIndex + amount)),
							}
						: current,
				);
				return true;
			}
			if (key.return) {
				if (overlay.route === 'setupBaseUrl') {
					const provider = overlay.provider;
					if (!provider || !overlay.query.trim()) return true;
					try {
						const baseUrl = normalizeProviderBaseUrl(provider, overlay.query);
						actions.setOverlay({route: 'setupKey', provider, baseUrl, query: '', selectedIndex: 0});
					} catch (error) {
						appendConnectionMessage('error', error instanceof Error ? error.message : 'Invalid workspace URL.');
					}
					return true;
				}
				if (overlay.route === 'setupKey') {
					const provider = overlay.provider;
					const apiKey = overlay.query.trim();
					if (!provider || !apiKey || connection.state.status === 'connecting') return true;
					void connection
						.setup(provider, {apiKey, ...(overlay.baseUrl ? {baseUrl: overlay.baseUrl} : {})})
						.then((connected) => {
							store.getState().setOverlay(null);
							appendConnectionMessage('success', `Connected to ${connected.providerLabel} · ${connected.model}`);
						})
						.catch(() => {
							appendConnectionMessage(
								'error',
								`${providers[provider].label} connection failed. Check the API key and try again.`,
							);
						});
					return true;
				}
				const intent = overlaySelectionIntent(overlay, items, connection.state, connection.providers);
				if (intent.type === 'restorePrompt') {
					actions.setEditor({value: intent.value, cursor: intent.value.length});
					actions.setOverlay(null);
				} else if (intent.type === 'switchSession') {
					void workspace.switchSession(intent.sessionId).then((switched) => {
						if (switched) store.getState().setOverlay(null);
					});
				} else if (intent.type === 'requestApiKey') {
					actions.setOverlay({
						route: providers[intent.provider].baseUrl ? 'setupBaseUrl' : 'setupKey',
						provider: intent.provider,
						query: '',
						selectedIndex: 0,
					});
				} else if (intent.type === 'connectProvider') {
					void connection
						.connect(intent.provider)
						.then((connected) => {
							store.getState().setOverlay(null);
							appendConnectionMessage('success', `Connected to ${connected.providerLabel} · ${connected.model}`);
						})
						.catch(() => {
							appendConnectionMessage(
								'error',
								`${providers[intent.provider].label} connection failed. Run /setup to replace its API key.`,
							);
						});
				} else if (intent.type === 'selectModel') {
					void connection
						.selectModel(intent.model)
						.then((connected) => {
							store.getState().setOverlay(null);
							appendConnectionMessage('success', `Using ${connected.providerLabel} · ${connected.model}`);
						})
						.catch(() => {
							appendConnectionMessage(
								'error',
								`Unable to select model ${intent.model}. Reconnect to refresh the model cache.`,
							);
						});
				}
				return true;
			}
			if (key.backspace || key.delete) {
				actions.setOverlay((current) =>
					current ? {...current, query: current.query.slice(0, -1), selectedIndex: 0} : current,
				);
				return true;
			}
			if (!key.ctrl && !key.meta && input) {
				actions.setOverlay((current) =>
					current ? {...current, query: current.query + input, selectedIndex: 0} : current,
				);
			}
			return true;
		},
		[appendConnectionMessage, connection, items, overlay, store, workspace],
	);

	const handlePaste = useCallback(
		(text: string): boolean => {
			const current = store.getState().overlay;
			if (!current) return false;
			if (current.route === 'setupKey' || current.route === 'setupBaseUrl') {
				store
					.getState()
					.setOverlay((value) => (value ? {...value, query: value.query + normalizeInput(text).trim()} : value));
			}
			return true;
		},
		[store],
	);

	return {active: Boolean(overlay), items, history: promptHistory, open, handleInput, handlePaste};
};
