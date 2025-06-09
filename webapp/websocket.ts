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
        console.log(`🔔 [RR WebSocket] ${message}`, data || '');
    },
    error: (message: string, error?: any) => {
        console.error(`❌ [RR WebSocket] ${message}`, error || '');
    },
    warn: (message: string, data?: any) => {
        console.warn(`⚠️ [RR WebSocket] ${message}`, data || '');
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
        const { data, event: eventType, broadcast } = msg;
        
        // Always log WebSocket events for debugging
        debug.log(`Received WebSocket event: ${eventType}`, {
            eventType,
            hasData: !!data,
            data,
            broadcast,
            timestamp: new Date().toISOString()
        });

        if (!data) {
            debug.warn('WebSocket event has no data', { eventType });
            return;
        }

        if (eventType === READ_RECEIPT_EVENT) {
            debug.log('Processing READ_RECEIPT event', data);
            
            const { MessageID, UserID, ChannelID, IsDM, ReaderIDs, Timestamp } = data;
            
            if (!MessageID || !UserID) {
                debug.error('Invalid read receipt data - missing required fields', data);
                return;
            }

            // Get channel type from Mattermost store if not provided
            const store = (window as any).store;
            const channel = store?.getState()?.entities?.channels?.channels?.[ChannelID];
            const isDM = IsDM || channel?.type === 'D';

            debug.log(`Read receipt for ${isDM ? 'DM' : 'channel'}`, {
                MessageID,
                UserID,
                ChannelID,
                isDM,
                ReaderIDs,
                Timestamp
            });

            if (isDM) {
                // For DMs, trigger a full channel state sync
                debug.log('Triggering DM channel state sync', { ChannelID });
                
                // CRITICAL: For DMs, we need to update the Redux state immediately
                debug.log('📝 [WebSocket] Dispatching addReader for DM', {
                    channelId: ChannelID,
                    postId: MessageID,
                    userId: UserID,
                    isDM: true,
                    timestamp: new Date().toISOString()
                });
                
                dispatch(addReader({
                    channelId: ChannelID,
                    postId: MessageID,
                    userId: UserID,
                    isDM: true
                }));
                
                // Also trigger a full sync to ensure consistency
                import('./store').then(({ loadInitialReceipts }) => {
                    loadInitialReceipts(ChannelID, dispatch, false)
                        .then(() => {
                            debug.log('DM channel state sync completed', { ChannelID });
                        })
                        .catch(error => {
                            debug.error('Failed to sync DM channel state:', error);
                        });
                }).catch(error => {
                    debug.error('Failed to import store module:', error);
                });

            } else {
                // For regular channels, update the single message
                debug.log('Updating single message read receipt', { MessageID, UserID });
                
                dispatch(addReader({
                    channelId: ChannelID,
                    postId: MessageID,
                    userId: UserID,
                    isDM: false
                }));
            }
        }
        
        if (eventType === CHANNEL_READERS_EVENT) {
            debug.log('Processing CHANNEL_READERS event', data);
            
            const { ChannelID, LastPostID, UserIDs } = data;
            
            if (!ChannelID || !LastPostID || !Array.isArray(UserIDs)) {
                debug.error('Invalid channel readers data - missing required fields', data);
                return;
            }

            const store = (window as any).store;
            const channel = store?.getState()?.entities?.channels?.channels?.[ChannelID];
            const isDM = channel?.type === 'D';

            debug.log('Channel readers update', {
                ChannelID,
                LastPostID,
                UserIDs,
                isDM,
                userCount: UserIDs.length
            });
            
            // For channel readers, we might get multiple user IDs
            UserIDs.forEach((userId: string) => {
                dispatch(addReader({
                    channelId: ChannelID,
                    postId: LastPostID,
                    userId: userId,
                    isDM: isDM
                }));
            });

            debug.log('Channel readers update completed', {
                channelId: ChannelID,
                readers: UserIDs
            });
        }
    };
}
