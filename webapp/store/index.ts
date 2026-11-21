// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

import { configureStore, combineReducers, ThunkDispatch, AnyAction } from '@reduxjs/toolkit';
import channelReadersReducer from './channelReaders';
// import { loadChannelReads } from '../store'; // fallback to original, since not exported from channelReaders
import { loadChannelReaders } from '../actions/channel';
import type { RootState } from './types';
import { getPluginStore, RootState as PluginRootState } from './pluginStore'; // use getPluginStore, but alias to getStore for code compatibility

// Combine our reducers
const rootReducer = combineReducers({
    channelReaders: channelReadersReducer,
    // Add other reducers here as needed
});

// Create the store
const reduxStore = configureStore({
    reducer: rootReducer,
});

// Export the store for legacy compatibility
export const store = reduxStore;

// Export types
export type { RootState };
export type AppDispatch = typeof reduxStore.dispatch;

// Re-export channelReaders actions and selectors
export * from './channelReaders';

// Re-export ONLY specific functions from legacyStore to avoid conflicts
export { 
    getUserProfiles, 
    getUserDisplayName, 
    setMattermostStore,
    fetchPluginConfig,
    STORE_UPDATE_EVENT 
} from './legacyStore';

// Export the CORRECT loadInitialReceipts from the main store (not legacy)
export { loadInitialReceipts, loadChannelReads } from '../store';

// Debounce map for channel switches
const channelSwitchDebounceMap = new Map<string, ReturnType<typeof setTimeout>>();

// Utility: Ensure channel reads are loaded on channel switch
export const ensureChannelReadsOnSwitch = (mmStore: any) => {
    if ((window as any).__ensuredCRSwitch) {
        return; // already wired
    }
    (window as any).__ensuredCRSwitch = true;

    mmStore.subscribe(() => {
        const currentChannelId = mmStore.getState().entities.channels.currentChannelId;
        if (currentChannelId && currentChannelId !== (window as any).__lastCRChan) {
            console.log(`🔄 [ReadReceipts] Channel switch detected:`, {
                from: (window as any).__lastCRChan,
                to: currentChannelId,
                timestamp: new Date().toISOString()
            });
            
            // Debounce channel switches to prevent race conditions
            if (channelSwitchDebounceMap.has(currentChannelId)) {
                clearTimeout(channelSwitchDebounceMap.get(currentChannelId)!);
            }
            
            const timeoutId = setTimeout(() => {
                channelSwitchDebounceMap.delete(currentChannelId);
                
                const pluginStore = getPluginStore(); // Get our plugin's store instance
                if (pluginStore && pluginStore.dispatch) { // Ensure store and dispatch are available
                    // Call the correctly imported async thunk
                    // The thunk expects an object like { channelId: string; sincePostId?: string }
                    console.log(`[ReadReceipts] Loading reads for channel ${currentChannelId} (debounced, 100ms delay)`);
                    // Cast to ThunkDispatch to handle async thunks
                    const dispatch = pluginStore.dispatch as ThunkDispatch<PluginRootState, unknown, AnyAction>;
                    dispatch(loadChannelReaders({ channelId: currentChannelId }));
                } else {
                    console.error('[ReadReceipts] Plugin store or dispatch not available in ensureChannelReadsOnSwitch.');
                }
            }, 100); // Small debounce delay to prevent rapid switches
            
            channelSwitchDebounceMap.set(currentChannelId, timeoutId);
            (window as any).__lastCRChan = currentChannelId;
        }
    });
};
