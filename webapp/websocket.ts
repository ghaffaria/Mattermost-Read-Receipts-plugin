// webapp/websocket.ts

import { Dispatch } from 'redux';
import { updateReadReceipts, getUserDisplayName } from './store';
import { setReaders, addReader } from './store/channelReaders';

const READ_RECEIPT_EVENT = 'custom_mattermost-readreceipts_read_receipt';
const CHANNEL_READERS_EVENT = 'custom_mattermost-readreceipts_channel_readers';

const debug = {
    log: (message: string, data?: any) => {
        console.log(`[RR WebSocket] ${message}`, data);
    },
    error: (message: string, error?: any) => {
        console.error(`[RR WebSocket] ❌ ${message}`, error);
    }
};

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
            const { MessageID, UserID, ChannelID } = data;
            if (!MessageID || !UserID) {
                debug.error('Invalid read receipt data:', data);
                return;
            }

            // Check if this is a DM channel
            const store = (window as any).store;
            const channel = store?.getState()?.entities?.channels?.channels?.[ChannelID];
            const isDM = channel?.type === 'D';

            if (isDM) {
                debug.log('Processing DM read receipt', { MessageID, UserID, ChannelID });
                
                // For DMs, we need to update all messages up to this one as read
                const posts = store?.getState()?.entities?.posts?.posts || {};
                const targetPost = posts[MessageID];
                
                if (targetPost && isMattermostPost(targetPost)) {
                    // Find all posts in this DM channel that were created before or at the same time as the target post
                    const allPosts = Object.values(posts);
                    const postsToMark = allPosts
                        .filter((post): post is MattermostPost => 
                            isMattermostPost(post) &&
                            post.channel_id === ChannelID && 
                            post.create_at <= targetPost.create_at
                        )
                        .map(post => post.id);

                    debug.log('Marking DM posts as read', { 
                        channelId: ChannelID,
                        readerId: UserID,
                        messageCount: postsToMark.length 
                    });

                    // Add read receipts for all these posts
                    postsToMark.forEach(postId => {
                        dispatch(addReader({
                            channelId: ChannelID,
                            postId,
                            userId: UserID,
                            isDM: true
                        }));
                    });
                }
            } else {
                // Regular channel - just update the single message
                dispatch(addReader({
                    channelId: ChannelID || '',
                    postId: MessageID,
                    userId: UserID,
                    isDM: false
                }));
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
            } else {
                debug.error('Invalid channel readers data:', data);
            }
        }
    };
}
