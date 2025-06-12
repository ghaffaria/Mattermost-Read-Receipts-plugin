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

            Object.entries(payload).forEach(([postId, userIds]) => {
                state[channelId][postId] = userIds;
            });
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
