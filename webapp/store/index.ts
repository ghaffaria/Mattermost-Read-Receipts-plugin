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
            console.log(`🔄 [ReadReceipts] Channel switch detected:`, {
                from: (window as any).__lastCRChan,
                to: currentChannelId,
                timestamp: new Date().toISOString()
            });
            
            const pluginStore = getPluginStore(); // Get our plugin's store instance
            if (pluginStore && pluginStore.dispatch) { // Ensure store and dispatch are available
                // Call the correctly imported async thunk
                // The thunk expects an object like { channelId: string; sincePostId?: string }
                console.log(`[ReadReceipts] Switching to channel ${currentChannelId}, dispatching loadChannelReaders.`);
                // Cast to ThunkDispatch to handle async thunks
                const dispatch = pluginStore.dispatch as ThunkDispatch<PluginRootState, unknown, AnyAction>;
                dispatch(loadChannelReaders({ channelId: currentChannelId }));
            } else {
                console.error('[ReadReceipts] Plugin store or dispatch not available in ensureChannelReadsOnSwitch.');
            }
            (window as any).__lastCRChan = currentChannelId;
        }
    });
};
