// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

// webapp/websocket.ts

import { Dispatch } from 'redux';
import { updateReadReceipts, getUserDisplayName } from './store';
import { setReaders, addReader } from './store/channelReaders';
import { updateAndReinjectReceipt } from './plugin';

// Add debug configuration to Window interface
declare global {
    interface Window {
        __DEBUG_RR__?: {
            verbose?: boolean;
            tracing?: boolean;
            network?: boolean;
        };
    }
}

// Constants and interfaces
const READ_RECEIPT_EVENT = 'custom_mattermost-readreceipts_read_receipt';
const CHANNEL_READERS_EVENT = 'custom_mattermost-readreceipts_channel_readers';

interface MattermostPost {
    id: string;
    create_at: number;
    channel_id: string;
}

// Type guard to check if an object is a MattermostPost
function isMattermostPost(obj: any): obj is MattermostPost {
    return obj &&
        typeof obj.id === 'string' &&
        typeof obj.create_at === 'number' &&
        typeof obj.channel_id === 'string';
}

// Handle WebSocket events from Mattermost's native WebSocket system
export function handleWebSocketEvent(dispatch: Dispatch) {
    return (msg: any) => {
        const { data, event: eventType } = msg;
        if (!data) return;

        if (eventType === READ_RECEIPT_EVENT) {
            // The data object from the WebSocket message includes:
            // MessageID, UserID (who performed the read), ChannelID, IsDM (from server)
            // For DMs: ReaderIDs (array of all users who read this post)
            // For GM/channels: may only have UserID
            const { MessageID, UserID, ChannelID, IsDM, ReaderIDs } = data;

            if (!MessageID || !UserID) {
                console.error('[RR WebSocket] Invalid read receipt data:', data);
                return;
            }

            // Build reader IDs array - use ReaderIDs if present, otherwise use UserID
            const readerIds: string[] = ReaderIDs && Array.isArray(ReaderIDs)
                ? ReaderIDs
                : [UserID];

            // Determine if it's a DM channel more reliably
            const store = (window as any).store;
            const channelInfo = store?.getState()?.entities?.channels?.channels?.[ChannelID];
            const isActuallyDM = IsDM || channelInfo?.type === 'D';

            if (isActuallyDM) {
                if (window.__DEBUG_RR__?.verbose) console.log('[RR DM] Processing DM read receipt via WebSocket', { MessageID, readerIds, ChannelID });
                dispatch(addReader({
                    channelId: ChannelID,
                    postId: MessageID,
                    userId: readerIds.join(','),
                    isDM: true
                }));
                // Also trigger DOM re-injection for real-time updates
                updateAndReinjectReceipt(ChannelID, MessageID, readerIds);
            } else {
                // For regular/group channels
                if (window.__DEBUG_RR__?.verbose) console.log('[RR Channel] Processing channel read receipt via WebSocket', { MessageID, readerIds, ChannelID });
                dispatch(addReader({
                    channelId: ChannelID,
                    postId: MessageID,
                    userId: readerIds.join(','),
                    isDM: false
                }));
                // Also trigger DOM re-injection for real-time updates
                updateAndReinjectReceipt(ChannelID, MessageID, readerIds);
            }
        }


        if (eventType === CHANNEL_READERS_EVENT) {
            const { ChannelID, LastPostID, UserIDs } = data;
            if (ChannelID && LastPostID && Array.isArray(UserIDs)) {
                const store = (window as any).store;
                const channel = store?.getState()?.entities?.channels?.channels?.[ChannelID];

                dispatch(addReader({
                    channelId: ChannelID,
                    postId: LastPostID,
                    userId: UserIDs.join(','),
                    isDM: channel?.type === 'D'
                }));

                if (window.__DEBUG_RR__?.verbose) console.log('[RR Channel] Updated channel readers', {
                    channelId: ChannelID,
                    readers: UserIDs
                });
            } else {
                console.error('[RR WebSocket] Invalid channel readers data:', data);
            }
        }
    };
}
