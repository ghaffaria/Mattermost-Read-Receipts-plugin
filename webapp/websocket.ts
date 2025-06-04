// webapp/websocket.ts

import { Dispatch } from 'redux';
import { updateReadReceipts, getUserDisplayName } from './store';
import { setReaders, addReader } from './store/channelReaders';

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

        const debug = {
            log: (category: string, ...args: any[]) => {
                if (window.__DEBUG_RR__?.verbose) {
                    console.log(`[RR ${category}]`, ...args);
                }
            },
            error: (...args: any[]) => console.error('[RR Error]', ...args)
        };

        if (eventType === READ_RECEIPT_EVENT) {
            const { MessageID, UserID, ChannelID, IsDM, ReaderIDs } = data;
            if (!MessageID || !UserID) {
                debug.error('Invalid read receipt data:', data);
                return;
            }

            // Get channel type from Mattermost store
            const store = (window as any).store;
            const channel = store?.getState()?.entities?.channels?.channels?.[ChannelID];
            const isDM = IsDM || channel?.type === 'D';

            if (isDM) {
                debug.log('DM', 'Processing DM read receipt', { MessageID, UserID, ChannelID });
                
                // For DMs, trigger a full channel state sync
                import('./store').then(({ loadInitialReceipts }) => {
                    loadInitialReceipts(ChannelID, dispatch, false).catch(error => {
                        debug.error('Failed to sync DM channel state:', error);
                    });
                }).catch(error => {
                    debug.error('Failed to import store module:', error);
                });

            } else {
                // For regular channels, just update the single message
                debug.log('Channel', 'Processing channel read receipt', { MessageID, UserID });
                dispatch(addReader({
                    channelId: ChannelID,
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

                debug.log('Channel', 'Updated channel readers', {
                    channelId: ChannelID,
                    readers: UserIDs
                });
            } else {
                debug.error('Invalid channel readers data:', data);
            }
        }
    };
}
