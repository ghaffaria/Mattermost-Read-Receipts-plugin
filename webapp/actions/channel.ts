import { createAsyncThunk } from '@reduxjs/toolkit';
import { setReaders, setChannelLastSeen } from '../store/channelReaders';

interface ReadEvent {
    MessageID: string;
    UserID: string;
    ChannelID: string;
    Timestamp: number;
}

const ongoingRequests = new Set<string>();

export const loadChannelReaders = createAsyncThunk(
    'channelReaders/loadChannelReaders',
    async (params: { channelId: string }, { dispatch }) => {
        const { channelId } = params;

        if (ongoingRequests.has(channelId)) {
            return {};
        }

        ongoingRequests.add(channelId);

        try {
            const [receiptsResponse, readsResponse] = await Promise.all([
                fetch(`/plugins/mattermost-readreceipts/api/v1/receipts?channel_id=${encodeURIComponent(channelId)}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    credentials: 'same-origin',
                }),
                fetch(`/plugins/mattermost-readreceipts/api/v1/channel/${encodeURIComponent(channelId)}/reads`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                    credentials: 'same-origin',
                })
            ]);

            if (!receiptsResponse.ok) throw new Error(`Receipts fetch failed: ${receiptsResponse.status}`);
            if (!readsResponse.ok) throw new Error(`Channel reads fetch failed: ${readsResponse.status}`);

            const events: ReadEvent[] = await receiptsResponse.json();
            const channelReads: any[] = await readsResponse.json();

            const transformedPayload: { [postId: string]: string[] } = {};

            const addReaderToPayload = (postId: string, userId: string) => {
                if (!transformedPayload[postId]) transformedPayload[postId] = [];
                if (!transformedPayload[postId].includes(userId)) {
                    transformedPayload[postId].push(userId);
                }
            };

            // Process explicit receipts
            for (const event of events) {
                addReaderToPayload(event.MessageID, event.UserID);
            }

            // Process implicit channel reads
            const mmStore = (window as any).store;
            const mmState = mmStore?.getState();
            const posts = mmState?.entities?.posts?.posts as Record<string, any> || {};
            const channelPosts = Object.values(posts).filter((p: any) => p.channel_id === channelId);

            const lastSeenMap: { [userId: string]: number } = {};

            if (channelReads && Array.isArray(channelReads)) {
                channelReads.forEach((read: any) => {
                    const userId = read.UserID || read.user_id;
                    const lastSeenAt = read.LastSeenAt || read.last_seen_at;
                    if (userId && lastSeenAt) {
                        lastSeenMap[userId] = lastSeenAt;
                        channelPosts.forEach((post: any) => {
                            if (post.create_at <= lastSeenAt) {
                                addReaderToPayload(post.id, userId);
                            }
                        });
                    }
                });
            }

            const channel = mmState?.entities?.channels?.channels?.[channelId];
            const isDM = channel?.type === 'D';

            dispatch(setReaders({ channelId, payload: transformedPayload, isDM }));

            if (Object.keys(lastSeenMap).length > 0) {
                dispatch(setChannelLastSeen({ channelId, lastSeen: lastSeenMap }));
            }

            return transformedPayload;
        } catch (error) {
            console.error('[Channel Actions] Failed:', error);
            throw error;
        } finally {
            ongoingRequests.delete(channelId);
        }
    }
);
