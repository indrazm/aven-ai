import {createContext, useContext, useRef, type ReactNode} from 'react';
import {useStore} from 'zustand';
import type {StoreApi} from 'zustand/vanilla';
import type {UiMessage} from '../../conversation/index.js';
import {createAppStore} from '../store/create-app-store.js';
import type {AppStore} from '../store/app-state.js';

const AppStoreContext = createContext<StoreApi<AppStore> | null>(null);

export const AppProvider = ({
	children,
	initialMessages,
}: {
	children: ReactNode;
	initialMessages: readonly UiMessage[];
}) => {
	const storeRef = useRef<StoreApi<AppStore> | null>(null);
	storeRef.current ??= createAppStore(initialMessages);
	return <AppStoreContext.Provider value={storeRef.current}>{children}</AppStoreContext.Provider>;
};

export const useAppStoreApi = (): StoreApi<AppStore> => {
	const store = useContext(AppStoreContext);
	if (!store) throw new Error('useAppStoreApi must be used inside AppProvider');
	return store;
};

export const useAppStore = <Selected,>(selector: (state: AppStore) => Selected): Selected =>
	useStore(useAppStoreApi(), selector);
