// webapp/store.ts

import { Store, Dispatch } from 'redux';
import { addReader, setReaders, AddReaderPayload } from './store/channelReaders';

export interface MattermostUser {
    id: string;
    username: string;
    first_name?: string;
    last_name?: string;
    nickname?: string;
}

interface MattermostChannel {
    id: string;
    type: string;
    name: string;
}

interface MattermostState {
    entities: {
        users: {
            profiles: Record<string, MattermostUser>;
        };
        channels?: {
            channels: Record<string, MattermostChannel>;
        };
    };
}

interface MattermostStateWithPosts extends MattermostState {
    entities: {
        users: {
            profiles: Record<string, MattermostUser>;
        };
        posts: {
            posts: Record<string, Post>;
        };
        channels?: {
            channels: Record<string, MattermostChannel>;
        };
    };
}

let mattermostStore: Store<MattermostState> | null = null;

// Use Map instead of plain object for better mutability
const receiptMap = new Map<string, Set<string>>();

// Map to store channel read states
const channelReadsMap = new Map<string, Map<string, {lastPostId: string, lastSeenAt: number}>>();

export const setMattermostStore = (store: Store<MattermostState> | null) => {
    if (!store) {
        console.error('❌ [Store] Attempted to initialize with null store');
        return;
    }
    try {
        // Validate store has expected structure
        const state = store.getState();
        if (!state?.entities?.users?.profiles) {
            console.error('❌ [Store] Invalid store structure:', state);
            return;
        }

        mattermostStore = store;
        console.log('✅ [Store] Initialized with Mattermost store:', {
            hasStore: true,
            userProfiles: Object.keys(state.entities.users.profiles).length
        });

        // Load initial plugin config
        fetchPluginConfig().then(() => {
            console.log('⚙️ [Store] Plugin config loaded on initialization');
        });

        // Track seen posts to avoid duplicate processing
        const processedPosts = new Set<string>();

        // Store subscription for post updates
        const handlePostUpdate = (post: Post) => {
            const store = getMattermostStore();
            if (!store) return;

            const state = store.getState() as MattermostStateWithPosts;
            const channels = state.entities.channels?.channels || {};
            const channel = channels[post.channel_id];

            if (channel?.type === 'D') { // Direct Message channel
                console.log('📨 [Store] New DM message detected:', {
                    postId: post.id,
                    channelId: post.channel_id,
                    timestamp: new Date().toISOString()
                });
                
                // Debounce the channel state load to prevent multiple rapid API calls
                debounceChannelLoad(post.channel_id, async () => {
                    try {
                        await loadInitialReceipts(post.channel_id, store.dispatch, false);
                        console.log('✅ [Store] DM channel state loaded for new message:', {
                            channelId: post.channel_id,
                            postId: post.id
                        });
                    } catch (error) {
                        console.error('❌ [Store] Failed to load DM channel state:', error);
                    }
                });
            }
        };

        // Initialize store update subscription
        let lastPostId: string | null = null;
        store.subscribe(() => {
            const state = store.getState() as MattermostStateWithPosts;
            const posts = state.entities.posts?.posts || {};
            
            // Get the most recent post
            const latestPost = Object.values(posts)
                .sort((a, b) => b.create_at - a.create_at)[0];
                
            // Only process if this is a new post we haven't seen
            if (latestPost && latestPost.id !== lastPostId) {
                lastPostId = latestPost.id;
                handlePostUpdate(latestPost);
            }
        });

    } catch (error) {
        console.error('❌ [Store] Failed to initialize store:', error);
    }
};

