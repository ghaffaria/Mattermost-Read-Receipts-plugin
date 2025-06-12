import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { RootState } from './types';

// State shape definition
export interface ChannelReadersState {
    [channelId: string]: {
        [postId: string]: string[] // array of userIds
    };
}

// Additional type for DM-specific actions
export interface AddReaderPayload {
    channelId: string;
    postId: string;
    userId: string;
    isDM?: boolean;
}

// Ensure initialState is an empty object
const initialState: ChannelReadersState = {};

// Memoized selector with debug logging and race condition protection
export const selectReaders = createSelector(
    [
        (state: RootState) => state.channelReaders,
        (_: RootState, channelId: string) => channelId,
        (_: RootState, _channelId: string, postId: string) => postId
    ],
    (channelReaders: ChannelReadersState, channelId: string, postId: string): string[] => {
        // Get readers with defensive checks
        const channelData = channelReaders?.[channelId];
        const readers = channelData?.[postId] ?? [];
        
        // Enhanced logging for debugging channel switch issues
        const isTargetMessage = postId === 'fpb56zb5ptdemeywszqqo5tywa';
        const isTargetChannel = channelId === 'ybkrid3x73yw7cep9mptu16nwy';
        
        if (isTargetMessage || (window as any).__RR_DEBUG__) {
            console.log('🔍 [Redux Selector] Selecting readers:', {
                channelId,
                postId,
                hasChannel: !!channelData,
                hasPost: !!channelData?.[postId],
                readerCount: readers.length,
                readers: readers,
                isTargetMessage,
                isTargetChannel,
                fullChannelState: isTargetMessage ? JSON.stringify(channelData, null, 2) : 'omitted',
                timestamp: new Date().toISOString()
            });
        }
        
        return readers;
    }
);

// Slice definition
const channelReadersSlice = createSlice({
    name: 'channelReaders',
    initialState,
    reducers: {
        setReaders: (
            state: ChannelReadersState,
            action: PayloadAction<{
                channelId: string;
                payload: { [postId: string]: string[] };
                isDM?: boolean;
            }>
        ) => {
            const { channelId, payload, isDM } = action.payload;
            
            if (!state[channelId]) {
                state[channelId] = {};
            }

            // This log should already exist or be similar
            const existingLogInfo = {
                channelId,
                payloadSize: Object.keys(payload).length,
                isDM,
                // Log a few sample postIDs from the payload to see what's coming in
                samplePostIdsFromPayload: Object.keys(payload).slice(0, 5) 
            };
            console.log('🔄 [Redux] Processing setReaders (DM-aware):', existingLogInfo);

            Object.entries(payload).forEach(([postId, userIds]) => {
                state[channelId][postId] = userIds;
            });

            // --- BEGIN NEW DEBUG LOG ---
            // The user should replace 'MESSAGE_ID_FROM_ALI_REPLACE_THIS' with the actual ID they are testing.
            // For example, '59x6s4dhojg1pp3sxgzqj59cya' from previous logs.
            const targetMessageIdForDebug = '59x6s4dhojg1pp3sxgzqj59cya'; // Placeholder, user should use actual ID.
            if (payload[targetMessageIdForDebug] && channelId === 'ybkrid3x73yw7cep9mptu16nwy') { // Check if the target message is in this update and for the target channel
                console.log(`DEBUG_RR_STATE [setReaders] Readers for post ${targetMessageIdForDebug} in channel ${channelId} AFTER update:`, JSON.parse(JSON.stringify(state[channelId][targetMessageIdForDebug])) );
            }
            if (state[channelId] && state[channelId][targetMessageIdForDebug]) {
                 console.log(`DEBUG_RR_STATE_GENERIC [setReaders] Readers for post ${targetMessageIdForDebug} in channel ${channelId} (generic check):`, JSON.parse(JSON.stringify(state[channelId][targetMessageIdForDebug])) );
            }
            // --- END NEW DEBUG LOG ---
        },

        addReader: (
            state: ChannelReadersState,
            action: PayloadAction<AddReaderPayload>
        ) => {
            const { channelId, postId, userId, isDM } = action.payload;
            
            // Ensure valid input data
            if (!channelId || !postId || !userId) {
                console.error('❌ [Redux] Invalid addReader payload:', action.payload);
                return;
            }
            
            console.log('➕ [Redux] Processing addReader:', {
                channelId,
                postId,
                userId,
                isDM,
                beforeState: state[channelId]?.[postId],
                timestamp: new Date().toISOString()
            });

            if (!state[channelId]) {
                state[channelId] = {};
            }
            if (!state[channelId][postId]) {
                state[channelId][postId] = [];
            }

            // Split userId if it's a comma-separated string (legacy format)
            const userIds = userId.includes(',') ? userId.split(',').filter(id => id.trim()) : [userId];
            
            // Track if any changes were made
            let hasChanges = false;

            // For DMs, merge the reader without duplicates
            if (isDM) {
                const existingReaders = new Set(state[channelId][postId]);
                const originalSize = existingReaders.size;
                userIds.forEach(id => existingReaders.add(id.trim()));
                state[channelId][postId] = Array.from(existingReaders);
                hasChanges = existingReaders.size > originalSize;
            } else {
                // For regular channels, just add if not already present
                userIds.forEach(id => {
                    const trimmedId = id.trim();
                    if (!state[channelId][postId].includes(trimmedId)) {
                        state[channelId][postId].push(trimmedId);
                        hasChanges = true;
                    }
                });
            }

            console.log('✅ [Redux] Reader added:', {
                channelId,
                postId,
                afterState: state[channelId][postId],
                isDM,
                hasChanges,
                timestamp: new Date().toISOString()
            });
            
            // Add debug hook for testing
            if ((window as any).__RR_DEBUG__) {
                console.log('🔍 [Redux Debug] Full channel state after update:', JSON.parse(JSON.stringify(state[channelId])));
            }
        },
    },
});

// Export actions
export const { setReaders, addReader } = channelReadersSlice.actions;

// Selectors
export const selectChannelSeenMap = (state: RootState, channelId: string) => {
    return state.channelReaders[channelId] || {};
};

// Legacy selector wrapper (maintains backward compatibility)
export const getMessageReadReceipts = (state: RootState, messageId: string): string[] => {
    // Assuming channel ID is encoded in message ID (channelId:postId format)
    const [channelId, postId] = messageId.split(':');
    return selectReaders(state, channelId, postId);
};

// Reducer
export default channelReadersSlice.reducer;
