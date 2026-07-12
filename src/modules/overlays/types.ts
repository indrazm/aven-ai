import type {ProviderId} from '../providers/index.js';

export type OverlayRoute =
	| 'help'
	| 'history'
	| 'sessions'
	| 'commands'
	| 'connect'
	| 'setupProvider'
	| 'setupBaseUrl'
	| 'setupKey'
	| 'model'
	| 'theme'
	| 'search';

export type OverlayState = {
	route: OverlayRoute;
	query: string;
	selectedIndex: number;
	provider?: ProviderId;
	baseUrl?: string;
};

export type OverlayItem = {
	label: string;
	description: string;
	value?: string;
};