// Add store check function with timeout
export const waitForStoreInitialization = (maxWaitMs: number = 5000): Promise<boolean> => {
    return new Promise((resolve) => {
        const checkStore = () => {
            if (mattermostStore) {
                resolve(true);
                return;
            }
            console.log('⏳ [Store] Waiting for store initialization...');
        };
        
        const startTime = Date.now();
        const interval = setInterval(() => {
            if (mattermostStore) {
                clearInterval(interval);
                resolve(true);
                return;
            }
            
            if (Date.now() - startTime > maxWaitMs) {
                clearInterval(interval);
                console.warn('⚠️ [Store] Store initialization timeout');
                resolve(false);
                return;
            }
        }, 100);
        
        // Check immediately
        checkStore();
    });
};

export const getMattermostStore = (): Store<MattermostState> | null => {
    if (!mattermostStore) {
        console.warn('⚠️ [Store] Attempted to access uninitialized store - waiting...');
        // Don't return immediately, let the caller handle this
    }
    return mattermostStore;
};

// Enhanced safe store access with automatic waiting
export const getMattermostStoreSafe = async (timeoutMs: number = 2000): Promise<Store<MattermostState> | null> => {
    if (mattermostStore) {
        return mattermostStore;
    }
    
    console.log('⏳ [Store] Store not ready, waiting for initialization...');
    const isReady = await waitForStoreInitialization(timeoutMs);
    
    if (!isReady) {
        console.error('❌ [Store] Store failed to initialize within timeout');
        return null;
    }
    
    return mattermostStore;
};

export const getReadReceipts = (): Record<string, string[]> => {
    // Convert Map to plain object for API compatibility
    const receipts: Record<string, string[]> = {};
    receiptMap.forEach((users, messageId) => {
        receipts[messageId] = Array.from(users);
    });
    
    console.log('📖 [Store] Getting all read receipts:', {
        messageCount: receiptMap.size,
        messages: Array.from(receiptMap.keys())
    });
    
    return receipts;
};

export const getMessageReadReceipts = (messageId: string): string[] => {
    if (!messageId) {
        console.warn('⚠️ [Store] Called getMessageReadReceipts with empty messageId');
        return [];
    }
    const users = receiptMap.get(messageId);
    if (!users) {
        console.log('ℹ️ [Store] No receipts found for message:', messageId);
        return [];
    }
    return Array.from(users);
};

export const updateReadReceipts = (messageId: string, userId: string, isRealTimeUpdate: boolean = true): void => {
    if (!messageId || !userId) {
        console.error('❌ [Store] Invalid receipt update:', { messageId, userId });
        return;
    }

    console.log('✏️ [Store] Updating receipts:', {
        messageId,
        userId,
        isRealTimeUpdate,
        beforeState: receiptMap.get(messageId)
    });

    if (!receiptMap.has(messageId)) {
        receiptMap.set(messageId, new Set());
    }

    const users = receiptMap.get(messageId)!;
    const wasAdded = !users.has(userId);
    users.add(userId);

    if (wasAdded) {
        console.log('✅ [Store] Receipt added:', {
            messageId,
            userId,
            isRealTimeUpdate,
            afterState: Array.from(users)
        });

        // Get store and dispatch
        const store = getMattermostStore();
        if (store) {
            // Update Redux store
            store.dispatch(addReader({
                channelId: '', // Channel ID will be set from the post data
                postId: messageId,
                userId: Array.from(users).join(',')
            }));
        }

        // Only dispatch UI events for real-time updates, not initial loads
        if (isRealTimeUpdate) {
            console.log('📢 [Store] Dispatching real-time receipt update event');
            
            // Dispatch event to trigger UI updates
            const event = new CustomEvent(STORE_UPDATE_EVENT, {
                detail: {
                    type: 'receipt_added',
                    receipts: [{
                        messageId,
                        users: Array.from(users)
                    }]
                }
            });
            window.dispatchEvent(event);
        } else {
            console.log('🔇 [Store] Skipping UI event for initial receipt load');
        }
    } else {
        console.log('ℹ️ [Store] Receipt already exists:', {
            messageId,
            userId,
            isRealTimeUpdate
        });
    }
};

