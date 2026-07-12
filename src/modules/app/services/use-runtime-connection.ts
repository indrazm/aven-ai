import {useCallback, useEffect, useRef, useState} from 'react';
import type {
	AgentRuntime,
	ConfigurableAgentRuntime,
	ConnectionState,
	ModelStatus,
	ProviderCredentials,
	ProviderStatus,
} from '../../agent/index.js';
import {isConfigurableRuntime, isProjectSessionRuntime} from '../../agent/index.js';
import {providerCatalog as providers, type ProviderId} from '../../providers/index.js';
import {useAppStoreApi} from '../components/app-provider.js';

export type RuntimeConnection = {
	configurable: boolean;
	state: ConnectionState;
	providers: readonly ProviderStatus[];
	models: readonly ModelStatus[];
	connect(provider: ProviderId): Promise<ConnectionState>;
	setup(provider: ProviderId, credentials: ProviderCredentials): Promise<ConnectionState>;
	selectModel(model: string): Promise<ConnectionState>;
	refreshProviders(): Promise<void>;
	refreshModels(): Promise<void>;
};

const mockConnection: ConnectionState = {status: 'connected', providerLabel: 'Mock', model: 'local'};

export const useRuntimeConnection = (runtime: AgentRuntime): RuntimeConnection => {
	const store = useAppStoreApi();
	const configurable = isConfigurableRuntime(runtime);
	const configurableRuntime: ConfigurableAgentRuntime | undefined = configurable ? runtime : undefined;
	const projectSessionRuntime = isProjectSessionRuntime(runtime);
	const [state, setState] = useState<ConnectionState>(() => configurableRuntime?.getConnection() ?? mockConnection);
	const [providerStatuses, setProviderStatuses] = useState<readonly ProviderStatus[]>([]);
	const [modelStatuses, setModelStatuses] = useState<readonly ModelStatus[]>([]);
	const historyLoaded = useRef(false);
	const restored = useRef(false);

	const loadLegacyRuntimeHistory = useCallback(async () => {
		if (!configurableRuntime || projectSessionRuntime || historyLoaded.current) return;
		const messages = await configurableRuntime.loadHistory();
		if (messages.length > 0) store.getState().replaceMessages(messages);
		historyLoaded.current = true;
	}, [configurableRuntime, projectSessionRuntime, store]);

	const refreshProviders = useCallback(async () => {
		if (!configurableRuntime) return;
		setProviderStatuses(await configurableRuntime.providerStatuses());
	}, [configurableRuntime]);

	const refreshModels = useCallback(async () => {
		if (!configurableRuntime) return;
		setModelStatuses(await configurableRuntime.modelStatuses());
	}, [configurableRuntime]);

	useEffect(() => {
		if (!configurableRuntime || restored.current) return;
		restored.current = true;
		void (async () => {
			try {
				setState(configurableRuntime.getConnection());
				const restoredState = await configurableRuntime.restore();
				setState(restoredState);
				await refreshProviders();
				await refreshModels();
				if (restoredState.status === 'connected') {
					store.getState().recover();
					await loadLegacyRuntimeHistory();
				}
			} catch {
				setState({status: 'error', error: 'Unable to load provider configuration.'});
			}
		})();
	}, [configurableRuntime, loadLegacyRuntimeHistory, refreshModels, refreshProviders, store]);

	const connect = useCallback(
		async (provider: ProviderId) => {
			if (!configurableRuntime) throw new Error('Runtime does not support provider configuration');
			setModelStatuses([]);
			const model = providerStatuses.find((status) => status.id === provider)?.model;
			setState({
				status: 'connecting',
				provider,
				providerLabel: providers[provider].label,
				...(model ? {model} : {}),
			});
			try {
				const connected = await configurableRuntime.connect(provider);
				setState(connected);
				store.getState().recover();
				await refreshProviders();
				await refreshModels();
				await loadLegacyRuntimeHistory();
				return connected;
			} catch (error) {
				setState(configurableRuntime.getConnection());
				await refreshProviders();
				throw error;
			}
		},
		[configurableRuntime, loadLegacyRuntimeHistory, providerStatuses, refreshModels, refreshProviders, store],
	);

	const setup = useCallback(
		async (provider: ProviderId, credentials: ProviderCredentials) => {
			if (!configurableRuntime) throw new Error('Runtime does not support provider configuration');
			setModelStatuses([]);
			const model = providerStatuses.find((status) => status.id === provider)?.model;
			setState({
				status: 'connecting',
				provider,
				providerLabel: providers[provider].label,
				...(model ? {model} : {}),
			});
			try {
				const connected = await configurableRuntime.setup(provider, credentials);
				setState(connected);
				store.getState().recover();
				await refreshProviders();
				await refreshModels();
				await loadLegacyRuntimeHistory();
				return connected;
			} catch (error) {
				setState(configurableRuntime.getConnection());
				await refreshProviders();
				throw error;
			}
		},
		[configurableRuntime, loadLegacyRuntimeHistory, providerStatuses, refreshModels, refreshProviders, store],
	);

	const selectModel = useCallback(
		async (model: string) => {
			if (!configurableRuntime) throw new Error('Runtime does not support model selection');
			const connected = await configurableRuntime.selectModel(model);
			setState(connected);
			await refreshProviders();
			await refreshModels();
			return connected;
		},
		[configurableRuntime, refreshModels, refreshProviders],
	);

	return {
		configurable,
		state,
		providers: providerStatuses,
		models: modelStatuses,
		connect,
		setup,
		selectModel,
		refreshProviders,
		refreshModels,
	};
};
