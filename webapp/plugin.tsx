// webapp/plugin.tsx
import React from 'react';
// @ts-ignore
import { PluginRegistry } from 'mattermost-webapp/plugins/registry';
import PostReceipt from './components/PostReceipt';
import { handleWebSocketEvent } from './websocket';
import { loadInitialReceipts, fetchPluginConfig, loadChannelReads } from './store';
import { loadChannelReaders } from './actions/channel';
import { ensureChannelReadsOnSwitch } from './store/index';
import { store as pluginGlobalStoreInstance, setMattermostStore, isStoreInitialized } from './store/pluginStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import ReadReceiptRootObserver from './components/ReadReceiptRootObserver';
import { Provider } from 'react-redux';

import { Post } from './types/mattermost-webapp';

// Debug mode - set to false to disable verbose logging
const DEBUG_MODE = false;
const debugLog = (...args: any[]) => { if (DEBUG_MODE) console.log(...args); };

interface PostProps {
    post: Post;
}

// WebSocket event constants - must match server-side exactly
const WEBSOCKET_EVENT_READ_RECEIPT = 'custom_mattermost-readreceipts_read_receipt';
const WEBSOCKET_EVENT_CHANNEL_READERS = 'custom_mattermost-readreceipts_channel_readers';

// Global reference for manual reinitialization
let globalRegistry: PluginRegistry | null = null;
let globalMattermostStore: any = null;