export const updateReceipts = (messageId: string, userId: string, isRealTimeUpdate: boolean = false) => {
    console.log('✏️ [Store] Updating receipts:', {
        messageId,
        userId,
        isRealTimeUpdate,
        beforeState: receiptMap.get(messageId)
    });

    let readers = receiptMap.get(messageId);
    if (!readers) {
        readers = new Set<string>();
        receiptMap.set(messageId, readers);
    }
    
    // Add the reader
    readers.add(userId);

    console.log('✅ [Store] Receipt added:', {
        messageId,
        userId,
        isRealTimeUpdate,
        afterState: Array.from(readers)
    });

    // Get store
    const store = getMattermostStore();
    if (!store) {
        console.error('❌ [Store] Store not available for dispatch');
        return;
    }

    try {
        // Enhanced Redux action with DM support
        console.log('📢 [Store] Dispatching receipt update for messageId:', messageId);
        const channelId = messageId.split(':')[0];
        
        // First update the receipt map
        const payload: AddReaderPayload = {
            channelId,
            postId: messageId,
            userId,
            isDM: true
        };
        
        store.dispatch(addReader(payload));
        
        // Then dispatch a custom event for immediate UI update
        console.log('📣 [Store] Broadcasting receipt update event');
        const event = new CustomEvent(STORE_UPDATE_EVENT, {
            detail: {
                type: 'receipt_added',
                messageId,
                userId,
                channelId,
                readers: Array.from(readers)
            }
        });
        window.dispatchEvent(event);
        
    } catch (error) {
        console.error('❌ [Store] Failed to dispatch:', error);
    }
};

export const getUserProfiles = (): Record<string, MattermostUser> => {
    if (!mattermostStore) {
        console.error('❌ [Store] Cannot get user profiles: store not initialized');
        return {};
    }

    const profiles = mattermostStore.getState()?.entities?.users?.profiles;
    if (!profiles) {
        console.error('❌ [Store] Cannot get user profiles: invalid store structure');
        return {};
    }

    console.log('👥 [Store] Getting user profiles:', {
        count: Object.keys(profiles).length,
        users: Object.keys(profiles).map(id => ({
            id,
            username: profiles[id].username
        }))
    });
    return profiles;
};

export const getUserDisplayName = (userId: string): string => {
    try {
        const store = getMattermostStore();
        if (!store) {
            console.warn('⚠️ [Store] Store not available for getUserDisplayName, using fallback');
            return `User ${userId.substring(0, 8)}`;
        }
        
        const profiles = store.getState()?.entities?.users?.profiles;
        if (!profiles) {
            console.warn('⚠️ [Store] User profiles not available, using fallback');
            return `User ${userId.substring(0, 8)}`;
        }
        
        const user = profiles[userId];
        if (!user) {
            console.warn('⚠️ [Store] User profile not found:', userId);
            return `User ${userId.substring(0, 8)}`;
        }

        const displayName = user.nickname || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || `User ${userId.substring(0, 8)}`;
        console.log('👤 [Store] Getting display name:', {
            userId,
            displayName,
            hasNickname: !!user.nickname,
            hasFirstName: !!user.first_name,
            hasLastName: !!user.last_name,
            hasUsername: !!user.username
        });
        return displayName;
    } catch (error) {
        console.error('❌ [Store] Error getting user display name:', error);
        return `User ${userId.substring(0, 8)}`;
    }
};

// Utility function to debounce API calls
const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();

function debounceChannelLoad(channelId: string, fn: () => Promise<void>, delay: number = 300) {
    if (debounceMap.has(channelId)) {
        clearTimeout(debounceMap.get(channelId)!);
    }
    
    const timeoutId = setTimeout(async () => {
        debounceMap.delete(channelId);
        await fn();
    }, delay);
    
    debounceMap.set(channelId, timeoutId);
}

// Custom event for store updates
const STORE_UPDATE_EVENT = 'mattermost-readreceipts_store_update';

