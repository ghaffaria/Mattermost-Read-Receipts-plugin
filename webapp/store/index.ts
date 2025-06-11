// webapp/store/index.ts
import { configureStore, combineReducers, ThunkDispatch, AnyAction } from '@reduxjs/toolkit'; // Added ThunkDispatch, AnyAction
import channelReadersReducer from './channelReaders';
// import { loadChannelReads } from '../store'; // fallback to original, since not exported from channelReaders
import { loadChannelReaders } from '../actions/channel';
import type { RootState } from './types'; // This is RootState for the reduxStore in this file
import { getPluginStore, RootState as PluginSpecificRootState } from './pluginStore'; // Import RootState from pluginStore as PluginSpecificRootState

// Combine our reducers
const rootReducer = combineReducers({
    channelReaders: channelReadersReducer,
    // Add other reducers here as needed
});

// Create the store
const reduxStore = configureStore({
    reducer: rootReducer,
});

// Export types
export type { RootState };
export type AppDispatch = typeof reduxStore.dispatch;

// Re-export channelReaders actions and selectors
export * from './channelReaders';

// Re-export legacy store functionality
export * from './legacyStore';

// Utility: Ensure channel reads are loaded on channel switch
export const ensureChannelReadsOnSwitch = (mmStore: any) => {
    if ((window as any).__ensuredCRSwitch) {
        return; // already wired
    }
    (window as any).__ensuredCRSwitch = true;

    mmStore.subscribe(() => {
        const currentChannelId = mmStore.getState().entities.channels.currentChannelId;
        if (currentChannelId && currentChannelId !== (window as any).__lastCRChan) {
            const pluginStore = getPluginStore(); // Get our plugin's store instance
            if (pluginStore && pluginStore.dispatch) { // Ensure store and dispatch are available
                console.log(`[ReadReceipts] Switching to channel ${currentChannelId}, dispatching loadChannelReaders.`);
                // Explicitly cast pluginStore.dispatch to a ThunkDispatch for the plugin's store
                const dispatch = pluginStore.dispatch as ThunkDispatch<PluginSpecificRootState, unknown, AnyAction>;
                dispatch(loadChannelReaders({ channelId: currentChannelId }));
            } else {
                console.error('[ReadReceipts] Plugin store or dispatch not available in ensureChannelReadsOnSwitch.');
            }
            (window as any).__lastCRChan = currentChannelId;
        }
    });
};