// Helper function to get user display name
const getUserDisplayName = (userId: string): string => {
    try {
        const mmStore = (window as any).store;
        const user = mmStore?.getState()?.entities?.users?.profiles?.[userId];
        if (user) {
            return user.nickname ||
                `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
                user.username ||
                userId.substring(0, 8);
        }
    } catch { /* ignore */ }
    return userId.substring(0, 8);
};

// Store payload globally so we can re-inject on scroll/DOM changes
let currentChannelPayload: { [postId: string]: string[] } = {};
let currentChannelId: string = '';
let scrollListenerAttached = false;
let injectionPending = false;

// Exported function for WebSocket handler to call when new read receipts arrive
export const updateAndReinjectReceipt = (channelId: string, postId: string, readerIds: string[]) => {
    // Get the actual current channel from Mattermost store (most reliable source)
    const mmStore = (window as any).store;
    const actualCurrentChannel = mmStore?.getState()?.entities?.channels?.currentChannelId;

    // If currentChannelId wasn't set (e.g., no channel switch happened), update it
    if (!currentChannelId && actualCurrentChannel) {
        currentChannelId = actualCurrentChannel;
    }

    // Only update if this is the current channel (check both stored and actual)
    if (channelId !== currentChannelId && channelId !== actualCurrentChannel) {
        return;
    }

    // Ensure currentChannelId is set for future use
    if (currentChannelId !== channelId) {
        currentChannelId = channelId;
    }

    // Update the payload - clone arrays to avoid mutating frozen Redux state
    if (!currentChannelPayload[postId]) {
        currentChannelPayload[postId] = [];
    } else if (Object.isFrozen(currentChannelPayload[postId])) {
        // Clone the frozen array
        currentChannelPayload[postId] = [...currentChannelPayload[postId]];
    }

    // Add new readers (avoiding duplicates)
    for (const readerId of readerIds) {
        if (!currentChannelPayload[postId].includes(readerId)) {
            currentChannelPayload[postId].push(readerId);
        }
    }

    // Trigger re-injection after a short delay
    setTimeout(() => {
        if (Object.keys(currentChannelPayload).length > 0 && currentChannelId) {
            injectReceiptsIntoDOMQuiet(currentChannelPayload, currentChannelId);
        }
    }, 100);
};


// Debounced re-injection for scroll events
const debouncedReinject = (() => {
    let timeout: number | null = null;
    return () => {
        if (timeout) clearTimeout(timeout);
        if (injectionPending) return;
        timeout = window.setTimeout(() => {
            if (Object.keys(currentChannelPayload).length > 0 && currentChannelId) {
                injectReceiptsIntoDOMQuiet(currentChannelPayload, currentChannelId);
            }
        }, 100);
    };
})();

// Quiet version without logging for scroll events
const injectReceiptsIntoDOMQuiet = (payload: { [postId: string]: string[] }, channelId: string) => {
    const currentUserId = document.cookie.match(/MMUSERID=([^;]+)/)?.[1] ||
        window.localStorage.getItem('MMUSERID') || '';

    if (!currentUserId) return;

    // Try multiple selectors
    let postElements = document.querySelectorAll('.post');
    if (postElements.length === 0) {
        postElements = document.querySelectorAll('[id^="post_"]');
    }
    if (postElements.length === 0) return;

    postElements.forEach((postElement) => {
        const elementId = postElement.getAttribute('id');
        let postId = '';

        if (elementId?.startsWith('post_')) {
            postId = elementId.replace('post_', '');
        } else {
            const nestedPost = postElement.querySelector('[id^="post_"]');
            if (nestedPost) {
                postId = nestedPost.getAttribute('id')?.replace('post_', '') || '';
            }
        }

        if (!postId) return;
        const readers = payload[postId];
        if (!readers || readers.length === 0) return;

        const mmStore = (window as any).store;
        const post = mmStore?.getState()?.entities?.posts?.posts?.[postId];
        if (!post || post.channel_id !== channelId) return;
        if (post.user_id !== currentUserId) return;

        const otherReaders = readers.filter((r: string) => r !== currentUserId);
        if (otherReaders.length === 0) return;

        const existingReceipt = postElement.querySelector('.injected-read-receipt, .post-receipt-container');
        if (existingReceipt) return;

        const postBody = postElement.querySelector('.post-message__text-container, .post__body');
        if (!postBody) return;

        const receiptDiv = document.createElement('div');
        receiptDiv.className = 'injected-read-receipt';
        receiptDiv.style.cssText = 'font-size: 11px; color: rgba(63, 67, 80, 0.72); padding: 4px 0; margin-top: 2px;';

        const displayNames = otherReaders.map(getUserDisplayName);
        receiptDiv.textContent = `Seen by ${displayNames.join(', ')}`;

        postBody.parentNode?.insertBefore(receiptDiv, postBody.nextSibling);
    });
};

// Set up scroll listener and mutation observer
const setupScrollListener = () => {
    if (scrollListenerAttached) return;
    scrollListenerAttached = true;

    // Find the post list container - try multiple selectors
    const containerSelectors = [
        '.post-list__content',
        '.post-list-holder-by-time',
        '#post-list',
        '.post-list__table',
        '.post-right-container',
        '.a11y__region'
    ];

    let postListContainer: Element | null = null;
    for (const selector of containerSelectors) {
        postListContainer = document.querySelector(selector);
        if (postListContainer) break;
    }

    if (postListContainer) {
        // Scroll listener
        postListContainer.addEventListener('scroll', debouncedReinject, { passive: true });

        // MutationObserver to catch when posts are added/removed
        const observer = new MutationObserver(() => {
            debouncedReinject();
        });

        observer.observe(postListContainer, {
            childList: true,
            subtree: true
        });
    }

    // Also listen on document scroll as fallback
    document.addEventListener('scroll', debouncedReinject, { passive: true, capture: true });

    // Periodic re-injection as final fallback (every 500ms for 10 seconds)
    let periodicCount = 0;
    const periodicInterval = setInterval(() => {
        periodicCount++;
        if (periodicCount > 20) {
            clearInterval(periodicInterval);
            return;
        }
        if (Object.keys(currentChannelPayload).length > 0 && currentChannelId) {
            injectReceiptsIntoDOMQuiet(currentChannelPayload, currentChannelId);
        }
    }, 500);
};

// Track which posts we've already sent read receipts for (to avoid duplicates)
const sentReadReceipts = new Set<string>();

// DOM-based visibility tracking for posts by others
// This replaces the React-based VisibilityTracker when React components don't render
const setupVisibilityTracking = (channelId: string, payload: { [postId: string]: string[] }) => {
    const currentUserId = document.cookie.match(/MMUSERID=([^;]+)/)?.[1] ||
        window.localStorage.getItem('MMUSERID') || '';

    if (!currentUserId) return;

    const mmStore = (window as any).store;

    // Find visible posts by others that haven't been marked as read
    const checkAndSendReadReceipts = () => {
        const postElements = document.querySelectorAll('.post, [id^="post_"]');

        postElements.forEach((postElement) => {
            const elementId = postElement.getAttribute('id');
            let postId = '';

            if (elementId?.startsWith('post_')) {
                postId = elementId.replace('post_', '');
            }

            if (!postId) return;

            // Skip if already sent
            if (sentReadReceipts.has(postId)) return;

            // Get post from Mattermost store
            const post = mmStore?.getState()?.entities?.posts?.posts?.[postId];
            if (!post || post.channel_id !== channelId) return;

            // Only track messages by others
            if (post.user_id === currentUserId) return;

            // Check if already read (in payload)
            const readers = payload[postId] || [];
            if (readers.includes(currentUserId)) return;

            // Check if element is visible in viewport
            const rect = postElement.getBoundingClientRect();
            const isVisible = (
                rect.top >= 0 &&
                rect.bottom <= window.innerHeight &&
                rect.width > 0 &&
                rect.height > 0
            );

            if (!isVisible) return;

            // Mark as sent to prevent duplicates
            sentReadReceipts.add(postId);

            const csrfToken = document.cookie.match(/MMCSRF=([^;]+)/)?.[1] || '';

            fetch('/plugins/mattermost-readreceipts/api/v1/read', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                    'Mattermost-User-Id': currentUserId
                },
                credentials: 'same-origin',
                body: JSON.stringify({
                    message_id: postId,
                    channel_id: channelId,
                    timestamp: Date.now()
                }),
            }).then(response => {
                // Successfully sent
            }).catch(error => {
                console.error('[VisibilityTracking] Failed to send read receipt:', error);
                // Remove from sent so it can be retried
                sentReadReceipts.delete(postId);
            });
        });
    };

    // Check immediately
    setTimeout(checkAndSendReadReceipts, 500);

    // Also check on scroll (debounced)
    let scrollTimeout: number | null = null;
    const handleScroll = () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = window.setTimeout(checkAndSendReadReceipts, 300);
    };

    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    // Check periodically for the first 5 seconds
    let checkCount = 0;
    const checkInterval = setInterval(() => {
        checkCount++;
        if (checkCount > 10) {
            clearInterval(checkInterval);
            return;
        }
        checkAndSendReadReceipts();
    }, 500);
};

// WORKAROUND: Directly inject receipt elements into DOM
// This bypasses React's rendering issues on channel switch
const injectReceiptsIntoDOM = (payload: { [postId: string]: string[] }, channelId: string) => {
    // Store for re-injection on scroll
    currentChannelPayload = payload;
    currentChannelId = channelId;

    const currentUserId = document.cookie.match(/MMUSERID=([^;]+)/)?.[1] ||
        window.localStorage.getItem('MMUSERID') || '';

    if (!currentUserId) {
        return;
    }

    // Set up scroll listener
    setupScrollListener();

    // Delay to ensure DOM is fully rendered
    setTimeout(() => {
        // Try multiple selectors - Mattermost's DOM structure varies
        let postElements = document.querySelectorAll('[data-testid^="postView_"]');
        if (postElements.length === 0) {
            postElements = document.querySelectorAll('.post');
        }
        if (postElements.length === 0) {
            postElements = document.querySelectorAll('[id^="post_"]');
        }
        if (postElements.length === 0) {
            postElements = document.querySelectorAll('.a11y__section.post');
        }

        let injectedCount = 0;
        let skippedReasons: { [key: string]: number } = {};

        postElements.forEach((postElement) => {
            // Extract postId from various possible attributes
            const testId = postElement.getAttribute('data-testid');
            const elementId = postElement.getAttribute('id');
            let postId = '';

            if (testId?.startsWith('postView_')) {
                postId = testId.replace('postView_', '');
            } else if (testId?.startsWith('post_')) {
                postId = testId.replace('post_', '');
            } else if (elementId?.startsWith('post_')) {
                postId = elementId.replace('post_', '');
            } else {
                // Try to find a nested element with post ID
                const nestedPost = postElement.querySelector('[id^="post_"]');
                if (nestedPost) {
                    postId = nestedPost.getAttribute('id')?.replace('post_', '') || '';
                }
            }

            if (!postId) { skippedReasons['no-postid'] = (skippedReasons['no-postid'] || 0) + 1; return; }

            const readers = payload[postId];
            if (!readers || readers.length === 0) { skippedReasons['no-readers'] = (skippedReasons['no-readers'] || 0) + 1; return; }

            const mmStore = (window as any).store;
            const post = mmStore?.getState()?.entities?.posts?.posts?.[postId];
            if (!post || post.channel_id !== channelId) { skippedReasons['wrong-channel'] = (skippedReasons['wrong-channel'] || 0) + 1; return; }

            // Only show receipts on own messages
            if (post.user_id !== currentUserId) { skippedReasons['not-own-msg'] = (skippedReasons['not-own-msg'] || 0) + 1; return; }

            // Filter out self from readers
            const otherReaders = readers.filter((r: string) => r !== currentUserId);
            if (otherReaders.length === 0) { skippedReasons['only-self-reader'] = (skippedReasons['only-self-reader'] || 0) + 1; return; }

            // Check if receipt already exists (injected OR React-rendered)
            const existingReceipt = postElement.querySelector('.injected-read-receipt, .post-receipt-container');
            if (existingReceipt) { skippedReasons['already-exists'] = (skippedReasons['already-exists'] || 0) + 1; return; }

            // Find the post message container
            const postBody = postElement.querySelector('.post-message__text-container, .post__body');
            if (!postBody) { skippedReasons['no-post-body'] = (skippedReasons['no-post-body'] || 0) + 1; return; }

            // Create receipt element
            const receiptDiv = document.createElement('div');
            receiptDiv.className = 'injected-read-receipt';
            receiptDiv.style.cssText = 'font-size: 11px; color: rgba(63, 67, 80, 0.72); padding: 4px 0; margin-top: 2px;';

            const displayNames = otherReaders.map(getUserDisplayName);
            receiptDiv.textContent = `Seen by ${displayNames.join(', ')}`;

            postBody.parentNode?.insertBefore(receiptDiv, postBody.nextSibling);
            injectedCount++;
        });

    }, 200);
};


export const reinitializeReadReceipts = async (channelId?: string) => {
    if (!globalRegistry || !globalMattermostStore || !isStoreInitialized()) {
        console.error('[ReadReceiptPlugin] Cannot reinitialize - missing required components');
        return;
    }

    try {
        // Re-fetch plugin config
        const config = await fetchPluginConfig().catch(err => {
            console.error('❌ [ReadReceiptPlugin] Failed to fetch config during reinit:', err);
            return { visibilityThresholdMs: 2000 };
        });

        // Get current channel if none provided
        if (!channelId) {
            channelId = globalMattermostStore.getState()?.entities?.channels?.currentChannelId;
        }

        if (channelId) {
            await Promise.all([
                loadInitialReceipts(channelId, pluginGlobalStoreInstance.dispatch, false).catch(err => {
                    console.error('❌ [ReadReceiptPlugin] Failed to reload receipts:', err);
                }),
                loadChannelReads(channelId, false).catch(err => {
                    console.error('❌ [ReadReceiptPlugin] Failed to reload channel reads:', err);
                })
            ]);
        }

    } catch (error) {
        console.error('[ReadReceiptPlugin] Reinitialization failed:', error);
    }
};

export default class ReadReceiptPlugin {
    async initialize(registry: PluginRegistry, mattermostStore: any) {
        // Store for reinitialization
        globalRegistry = registry;
        globalMattermostStore = mattermostStore;

        try {
            if (!mattermostStore?.getState) {
                console.error('[ReadReceiptPlugin] Invalid Mattermost store');
                throw new Error('Invalid Mattermost store provided');
            }

            // Initialize Redux store first and wait for it to complete
            await setMattermostStore(mattermostStore);
            // Ensure channel reads are loaded on channel switch (one-time, after store is ready)
            ensureChannelReadsOnSwitch(mattermostStore);

            // Only proceed if store is properly initialized
            if (!isStoreInitialized()) {
                throw new Error('Store failed to initialize properly');
            }

            // CRITICAL: Register WebSocket handlers FIRST before any data loading
            // This ensures we don't miss any events during initialization
            try {
                const wsHandler = handleWebSocketEvent(pluginGlobalStoreInstance.dispatch);

                // Create a comprehensive event handler that logs and processes events
                const comprehensiveHandler = (event: any) => {
                    // Always call the actual handler
                    return wsHandler(event);
                };

                if (typeof registry.registerWebSocketEventHandler === 'function') {
                    // Register handlers for custom events
                    registry.registerWebSocketEventHandler(WEBSOCKET_EVENT_READ_RECEIPT, comprehensiveHandler);
                    registry.registerWebSocketEventHandler(WEBSOCKET_EVENT_CHANNEL_READERS, comprehensiveHandler);
                } else {
                    console.error('❌ [ReadReceiptPlugin] registerWebSocketEventHandler not available on registry');
                }
            } catch (error) {
                console.error('❌ [ReadReceiptPlugin] Failed to register WebSocket handlers:', error);
            }

            // Pre-load initial data to populate Redux store
            const state = mattermostStore.getState();
            const currentChannelId = state?.entities?.channels?.currentChannelId;

            // Initialize WebSocket and fetch plugin configuration in parallel
            const [config] = await Promise.all([
                fetchPluginConfig().catch(err => {
                    console.error('❌ [ReadReceiptPlugin] Failed to fetch config:', err);
                    return { visibilityThresholdMs: 2000 };
                })
            ]);

            // Pre-load receipts for current channel if available
            if (currentChannelId) {
                await Promise.all([
                    loadInitialReceipts(currentChannelId, pluginGlobalStoreInstance.dispatch, true).catch(err => {
                        console.error('❌ [ReadReceiptPlugin] Failed to load receipts:', err);
                    }),
                    loadChannelReads(currentChannelId, true).catch(err => {
                        console.error('❌ [ReadReceiptPlugin] Failed to load channel reads:', err);
                    })
                ]);
            }

            // Register post component with error boundary
            try {
                if ((registry as any).registerPostTypeComponent) {
                    (registry as any).registerPostTypeComponent(
                        (props: PostProps) => {
                            if (!pluginGlobalStoreInstance) {
                                console.error("CRITICAL: pluginGlobalStoreInstance is null/undefined for PostReceipt Provider!");
                                return null;
                            }
                            if (!props?.post?.id || props.post.type !== '') {
                                return null;
                            }
                            return (
                                <ErrorBoundary>
                                    <Provider store={pluginGlobalStoreInstance}>
                                        <PostReceipt post={props.post} />
                                    </Provider>
                                </ErrorBoundary>
                            );
                        }
                    );
                }
            } catch (error) {
                console.error('❌ [ReadReceiptPlugin] Error in registerPostTypeComponent:', error);
            }

            // Register wrapped root component
            registry.registerRootComponent(() => {
                if (!pluginGlobalStoreInstance) {
                    console.error("CRITICAL: pluginGlobalStoreInstance is null/undefined for RootObserver Provider!");
                    return null;
                }
                return (
                    <ErrorBoundary>
                        <Provider store={pluginGlobalStoreInstance}>
                            <ReadReceiptRootObserver />
                        </Provider>
                    </ErrorBoundary>
                );
            });

            // CRITICAL FIX: Register a channel change listener to maintain state across navigation
            let lastChannelId = mattermostStore.getState()?.entities?.channels?.currentChannelId;

            const channelChangeUnsubscribe = mattermostStore.subscribe(() => {
                const state = mattermostStore.getState();
                const currentChannelId = state?.entities?.channels?.currentChannelId;

                if (currentChannelId && currentChannelId !== lastChannelId) {
                    debugLog('Channel change:', lastChannelId, '->', currentChannelId);
                    lastChannelId = currentChannelId;

                    // Reload plugin data for the new channel
                    setTimeout(async () => {
                        try {
                            const result = await (pluginGlobalStoreInstance.dispatch as any)(
                                loadChannelReaders({ channelId: currentChannelId })
                            );

                            // Inject receipts directly into DOM as workaround for React re-render issues
                            const payload = result?.payload;
                            if (payload && typeof payload === 'object' && Object.keys(payload).length > 0) {
                                injectReceiptsIntoDOM(payload, currentChannelId);
                                // Also set up visibility tracking for messages by others
                                setupVisibilityTracking(currentChannelId, payload);
                            }
                        } catch (error) {
                            console.error('[ReadReceiptPlugin] Failed to reload:', error);
                        }
                    }, 200);
                }
            });

            // Store unsubscribe function for cleanup
            (window as any).__readReceiptsChannelUnsubscribe = channelChangeUnsubscribe;
        } catch (error) {
            console.error('[ReadReceiptPlugin] Critical initialization error:', error);
            throw error;
        }
    }
}

// Register plugin
if (window.registerPlugin) {
    window.registerPlugin('mattermost-readreceipts', new ReadReceiptPlugin());
}
