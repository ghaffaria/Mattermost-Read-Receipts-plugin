// State management for read receipts
import { Dispatch } from 'redux';
import { loadInitialReceipts, loadChannelReads } from '../store';
import { setReaders } from './channelReaders';

interface MattermostChannel {
    id: string;
    type: string;
    name?: string;
}

export enum StateLoadStage {
    INITIAL = 'initial',
    WEBSOCKET = 'WEBSOCKET',
    REFRESH = 'refresh'
}

class StateManager {
    private currentStage: StateLoadStage = StateLoadStage.INITIAL;
    private initialized: boolean = false;
    private channelStates: Map<string, boolean> = new Map();
    private currentChannelId: string | null = null;
    private dispatch: Dispatch | null = null;

    async initializeState(stage: StateLoadStage, dispatch: Dispatch): Promise<void> {
        this.dispatch = dispatch;
        this.currentStage = stage;
        
        try {
            if (stage === StateLoadStage.INITIAL && this.initialized) {
                console.log('ℹ️ [StateManager] State already initialized, skipping initial load');
                return;
            }

            // Reset state on refresh
            if (stage === StateLoadStage.REFRESH) {
                console.log('🔄 [StateManager] Refreshing state...');
                // Clear current channel state
                if (this.currentChannelId) {
                    this.dispatch(setReaders({
                        channelId: this.currentChannelId,
                        payload: {}
                    }));
                }
            }

            // Mark as initialized after first load
            if (stage === StateLoadStage.INITIAL) {
                this.initialized = true;
            }

            // Reload current channel data if available
            if (this.currentChannelId) {
                await Promise.all([
                    loadInitialReceipts(this.currentChannelId, this.dispatch, stage === StateLoadStage.INITIAL),
                    loadChannelReads(this.currentChannelId, stage === StateLoadStage.INITIAL)
                ]);
            }

            console.log('✅ [StateManager] State initialized:', {
                stage,
                channelId: this.currentChannelId
            });

        } catch (error) {
            console.error('❌ [StateManager] Failed to initialize state:', error);
            throw error;
        }
    }

    async handleChannelState(channelId: string, dispatch: Dispatch) {
        // Prevent duplicate loads
        if (this.channelStates.get(channelId)) {
            return;
        }

        try {
            await loadInitialReceipts(channelId, dispatch, false);
            this.channelStates.set(channelId, true);
        } catch (error) {
            console.error('Failed to load channel state:', error);
        }
    }

    private async loadAllStates(dispatch: Dispatch) {
        // Get all channels from Mattermost store
        const store = (window as any).store;
        const state = store?.getState();
        const channels = state?.entities?.channels?.channels || {};
        
        // Load states for all DM channels
        const entries = Object.entries(channels);
        const dmChannels = entries.reduce<Array<{id: string; type: string}>>((acc, [_, channel]) => {
            if (channel && 
                typeof channel === 'object' && 
                'type' in channel && 
                'id' in channel && 
                channel.type === 'D') {
                acc.push(channel as {id: string; type: string});
            }
            return acc;
        }, []);
        
        // Clear existing states before reloading
        if (this.currentStage === StateLoadStage.REFRESH) {
            this.channelStates.clear();
            // Clear local storage state on refresh
            localStorage.removeItem('mattermost_readreceipts_state');
        }
        
        // Load states for all DM channels sequentially to prevent race conditions
        for (const channel of dmChannels) {
            try {
                await Promise.all([
                    this.handleChannelState(channel.id, dispatch),
                    loadChannelReads(channel.id, this.currentStage === StateLoadStage.INITIAL)
                ]);
            } catch (error) {
                console.error('❌ [StateManager] Failed to load state for channel:', channel.id, error);
            }
        }
        
        // Mark states as initialized
        dmChannels.forEach(channel => {
            this.channelStates.set(channel.id, true);
        });
    }

    setCurrentChannel(channelId: string): void {
        if (this.currentChannelId !== channelId) {
            this.currentChannelId = channelId;
            // Load channel data if initialized
            if (this.initialized && this.dispatch) {
                Promise.all([
                    loadInitialReceipts(channelId, this.dispatch, true),
                    loadChannelReads(channelId, true)
                ]).catch(error => {
                    console.error('❌ [StateManager] Failed to load channel data:', error);
                });
            }
        }
    }

    reset() {
        this.initialized = false;
        this.channelStates.clear();
    }
}

export const stateManager = new StateManager();
