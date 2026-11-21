// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { RootState } from './types';

// State shape definition
// State shape definition
export interface ChannelReadersState {
    // Explicit read receipts (user clicked/hovered or received via websocket)
    [channelId: string]: {
        receipts: {
            [postId: string]: string[] // array of userIds
        };
        // Implicit read state (last time user viewed channel)
        lastSeen: {
            [userId: string]: number // timestamp
        };
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

// Helper to safely get post create_at from Mattermost's store (not plugin store)
const getPostCreateAt = (postId: string): number => {
    try {
        const mmStore = (window as any).store;
        const posts = mmStore?.getState()?.entities?.posts?.posts;
        const createAt = posts?.[postId]?.create_at || 0;
        return createAt;
    } catch {
        return 0;
    }
};

// Memoized selector
export const selectReaders = createSelector(
    [
        (state: RootState) => state.channelReaders,
        (_: RootState, channelId: string) => channelId,
        (_: RootState, _channelId: string, postId: string) => postId
    ],
    (channelReaders: ChannelReadersState, channelId: string, postId: string): string[] => {
        const channelData = channelReaders?.[channelId];
        const explicitReaders = channelData?.receipts?.[postId] ?? [];

        // Get implicit readers (those who have seen past this post's timestamp)
        const implicitReaders: string[] = [];
        const lastSeenMap = channelData?.lastSeen;

        if (lastSeenMap && Object.keys(lastSeenMap).length > 0) {
            const postCreateAt = getPostCreateAt(postId);
            if (postCreateAt > 0) {
                Object.entries(lastSeenMap).forEach(([userId, lastSeenAt]) => {
                    if (lastSeenAt >= postCreateAt) {
                        implicitReaders.push(userId);
                    }
                });
            }
        }

        return Array.from(new Set([...explicitReaders, ...implicitReaders]));
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
            const { channelId, payload } = action.payload;

            if (!state[channelId]) {
                state[channelId] = { receipts: {}, lastSeen: {} };
            }
            if (!state[channelId].receipts) {
                state[channelId].receipts = {};
            }

            Object.entries(payload).forEach(([postId, userIds]) => {
                state[channelId].receipts[postId] = userIds;
            });
        },

        setChannelLastSeen: (
            state: ChannelReadersState,
            action: PayloadAction<{
                channelId: string;
                lastSeen: { [userId: string]: number };
            }>
        ) => {
            const { channelId, lastSeen } = action.payload;

            if (!state[channelId]) {
                state[channelId] = { receipts: {}, lastSeen: {} };
            }
            if (!state[channelId].lastSeen) {
                state[channelId].lastSeen = {};
            }

            Object.entries(lastSeen).forEach(([userId, timestamp]) => {
                state[channelId].lastSeen[userId] = timestamp;
            });
        },

        addReader: (
            state: ChannelReadersState,
            action: PayloadAction<AddReaderPayload>
        ) => {
            const { channelId, postId, userId, isDM } = action.payload;

            if (!channelId || !postId || !userId) {
                return;
            }

            if (!state[channelId]) {
                state[channelId] = { receipts: {}, lastSeen: {} };
            }
            if (!state[channelId].receipts) {
                state[channelId].receipts = {};
            }
            if (!state[channelId].receipts[postId]) {
                state[channelId].receipts[postId] = [];
            }

            const userIds = userId.includes(',') ? userId.split(',').filter(id => id.trim()) : [userId];

            // For DMs, merge without duplicates
            // For regular channels, merge without duplicates (logic simplified to be same)
            userIds.forEach(id => {
                const trimmedId = id.trim();
                // We only modify the explicit receipts list
                if (!state[channelId].receipts[postId].includes(trimmedId)) {
                    state[channelId].receipts[postId].push(trimmedId);
                }
            });
        },
    },
});

export const { setReaders, addReader, setChannelLastSeen } = channelReadersSlice.actions;



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
