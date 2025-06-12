// webapp/plugin.tsx
import React from 'react';
// @ts-ignore
import {PluginRegistry} from 'mattermost-webapp/plugins/registry';
import PostReceipt from './components/PostReceipt';
import {handleWebSocketEvent} from './websocket';
import {loadInitialReceipts, fetchPluginConfig, loadChannelReads} from './store';
import { ensureChannelReadsOnSwitch } from './store/index';
import { store as pluginGlobalStoreInstance, setMattermostStore, isStoreInitialized } from './store/pluginStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import ReadReceiptRootObserver from './components/ReadReceiptRootObserver';
import { Provider } from 'react-redux';

import { Post } from './types/mattermost-webapp';

interface PostProps {
    post: Post;
}

// WebSocket event constants - must match server-side exactly
const WEBSOCKET_EVENT_READ_RECEIPT = 'custom_mattermost-readreceipts_read_receipt';
const WEBSOCKET_EVENT_CHANNEL_READERS = 'custom_mattermost-readreceipts_channel_readers';

// Global reference for manual reinitialization
let globalRegistry: PluginRegistry | null = null;
let globalMattermostStore: any = null;

export const reinitializeReadReceipts = async (channelId?: string) => {
    console.log('🔄 [ReadReceiptPlugin] Manual reinitialization requested:', {
        hasRegistry: !!globalRegistry,
        hasStore: !!globalMattermostStore,
        channelId,
        timestamp: new Date().toISOString()
    });

    if (!globalRegistry || !globalMattermostStore || !isStoreInitialized()) {
        console.error('❌ [ReadReceiptPlugin] Cannot reinitialize - missing required components');
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
            console.log('🔄 [ReadReceiptPlugin] Reloading channel data:', channelId);
            await Promise.all([
                loadInitialReceipts(channelId, pluginGlobalStoreInstance.dispatch, false).catch(err => {
                    console.error('❌ [ReadReceiptPlugin] Failed to reload receipts:', err);
                }),
                loadChannelReads(channelId, false).catch(err => {
                    console.error('❌ [ReadReceiptPlugin] Failed to reload channel reads:', err);
                })
            ]);
        }

        console.log('✅ [ReadReceiptPlugin] Manual reinitialization complete');
    } catch (error) {
        console.error('❌ [ReadReceiptPlugin] Reinitialization failed:', error);
    }
};

export default class ReadReceiptPlugin {
    async initialize(registry: PluginRegistry, mattermostStore: any) {
        // Store for reinitialization
        globalRegistry = registry;
        globalMattermostStore = mattermostStore;
        
        console.log('🔌 [ReadReceiptPlugin] Initializing...');
        
        try {
            if (!mattermostStore?.getState) {
                console.error('❌ [ReadReceiptPlugin] Invalid Mattermost store:', mattermostStore);
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
                console.log('🌐 [ReadReceiptPlugin] Registering WebSocket handlers...');
                
                const wsHandler = handleWebSocketEvent(pluginGlobalStoreInstance.dispatch);
                
                // Create a comprehensive event handler that logs and processes events
                const comprehensiveHandler = (event: any) => {
                    console.log('🔔 [ReadReceiptPlugin] WebSocket event received:', {
                        eventType: event?.event || 'unknown',
                        data: event?.data,
                        broadcast: event?.broadcast,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Always call the actual handler
                    return wsHandler(event);
                };
                
                if (typeof registry.registerWebSocketEventHandler === 'function') {
                    // Register handlers for custom events
                    console.log('📝 [ReadReceiptPlugin] Registering handler for:', WEBSOCKET_EVENT_READ_RECEIPT);
                    registry.registerWebSocketEventHandler(WEBSOCKET_EVENT_READ_RECEIPT, comprehensiveHandler);
                    
                    console.log('📝 [ReadReceiptPlugin] Registering handler for:', WEBSOCKET_EVENT_CHANNEL_READERS);
                    registry.registerWebSocketEventHandler(WEBSOCKET_EVENT_CHANNEL_READERS, comprehensiveHandler);
                    
                    console.log('✅ [ReadReceiptPlugin] WebSocket handlers registered successfully');
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
                console.log('📥 [ReadReceiptPlugin] Pre-loading receipts for channel (initial load):', currentChannelId);
                await Promise.all([
                    loadInitialReceipts(currentChannelId, pluginGlobalStoreInstance.dispatch, true).catch(err => {
                        console.error('❌ [ReadReceiptPlugin] Failed to load receipts:', err);
                    }),
                    loadChannelReads(currentChannelId, true).catch(err => {
                        console.error('❌ [ReadReceiptPlugin] Failed to load channel reads:', err);
                    })
                ]);
                console.log('✅ [ReadReceiptPlugin] Pre-loaded receipts successfully (no UI updates triggered)');
            }

            // Register post component with error boundary
            try {
                if ((registry as any).registerPostTypeComponent) {
                    console.log('🧩 [ReadReceiptPlugin] Registering post component...');
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
                    console.log('✅ [ReadReceiptPlugin] Post component registered');
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
            console.log('🔄 [ReadReceiptPlugin] Setting up channel change persistence...');
            
            let lastChannelId = mattermostStore.getState()?.entities?.channels?.currentChannelId;
            
            const channelChangeUnsubscribe = mattermostStore.subscribe(() => {
                const state = mattermostStore.getState();
                const currentChannelId = state?.entities?.channels?.currentChannelId;
                
                if (currentChannelId && currentChannelId !== lastChannelId) {
                    console.log('🔄 [ReadReceiptPlugin] Channel change detected:', {
                        from: lastChannelId,
                        to: currentChannelId,
                        timestamp: new Date().toISOString()
                    });
                    
                    lastChannelId = currentChannelId;
                    
                    // Reload plugin data for the new channel
                    setTimeout(async () => {
                        try {
                            console.log('📥 [ReadReceiptPlugin] Reloading data for channel:', currentChannelId);
                            await Promise.all([
                                loadInitialReceipts(currentChannelId, pluginGlobalStoreInstance.dispatch, false),
                                loadChannelReads(currentChannelId, false)
                            ]);
                            console.log('✅ [ReadReceiptPlugin] Channel data reloaded successfully');
                        } catch (error) {
                            console.error('❌ [ReadReceiptPlugin] Failed to reload channel data:', error);
                        }
                    }, 200); // Small delay to ensure DOM is ready
                }
            });
            
            // Store unsubscribe function for cleanup
            (window as any).__readReceiptsChannelUnsubscribe = channelChangeUnsubscribe;

            console.log('✅ [ReadReceiptPlugin] Initialization complete');
        } catch (error) {
            console.error('❌ [ReadReceiptPlugin] Critical initialization error:', error);
            throw error;
        }
    }
}

// Register plugin
if (window.registerPlugin) {
    window.registerPlugin('mattermost-readreceipts', new ReadReceiptPlugin());
}
