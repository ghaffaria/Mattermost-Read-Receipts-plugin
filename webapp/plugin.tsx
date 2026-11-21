// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

import {VisibilityClock, mergeReaders, hasReadAttention} from './visibility';
import {PostViewport, postIdFromElement} from './post_view';

export interface Post {
    id: string;
    channel_id: string;
    user_id: string;
    delete_at?: number;
    type?: string;
}
interface State {
    entities: {
        users: {currentUserId: string; profiles: Record<string, Profile>};
        channels: {currentChannelId: string};
        posts: {posts: Record<string, Post>};
    };
}
interface Profile {username?: string; nickname?: string; first_name?: string; last_name?: string}
interface Store {getState(): State; subscribe(callback: () => void): () => void}
interface Registry {
    registerWebSocketEventHandler(name: string, callback: (event: any) => void): void;
    unregisterWebSocketEventHandler?(name: string): void;
    registerReconnectHandler?(callback: () => void): void;
    unregisterReconnectHandler?(): void;
}
interface Config {enable: boolean; visibility_threshold_ms: number}
interface Receipt {MessageID: string; UserID: string; ChannelID: string}
const base = '/plugins/mattermost-readreceipts/api/v1';
const receiptEvent = 'custom_mattermost-readreceipts_read_receipt';
const channelEvent = 'custom_mattermost-readreceipts_channel_readers';

// The only DOM adapter. It handles ordinary posts without overriding their
// Mattermost type or depending on window.store, ReactDOM, Redux or localStorage.
export default class ReadReceipts {
    private store!: Store;
    private registry!: Registry;
    private observer?: MutationObserver;
    private interval?: ReturnType<typeof setInterval>;
    private unsubscribe?: () => void;
    private scanTimer?: ReturnType<typeof setTimeout>;
    private active = false;
    private config: Config = {enable: true, visibility_threshold_ms: 2000};
    private clock = new VisibilityClock();
    private readers = new Map<string, string[]>();
    private sent = new Set<string>();
    private pending = new Set<string>();
    private retries = new Map<string, {at: number; attempts: number}>();
    private hydrated = new Set<string>();
    private loading = new Set<string>();
    private abort = new AbortController();
    private identity = '';
    private channel = '';
    private generation = 0;
    private lastHydrate = 0;
    private lastConfig = 0;
    private configLoading = false;
    private lastState: any;
    private permissionDenied = new Set<string>();

    async initialize(registry: Registry, store: Store): Promise<void> {
        if (this.active) this.uninitialize();
        this.abort = new AbortController();
        this.store = store;
        this.registry = registry;
        this.active = true;
        registry.registerWebSocketEventHandler(receiptEvent, this.onReceipt);
        registry.registerWebSocketEventHandler(channelEvent, this.onReceipt);
        registry.registerReconnectHandler?.(this.onReconnect);
        if (store.getState()?.entities?.users?.currentUserId) await this.loadConfig();
        else this.config.enable = false;
        if (!this.active) return;
        this.observer = new MutationObserver(this.schedule);
        this.observer.observe(document.body, {childList: true, subtree: true});
        document.addEventListener('scroll', this.schedule, true);
        document.addEventListener('visibilitychange', this.onVisibility);
        window.addEventListener('focus', this.onVisibility);
        window.addEventListener('blur', this.onVisibility);
        window.addEventListener('resize', this.schedule);
        this.unsubscribe = store.subscribe(() => {
            const next = store.getState().entities;
            if (next !== this.lastState) {this.lastState = next; this.schedule();}
        });
        this.interval = setInterval(() => this.scan(), 200);
        this.scan();
    }

    private key(post: Post): string {return post.channel_id + ':' + post.id;}
    private schedule = (): void => {
        if (!this.active || this.scanTimer) return;
        this.scanTimer = setTimeout(() => {this.scanTimer = undefined; this.scan();}, 80);
    };
    private onVisibility = (): void => {
        // Reset synchronously: even a short blur/hidden interval breaks dwell.
        this.clock.clear();
        this.schedule();
    };
    private onReconnect = (): void => {
        this.hydrated.clear();
        this.permissionDenied.clear();
        this.lastHydrate = 0;
        this.schedule();
    };
    private onReceipt = (event: any): void => {
        const data = event?.data;
        if (!this.active || !data) return;
        const id = data.MessageID || data.LastPostID;
        const channel = data.ChannelID;
        const ids: string[] = data.ReaderIDs || data.UserIDs || (data.UserID ? [data.UserID] : []);
        if (!id || !channel || !Array.isArray(ids)) return;
        const key = channel + ':' + id;
        this.readers.set(key, mergeReaders(this.readers.get(key), ids));
        this.schedule();
    };

