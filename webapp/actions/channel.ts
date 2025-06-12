import { createAsyncThunk } from '@reduxjs/toolkit';
import { setReaders, addReader } from '../store/channelReaders';

// Add this interface if not already defined elsewhere and imported
interface ReadEvent {
    MessageID: string;
    UserID: string;
    ChannelID: string;
    Timestamp: number;
}

// Track ongoing requests to prevent race conditions
const ongoingRequests = new Set<string>();

/**
 * Loads read receipts for messages in a channel.
 * @param channelId - The ID of the channel to load readers for
 * @param sincePostId - Optional post ID to load readers since (for pagination/incremental loading)
 */
export const loadChannelReaders = createAsyncThunk(
    'channelReaders/loadChannelReaders',
    async (params: { channelId: string; /* sincePostId is no longer used by this specific thunk */ }, { dispatch }) => {
        const { channelId } = params;
        
        // Prevent duplicate requests for the same channel
        if (ongoingRequests.has(channelId)) {
            return {};
        }
        
        ongoingRequests.add(channelId);
        
        // Changed API endpoint to fetch all read events for the channel
        const url = `/plugins/mattermost-readreceipts/api/v1/receipts?channel_id=${encodeURIComponent(channelId)}`;
        
        try {

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    // Ensure standard Mattermost headers like X-Requested-With are included if needed by middleware
                    'X-Requested-With': 'XMLHttpRequest' 
                },
                credentials: 'same-origin', // Or 'include' if necessary for your setup
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status} from ${url}`);
            }

            // API /api/v1/receipts returns ReadEvent[]
            const events: ReadEvent[] = await response.json();

            // Transform ReadEvent[] to { [postId: string]: string[] }
            const transformedPayload: { [postId: string]: string[] } = {};
            for (const event of events) {
                if (!transformedPayload[event.MessageID]) {
                    transformedPayload[event.MessageID] = [];
                }
                // Ensure a user is added only once per message
                if (!transformedPayload[event.MessageID].includes(event.UserID)) {
                    transformedPayload[event.MessageID].push(event.UserID);
                }
            }
            
            // Check if this is a DM channel for proper handling
            const store = (window as any).store;
            const channel = store?.getState()?.entities?.channels?.channels?.[channelId];
            const isDM = channel?.type === 'D';
            
            // Update Redux store with complete state replacement
            // This ensures consistent state regardless of any race conditions
            dispatch(setReaders({
                channelId,
                payload: transformedPayload,
                isDM // Include DM context for proper handling
            }));

            // The thunk should return a meaningful value, here we return the transformed payload
            return transformedPayload; 
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('❌ [Channel Actions] Failed to load and transform channel read events:', {
                channelId,
                error: errorMessage,
                url,
            });
            // Dispatching a rejected action is handled automatically by createAsyncThunk
            throw error; 
        } finally {
            // Always remove from ongoing requests
            ongoingRequests.delete(channelId);
        }
    }
);