interface ReadEvent {
    MessageID: string;  // backend uses uppercase
    UserID: string;     // backend uses uppercase
    ChannelID: string;  // backend uses uppercase
    Timestamp: number;
}

interface Receipt {
    message_id: string;
    user_id: string;
    channel_id: string;
    timestamp: number;
}

interface ChannelRead {
    channel_id: string;
    user_id: string;
    last_post_id: string;
    last_seen_at: number;
}

// Track concurrent requests to prevent race conditions
const loadingChannels = new Set<string>();

export const loadInitialReceipts = async (channelId: string, dispatch?: Dispatch, isInitialLoad: boolean = true): Promise<void> => {
    // Prevent concurrent loads for the same channel
    if (loadingChannels.has(channelId)) {
        console.log(`⏸️ [Store] Channel ${channelId} already loading, skipping duplicate request`);
        return;
    }
    
    loadingChannels.add(channelId);
    
    console.log('🔄 [Store] Loading receipts for channel:', { channelId, isInitialLoad });
    
    try {
        // Fetch both receipts and channel reads in parallel
        const [receiptsResponse, readsResponse] = await Promise.all([
            fetch(
                `/plugins/mattermost-readreceipts/api/v1/receipts?channel_id=${encodeURIComponent(channelId)}&since=0`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'include'
                }
            ),
            fetch(
                `/plugins/mattermost-readreceipts/api/v1/channel/${encodeURIComponent(channelId)}/reads`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'include'
                }
            )
        ]);

        if (!receiptsResponse.ok || !readsResponse.ok) {
            throw new Error(`HTTP error! receipts: ${receiptsResponse.status}, reads: ${readsResponse.status}`);
        }

                // Process both responses and handle potential empty responses
        let [receiptsData, channelReads] = await Promise.all([
            receiptsResponse.json() as Promise<ReadEvent[]>,
            readsResponse.json() as Promise<ChannelRead[]>
        ]);

        // Log raw API responses before any processing
        console.log('踏 [Store] API Response - loadInitialReceipts - Raw ReceiptsData:', {
            endpoint: `/plugins/mattermost-readreceipts/api/v1/receipts?channel_id=${channelId}`,
            status: receiptsResponse.status,
            responseBody: JSON.stringify(receiptsData, null, 2),
            timestamp: new Date().toISOString()
        });
        console.log('踏 [Store] API Response - loadInitialReceipts - Raw ChannelReads:', {
            endpoint: `/plugins/mattermost-readreceipts/api/v1/channel/${channelId}/reads`,
            status: readsResponse.status,
            responseBody: JSON.stringify(channelReads, null, 2),
            timestamp: new Date().toISOString()
        });
        
        // Ensure we have arrays even if backend returns null
        receiptsData = receiptsData || [];
        channelReads = channelReads || [];

        // Transform the receipts data into our internal format, handling null/empty data
        const messageReceipts: Receipt[] = (receiptsData || []).map(event => ({
            message_id: event.MessageID,
            user_id: event.UserID,
            channel_id: event.ChannelID,
            timestamp: event.Timestamp
        }));

        console.log('📥 [Store] Received data:', {
            channelId,
            messageReceiptsCount: messageReceipts.length,
            channelReadsCount: channelReads.length,
            isInitialLoad
        });

        // Update channel reads map, handling null/empty data
        const channelReadersMap = new Map<string, {lastPostId: string, lastSeenAt: number}>();
        if (channelReads && channelReads.length > 0) {
            for (const read of channelReads) {
                if (read && read.user_id && read.last_post_id !== undefined) {
                    channelReadersMap.set(read.user_id, {
                        lastPostId: read.last_post_id,
                        lastSeenAt: read.last_seen_at || 0
                    });
                }
            }
        }
        channelReadsMap.set(channelId, channelReadersMap);

        // Process message receipts
        const messageReceiptsMap = new Map<string, Set<string>>();
        if (messageReceipts && messageReceipts.length > 0) {
            for (const receipt of messageReceipts) {
                if (receipt && receipt.message_id && receipt.user_id) {
                    const users = messageReceiptsMap.get(receipt.message_id) || new Set<string>();
                    users.add(receipt.user_id);
                    messageReceiptsMap.set(receipt.message_id, users);
                }
            }
        }

        // Merge channel reads into message receipts
        const store = getMattermostStore() as Store<MattermostStateWithPosts> | null;
        const posts = store?.getState()?.entities?.posts?.posts || {};
        
        Object.entries(posts).forEach(([postId, post]) => {
            if (post.channel_id === channelId) {
                const existingReaders = messageReceiptsMap.get(postId) || new Set<string>();
                channelReadersMap.forEach((read, userId) => {
                    // Add user to post readers if they've read up to this post
                    if (read.lastSeenAt >= post.create_at) {
                        existingReaders.add(userId);
                    }
                });
                messageReceiptsMap.set(postId, existingReaders);
            }
        });

        // REDUX TRACE - Initial Load Processing
     

        // Use individual addReader dispatches to preserve existing WebSocket-received state
        // This prevents overwriting recent read receipts that arrived via WebSocket
        if (dispatch) {
            messageReceiptsMap.forEach((users, messageId) => {
                const userArray = Array.from(users);
                // Dispatch each reader individually to preserve existing state
                for (const userId of userArray) {
                    dispatch(addReader({
                        channelId,
                        postId: messageId,
                        userId,
                        isDM: false // Will be corrected by addReader logic if needed
                    }));
                }
            });
            console.log('✅ [Store] Added readers individually to preserve WebSocket state for channel:', channelId);
        }

        console.log('💾 [Store] Updated maps:', {
            channelId,
            messageCount: messageReceiptsMap.size,
            messages: Array.from(messageReceiptsMap.keys()),
            isInitialLoad
        });

        // Only dispatch UI update events for real-time updates, not initial loads
        if (!isInitialLoad) {
            console.log('📢 [Store] Dispatching store update event for real-time update');
            
            // Dispatch event to trigger rerenders
            const event = new CustomEvent(STORE_UPDATE_EVENT, {
                detail: {
                    type: 'receipts_loaded',
                    channelId,
                    messageCount: messageReceiptsMap.size,
                    receipts: Array.from(messageReceiptsMap.entries()).map(([msgId, users]) => ({
                        messageId: msgId,
                        users: Array.from(users)
                    }))
                }
            });

            window.dispatchEvent(event);
        } else {
            console.log('🔇 [Store] Skipping UI update event for initial load (prevents "Seen by" flash)');
        }
        
        console.log('📢 [Store] Data loading complete:', {
            type: isInitialLoad ? 'initial_load' : 'real_time_update',
            channelId,
            messageCount: messageReceiptsMap.size
        });

    } catch (error) {
        console.error('❌ [Store] Failed to load channel data:', {
            channelId,
            error
        });
        throw error;
    } finally {
        // Always remove from loading set
        loadingChannels.delete(channelId);
    }
};