    private async loadConfig(): Promise<void> {
        if (this.configLoading) return;
        this.configLoading = true;
        this.lastConfig = Date.now();
        try {
            const response = await fetch(base + '/config', {credentials: 'same-origin', cache: 'no-store', signal: this.abort.signal});
            if (!response.ok) throw new Error('configuration unavailable');
            const config = await response.json();
            const threshold = config.visibility_threshold_ms;
            const previous = this.config;
            this.config = {
                enable: config.enable === true,
                visibility_threshold_ms: typeof threshold === 'number' && threshold >= 0 ? threshold : 2000,
            };
            if (previous.enable !== this.config.enable || previous.visibility_threshold_ms !== this.config.visibility_threshold_ms) this.clock.clear();
        } catch (error) {
            // Fail closed: no fabricated receipt while authorization/config is unknown.
            this.config.enable = false;
            this.clock.clear();
            if (this.active && !this.abort.signal.aborted) console.warn('[Read Receipts] Configuration temporarily unavailable');
        } finally {this.configLoading = false;}
    }

    private scan(): void {
        if (!this.active) return;
        const state = this.store.getState();
        const entities = state?.entities;
        const user = entities?.users?.currentUserId || '';
        const channel = entities?.channels?.currentChannelId || '';
        if (user !== this.identity) {
            this.identity = user;
            this.readers.clear(); this.sent.clear(); this.pending.clear();
            this.retries.clear(); this.hydrated.clear(); this.loading.clear(); this.permissionDenied.clear();
            this.clock.clear(); this.generation++;
            document.querySelectorAll('.rr-receipt').forEach(node => node.remove());
            this.lastConfig = 0;
        }
        if (channel !== this.channel) {
            this.channel = channel; this.clock.clear();
        }
        const now = Date.now();
        if (user && now - this.lastConfig > 10000) void this.loadConfig();
        if (!user || !this.config.enable) {
            this.clock.clear();
            document.querySelectorAll('.rr-receipt').forEach(node => node.remove());
            return;
        }
        const attention = hasReadAttention(document);
        if (!attention) this.clock.clear();
        const posts = entities.posts?.posts || {};
        const views = new Map<string, {post: Post; nodes: HTMLElement[]}>();
        document.querySelectorAll<HTMLElement>('[id^="post_"], [id^="rhsPost_"]').forEach(node => {
            const id = postIdFromElement(node.id);
            const post = id ? posts[id] : undefined;
            if (!post || !post.channel_id || post.delete_at || post.type?.startsWith('system_')) return;
            // The sidebar can show a different channel; the global Threads
            // route may have no selected channel. Trust the actual post's
            // channel, never the selected channel or a guessed DOM suffix.
            if (!node.id.startsWith('rhsPost_') && post.channel_id !== channel) return;
            const key = this.key(post);
            const existing = views.get(key);
            if (existing) existing.nodes.push(node);
            else views.set(key, {post, nodes: [node]});
        });
        const viewport = new PostViewport(document, window);
        const visibleKeys = new Set<string>();
        const byChannel = new Map<string, string[]>();
        for (const [key, {post, nodes}] of views) {
            const ids = byChannel.get(post.channel_id) || [];
            ids.push(post.id); byChannel.set(post.channel_id, ids);
            if (post.user_id === user) {
                // Render every copy (main + RHS), even while the author is
                // unfocused. Rendering and hydration never imply a read.
                nodes.forEach(node => this.render(node, post, user, entities.users.profiles || {}));
                continue;
            }
            if (this.sent.has(key) || this.readers.get(key)?.includes(user)) continue;
            // One continuous clock per message. A hidden duplicate cannot
            // cancel a visible copy, or cause the same receipt to be sent twice.
            const visible = attention && nodes.some(node => viewport.isVisible(node));
            this.clock.update(key, visible, now);
            if (visible) visibleKeys.add(key);
            if (visible && this.clock.due(key, now, this.config.visibility_threshold_ms) &&
                !this.pending.has(key) && (this.retries.get(key)?.at || 0) <= now) {
                void this.send(post, user, this.generation);
            }
        }
        this.clock.keep(visibleKeys);
        // Hydrate exactly the loaded posts. Recovery polling also repairs a
        // missed WebSocket event; it never implies that older posts were seen.
        if (now - this.lastHydrate > 15000) {this.hydrated.clear(); this.lastHydrate = now;}
        for (const [postChannel, ids] of byChannel) {
            const missing = ids.filter(id => !this.hydrated.has(postChannel + ':' + id));
            if (missing.length && !this.loading.has(postChannel) && !this.permissionDenied.has(postChannel)) {
                void this.hydrate(postChannel, missing.slice(0, 200), this.generation);
            }
        }
    }

