// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

const {test} = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture({channel = 'channel-a', user = 'viewer', focused = true} = {}) {
    let now = 0;
    const nodes = [], requests = [], history = [];
    const state = {entities: {users: {currentUserId: user, profiles: {reader: {username: 'reader'}}},
        channels: {currentChannelId: channel}, posts: {posts: {}}}};
    const events = () => ({listeners: new Map(), addEventListener(name, fn) {this.listeners.set(name, fn);},
        removeEventListener(name, fn) {if (this.listeners.get(name) === fn) this.listeners.delete(name);}});
    const bounds = (left, top, width, height) => ({left, top, width, height, right: left + width, bottom: top + height});
    const panel = {parentElement: null, getBoundingClientRect: () => bounds(0, 100, 1200, 600)};
    const win = {...events(), innerWidth: 1200, innerHeight: 800,
        getComputedStyle: () => ({overflowX: 'hidden', overflowY: 'auto'})};
    const doc = {...events(), body: {}, visibilityState: 'visible', focused,
        hasFocus() {return this.focused;},
        querySelectorAll(selector) {
            if (selector === '.rr-receipt') return nodes.flatMap(n => n.indicator ? [n.indicator] : []);
            return nodes.filter(n => (selector.includes('[id^="post_"]') && n.id.startsWith('post_')) ||
                (selector.includes('[id^="rhsPost_"]') && n.id.startsWith('rhsPost_')));
        },
        elementFromPoint(x, y) {
            return [...nodes].reverse().find(n => !n.covered && n.rect.width > 0 && n.rect.height > 0 &&
                x >= n.rect.left && x < n.rect.right && y >= n.rect.top && y < n.rect.bottom) || null;
        },
        createElement() {return {className: '', dataset: {}, style: {}, textContent: '', setAttribute() {}, remove() {
            nodes.forEach(n => {if (n.indicator === this) n.indicator = undefined;});
        }};}, cookie: ''};
    function add(id, {thread = false, author = 'author', postChannel = channel || 'channel-b', left = 0, top = 150, width = 400, height = 100} = {}) {
        const post = {id, channel_id: postChannel, user_id: author};
        state.entities.posts.posts[id] = post;
        const node = {id: (thread ? 'rhsPost_' : 'post_') + id, parentElement: panel,
            rect: bounds(left, top, width, height), indicator: undefined,
            getBoundingClientRect() {return this.rect;}, contains(hit) {return hit === this;},
            closest() {return this.parentElement;},
            querySelector(selector) {return selector === '.rr-receipt' ? this.indicator : {
                insertAdjacentElement: (_, indicator) => {this.indicator = indicator;}};}};
        nodes.push(node); return {node, post};
    }
    const globals = {document: doc, window: win, Map, Set, URLSearchParams, AbortController,
        Date: class extends Date {static now() {return now;}}, console,
        MutationObserver: class {observe() {} disconnect() {}},
        setInterval: () => 1, clearInterval() {}, setTimeout: () => 2, clearTimeout() {},
        fetch: async (url, options = {}) => {
            requests.push({url, ...options});
            let data = {};
            if (url.endsWith('/config')) data = {enable: true, visibility_threshold_ms: 2000};
            else if (url.includes('/receipts?')) {
                const params = new URLSearchParams(url.split('?')[1]);
                data = history.filter(r => r.ChannelID === params.get('channel_id') && params.get('post_ids').split(',').includes(r.MessageID));
            }
            return {ok: true, status: 200, json: async () => data};
        }};
    const modules = new Map();
    function load(name) {
        if (modules.has(name)) return modules.get(name).exports;
        const mod = {exports: {}}; modules.set(name, mod);
        const source = fs.readFileSync(path.join(__dirname, '..', name + (name === 'plugin' ? '.tsx' : '.ts')), 'utf8');
        vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019}}).outputText,
            {...globals, exports: mod.exports, module: mod, require: n => load(n.replace('./', ''))});
        return mod.exports;
    }
    const Plugin = load('plugin').default;
    const plugin = new Plugin();
    const registry = {registerWebSocketEventHandler() {}, registerReconnectHandler() {}, unregisterWebSocketEventHandler() {}, unregisterReconnectHandler() {}};
    const flush = async () => {for (let i = 0; i < 8; i++) await Promise.resolve();};
    return {state, doc, win, add, history, plugin,
        writes: () => requests.filter(r => r.method === 'POST').map(r => JSON.parse(r.body)),
        gets: () => requests.filter(r => r.url.includes('/receipts?')).map(r => new URLSearchParams(r.url.split('?')[1])),
        start: async () => {await plugin.initialize(registry, {getState: () => state, subscribe: () => () => {}}); await flush();},
        tick: async time => {now = time; plugin.scan(); await flush();},
        focus: value => {doc.focused = value; win.listeners.get(value ? 'focus' : 'blur')?.();}};
}

