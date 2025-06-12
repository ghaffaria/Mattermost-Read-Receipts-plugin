import { createAsyncThunk } from '@reduxjs/toolkit';
import { setReaders, addReader } from '../store/channelReaders';

// Add this interface if not already defined elsewhere and imported
interface ReadEvent {
    MessageID: string;
    UserID: string;
    ChannelID: string;
    Timestamp: number;
}

/**
 * Loads read receipts for messages in a channel.
 * @param channelId - The ID of the channel to load readers for
 * @param sincePostId - Optional post ID to load readers since (for pagination/incremental loading)
 */
export const loadChannelReaders = createAsyncThunk(
    'channelReaders/loadChannelReaders',
    async (params: { channelId: string; /* sincePostId is no longer used by this specific thunk */ }, { dispatch }) => {
        const { channelId } = params;
        // Changed API endpoint to fetch all read events for the channel
        const url = `/plugins/mattermost-readreceipts/api/v1/receipts?channel_id=${encodeURIComponent(channelId)}`;

        console.log('📥 [Channel Actions] Loading ALL read events for channel:', {
            channelId,
            url
        });

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
            
            console.log('✅ [Channel Actions] Loaded raw read events:', {
                channelId,
                eventCount: events.length
            });

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
            
            console.log('🔄 [Channel Actions] Transformed payload for addReader (preserving existing state):', {
                channelId,
                postCount: Object.keys(transformedPayload).length,
                // Example: For a few posts if the payload is large
                samplePayload: Object.fromEntries(Object.entries(transformedPayload).slice(0, 3)) 
            });

            // Update Redux store by adding readers to preserve existing state
            // This prevents overwriting recent WebSocket updates
            for (const [postId, userIds] of Object.entries(transformedPayload)) {
                dispatch(addReader({
                    channelId,
                    postId,
                    userId: userIds.join(','),
                    isDM: false // Will be corrected by the addReader logic if needed
                }));
            }

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
        }
    }
);