    private async hydrate(channel: string, ids: string[], generation: number): Promise<void> {
        this.loading.add(channel);
        try {
            const query = new URLSearchParams({channel_id: channel, post_ids: ids.join(',')});
            const response = await fetch(base + '/receipts?' + query.toString(), {
                credentials: 'same-origin', cache: 'no-store', signal: this.abort.signal,
            });
            if (!response.ok) {
                if (response.status === 403) this.permissionDenied.add(channel);
                throw new Error('receipt fetch failed');
            }
            const events: Receipt[] = (await response.json()) || [];
            if (!this.active || generation !== this.generation) return;
            for (const event of events) {
                if (event.ChannelID !== channel) continue;
                const key = channel + ':' + event.MessageID;
                this.readers.set(key, mergeReaders(this.readers.get(key), [event.UserID]));
            }
            ids.forEach(id => this.hydrated.add(channel + ':' + id));
            this.schedule();
        } catch (error) {
            // Retry on the periodic recovery cycle, without a tight error loop.
            ids.forEach(id => this.hydrated.add(channel + ':' + id));
        } finally {this.loading.delete(channel);}
    }

    private async send(post: Post, user: string, generation: number): Promise<void> {
        const key = this.key(post);
        if (!this.active || generation !== this.generation || user !== this.identity || !hasReadAttention(document)) {
            this.clock.update(key, false, Date.now());
            return;
        }
        this.pending.add(key);
        try {
            const csrf = document.cookie.match(/(?:^|;\s*)MMCSRF=([^;]+)/)?.[1] || '';
            const response = await fetch(base + '/read', {
                method: 'POST', credentials: 'same-origin', signal: this.abort.signal,
                headers: {'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf)},
                body: JSON.stringify({message_id: post.id, channel_id: post.channel_id}),
            });
            if (!response.ok) throw new Error('receipt write failed: ' + response.status);
            if (!this.active || generation !== this.generation || user !== this.identity) return;
            this.sent.add(key); this.retries.delete(key);
            this.readers.set(key, mergeReaders(this.readers.get(key), [user]));
        } catch (error) {
            const attempts = (this.retries.get(key)?.attempts || 0) + 1;
            this.retries.set(key, {attempts, at: Date.now() + Math.min(30000, 1000 * Math.pow(2, attempts - 1))});
            // A retry requires a new continuous visible interval.
            this.clock.update(key, false, Date.now());
        } finally {this.pending.delete(key); this.schedule();}
    }

    private render(node: HTMLElement, post: Post, user: string, profiles: Record<string, Profile>): void {
        const ids = (this.readers.get(this.key(post)) || []).filter(id => id !== user);
        let indicator = node.querySelector<HTMLElement>('.rr-receipt');
        if (!ids.length) {indicator?.remove(); return;}
        const body = node.querySelector('.post-message__text-container, .post-message__text, .post__body');
        if (!body) return;
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'rr-receipt';
            indicator.style.cssText = 'font-size:11px;color:var(--center-channel-color);opacity:.72;padding:3px 0;line-height:1.5;overflow-wrap:anywhere;';
            body.insertAdjacentElement('afterend', indicator);
        }
        indicator.dataset.postId = post.id;
        const names = ids.map(id => {
            const profile = profiles[id];
            return profile?.nickname || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
                profile?.username || id.slice(0, 8);
        });
        const text = '✓✓ Seen by ' + names.join(', ');
        if (indicator.textContent !== text) {
            indicator.textContent = text;
            indicator.setAttribute('aria-label', text);
        }
    }

    uninitialize(): void {
        this.active = false; this.generation++;
        this.abort.abort(); this.observer?.disconnect(); this.unsubscribe?.();
        if (this.interval) clearInterval(this.interval);
        if (this.scanTimer) clearTimeout(this.scanTimer);
        document.removeEventListener('scroll', this.schedule, true);
        document.removeEventListener('visibilitychange', this.onVisibility);
        window.removeEventListener('focus', this.onVisibility);
        window.removeEventListener('blur', this.onVisibility);
        window.removeEventListener('resize', this.schedule);
        this.registry?.unregisterWebSocketEventHandler?.(receiptEvent);
        this.registry?.unregisterWebSocketEventHandler?.(channelEvent);
        this.registry?.unregisterReconnectHandler?.();
        document.querySelectorAll('.rr-receipt').forEach(node => node.remove());
        this.clock.clear(); this.readers.clear(); this.sent.clear(); this.pending.clear();
    }
}
declare global {interface Window {registerPlugin(id: string, plugin: ReadReceipts): void}}
if (typeof window !== 'undefined' && window.registerPlugin) window.registerPlugin('mattermost-readreceipts', new ReadReceipts());