interface Post extends Record<string, any> {
    id: string;
    channel_id: string;
    create_at: number;
    user_id: string;
}

interface MattermostStateWithPosts extends MattermostState {
    entities: {
        users: {
            profiles: Record<string, MattermostUser>;
        };
        posts: {
            posts: Record<string, Post>;
        };
        channels?: {
            channels: Record<string, MattermostChannel>;
        };
    };
}

// Map to store channel read states
const channelReadMap = new Map<string, Map<string, {lastPostId: string, lastSeenAt: number}>>();

interface ChannelRead {
    channel_id: string;
    user_id: string;
    last_post_id: string;
    last_seen_at: number;
}

// Track concurrent channel reads requests
const loadingChannelReads = new Set<string>();

export const loadChannelReads = async (channelId: string, isInitialLoad: boolean = true): Promise<void> => {
    // Prevent concurrent loads for the same channel
    if (loadingChannelReads.has(channelId)) {
        console.log(`⏸️ [Store] Channel reads for ${channelId} already loading, skipping duplicate request`);
        return;
    }
    
    loadingChannelReads.add(channelId);
    
    try {
        console.log('📖 [Store] Loading channel reads:', { channelId, isInitialLoad });
        
        const response = await fetch(
            `/plugins/mattermost-readreceipts/api/v1/channel/${channelId}/reads`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include'
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reads: ChannelRead[] = await response.json();
        
        // Log raw API response before any processing
        console.log('踏 [Store] API Response - loadChannelReads:', {
            endpoint: `/plugins/mattermost-readreceipts/api/v1/channel/${channelId}/reads`,
            status: response.status,
            responseBody: JSON.stringify(reads, null, 2),
            count: reads?.length || 0,
            hasData: !!reads,
            timestamp: new Date().toISOString()
        });

        // Initialize channel map if needed
        if (!channelReadMap.has(channelId)) {
            channelReadMap.set(channelId, new Map());
        }
        
        const channelReads = channelReadMap.get(channelId)!;
        
        // Update channel reads
        reads.forEach(read => {
            channelReads.set(read.user_id, {
                lastPostId: read.last_post_id,
                lastSeenAt: read.last_seen_at
            });
        });

        // Get posts from Mattermost store
        const store = getMattermostStore() as Store<MattermostStateWithPosts> | null;
        const posts = store?.getState()?.entities?.posts?.posts || {};

        // Update receipt map based on channel reads
        Object.entries(posts).forEach(([postId, post]) => {
            if (post.channel_id === channelId) {
                const postReaders = new Set<string>();
                channelReads.forEach((read, userId) => {
                    // Add user to post readers if they've read up to this post
                    if (read.lastSeenAt >= post.create_at) {
                        postReaders.add(userId);
                    }
                });
                receiptMap.set(postId, postReaders);
            }
        });

        console.log('✅ [Store] Channel reads loaded:', {
            channelId,
            readsCount: channelReads.size,
            updatedPosts: Array.from(receiptMap.keys()),
            isInitialLoad
        });

        // Only dispatch UI update events for real-time updates, not initial loads
        if (!isInitialLoad) {
            console.log('📢 [Store] Dispatching channel reads update event for real-time update');
            
            // Trigger UI update
            const event = new CustomEvent(STORE_UPDATE_EVENT, {
                detail: {
                    type: 'channel_reads_loaded',
                    channelId,
                    reads: Array.from(channelReads.entries()).map(([userId, read]) => ({
                        userId,
                        ...read
                    }))
                }
            });
            window.dispatchEvent(event);
        } else {
            console.log('🔇 [Store] Skipping UI update event for initial channel reads load');
        }

    } catch (error) {
        console.error('❌ [Store] Failed to load channel reads:', {
            channelId,
            error
        });
        throw error;
    } finally {
        // Always remove from loading set
        loadingChannelReads.delete(channelId);
    }
};

// Export event name for components
export const RECEIPT_STORE_UPDATE = STORE_UPDATE_EVENT;

export let visibilityThresholdMs = 2000;

export async function fetchPluginConfig(): Promise<void> {
    try {
        const response = await fetch('/plugins/mattermost-readreceipts/api/v1/config');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const config = await response.json();
        if (typeof config.visibility_threshold_ms === 'number') {
            visibilityThresholdMs = config.visibility_threshold_ms;
            if (!visibilityThresholdMs) {
                visibilityThresholdMs = 2000; // Reset to default if received 0
                console.log('⚙️ [Store] Invalid threshold received, using default:', visibilityThresholdMs);
            }
            console.log('⚙️ [Store] Updated visibility threshold:', visibilityThresholdMs);
        }
    } catch (error) {
        console.error('❌ [Store] Failed to fetch plugin config:', error);
        // Keep default value on error
    }
}
