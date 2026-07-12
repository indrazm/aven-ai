import type {ProviderId} from './catalog.js';

export type ConnectionState = {
	status: 'disconnected' | 'connecting' | 'connected' | 'error';
	provider?: ProviderId;
	providerLabel?: string;
	model?: string;
	error?: string;
};

export type ProviderStatus = {
	id: ProviderId;
	label: string;
	model: string;
	configured: boolean;
	active: boolean;
};

export type ModelStatus = {id: string; active: boolean};
