// Copyright 2026 Alireza Ghaffari
// SPDX-License-Identifier: MPL-2.0

// Ordinary channel posts and both thread layouts use different container IDs.
// Always resolve the resulting ID through Mattermost's post store.
export function postIdFromElement(id: string): string | undefined {
    return /^(?:post_|rhsPost_)(.+)$/.exec(id)?.[1];
}

interface Clip {rect: DOMRect; x: boolean; y: boolean}

// A fresh snapshot for one scan, shared by main and thread copies of a post.
export class PostViewport {
    private clips = new Map<Element, Clip>();

    constructor(private doc: Document, private view: Window) {}

    isVisible(node: HTMLElement): boolean {
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        let left = 0; let top = 0;
        let right = this.view.innerWidth; let bottom = this.view.innerHeight;
        for (let parent = node.parentElement; parent; parent = parent.parentElement) {
            let clip = this.clips.get(parent);
            if (!clip) {
                const style = this.view.getComputedStyle(parent);
                clip = {rect: parent.getBoundingClientRect(),
                    x: /^(auto|scroll|hidden|clip)$/.test(style.overflowX),
                    y: /^(auto|scroll|hidden|clip)$/.test(style.overflowY)};
                this.clips.set(parent, clip);
            }
            if (clip.x) {left = Math.max(left, clip.rect.left); right = Math.min(right, clip.rect.right);}
            if (clip.y) {top = Math.max(top, clip.rect.top); bottom = Math.min(bottom, clip.rect.bottom);}
        }
        const visibleLeft = Math.max(left, rect.left); const visibleRight = Math.min(right, rect.right);
        const visibleTop = Math.max(top, rect.top); const visibleBottom = Math.min(bottom, rect.bottom);
        if (right <= left || bottom <= top || visibleRight <= visibleLeft ||
            visibleBottom - visibleTop < Math.min(rect.height, bottom - top) * 0.5) return false;
        const hit = this.doc.elementFromPoint((visibleLeft + visibleRight) / 2, (visibleTop + visibleBottom) / 2);
        return !!hit && node.contains(hit);
    }
}