test('a desktop document reporting visible while unfocused never writes a receipt', async () => {
    const f = fixture({focused: false}); f.add('incoming'); await f.start();
    await f.tick(3000); assert.deepEqual(f.writes(), []);
    f.focus(true); await f.tick(3000); await f.tick(4999); assert.deepEqual(f.writes(), []);
    await f.tick(5000); assert.deepEqual(f.writes(), [{message_id: 'incoming', channel_id: 'channel-a'}]);
});

test('blur and regain focus between scans discard partial dwell', async () => {
    const f = fixture(); f.add('incoming'); await f.start(); await f.tick(1500);
    f.focus(false); f.focus(true); await f.tick(1500); await f.tick(2000);
    assert.deepEqual(f.writes(), []); await f.tick(3500); assert.equal(f.writes().length, 1);
});

test('global Threads works with no selected channel and uses the actual reply channel', async () => {
    const f = fixture({channel: ''}); f.add('reply', {thread: true, postChannel: 'thread-channel'});
    await f.start(); await f.tick(2000);
    assert.deepEqual(f.writes(), [{message_id: 'reply', channel_id: 'thread-channel'}]);
    assert.ok(f.gets().some(p => p.get('channel_id') === 'thread-channel' && p.get('post_ids') === 'reply'));
});

test('main and sidebar posts hydrate their separate channels', async () => {
    const f = fixture({focused: false}); f.add('main'); f.add('reply', {thread: true, postChannel: 'channel-b'});
    await f.start(); assert.deepEqual(f.writes(), []);
    assert.deepEqual(f.gets().map(p => [p.get('channel_id'), p.get('post_ids')]).sort(),
        [['channel-a', 'main'], ['channel-b', 'reply']]);
});

test('a hidden main copy cannot cancel the visible sidebar copy or duplicate a write', async () => {
    const f = fixture(); f.add('same', {width: 0}); f.add('same', {thread: true, left: 700});
    await f.start(); await f.tick(2000); await f.tick(5000); assert.equal(f.writes().length, 1);
});

test('the author sees the same explicit receipt in every rendered copy while unfocused', async () => {
    const f = fixture({user: 'author', focused: false}); const a = f.add('same'); const b = f.add('same', {thread: true, left: 700});
    f.history.push({MessageID: 'same', ChannelID: 'channel-a', UserID: 'reader'});
    await f.start(); await f.tick(200);
    assert.ok(a.node.indicator, 'main copy must show the receipt');
    assert.ok(b.node.indicator, 'thread copy must show the receipt');
    assert.equal(a.node.indicator.textContent, '✓✓ Seen by reader');
    assert.equal(b.node.indicator.textContent, '✓✓ Seen by reader');
    assert.deepEqual(f.writes(), []);
});

test('a reply clipped outside its scroll panel waits for a fresh visible interval', async () => {
    const f = fixture(); const {node} = f.add('reply', {thread: true, top: 750});
    await f.start(); await f.tick(3000); assert.deepEqual(f.writes(), []);
    node.rect = {left: 0, right: 400, top: 150, bottom: 250, width: 400, height: 100};
    await f.tick(3000); await f.tick(4999); assert.deepEqual(f.writes(), []);
    await f.tick(5000); assert.equal(f.writes().length, 1);
});

test('teardown removes focus listeners and stops future reads', async () => {
    const f = fixture(); f.add('incoming'); await f.start(); f.plugin.uninitialize();
    assert.equal(f.win.listeners.has('blur'), false); assert.equal(f.win.listeners.has('focus'), false);
    await f.tick(5000); assert.deepEqual(f.writes(), []);
});
