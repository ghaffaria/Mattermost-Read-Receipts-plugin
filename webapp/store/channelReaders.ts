// webapp/store/channelReaders.ts
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

// Memoized selector with debug logging
export const selectReaders = createSelector(
    [
        (state: RootState) => state.channelReaders,
        (_: RootState, channelId: string) => channelId,
        (_: RootState, _channelId: string, postId: string) => postId
    ],
    (channelReaders: ChannelReadersState, channelId: string, postId: string): string[] => {
        console.log('🔍 [Redux Selector] Selecting readers:', {
            channelId,
            postId,
            hasChannel: !!channelReaders[channelId],
            hasPost: channelReaders[channelId]?.[postId] !== undefined,
            readerCount: channelReaders[channelId]?.[postId]?.length || 0
        });
        return channelReaders?.[channelId]?.[postId] ?? [];
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
            }>
        ) => {
            const { channelId, payload } = action.payload;
            
            if (!state[channelId]) {
                state[channelId] = {};
            }

            // This log should already exist or be similar
            const existingLogInfo = {
                channelId,
                payloadSize: Object.keys(payload).length,
                // Log a few sample postIDs from the payload to see what's coming in
                samplePostIdsFromPayload: Object.keys(payload).slice(0, 5) 
            };
            console.log('🔄 [Redux] Processing setReaders:', existingLogInfo);

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
            const userIds = userId.includes(',') ? userId.split(',') : [userId];

            // For DMs, merge the reader without duplicates
            if (isDM) {
                const existingReaders = new Set(state[channelId][postId]);
                userIds.forEach(id => existingReaders.add(id));
                state[channelId][postId] = Array.from(existingReaders);
            } else {
                // For regular channels, just add if not already present
                userIds.forEach(id => {
                    if (!state[channelId][postId].includes(id)) {
                        state[channelId][postId].push(id);
                    }
                });
            }

            console.log('✅ [Redux] Reader added:', {
                channelId,
                postId,
                afterState: state[channelId][postId],
                isDM,
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
