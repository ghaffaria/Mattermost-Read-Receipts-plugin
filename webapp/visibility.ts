// Visibility alone can remain true in an unfocused/minimized desktop webview.
export function hasReadAttention(doc: Pick<Document, 'visibilityState' | 'hasFocus'>): boolean {
    return doc.visibilityState === 'visible' && doc.hasFocus();
}

// Pure continuous-visibility clock shared by every post and renderer.
export class VisibilityClock {
    private starts = new Map<string, number>();
    update(id: string, visible: boolean, now: number): void {
        if (!visible) this.starts.delete(id);
        else if (!this.starts.has(id)) this.starts.set(id, now);
    }
    due(id: string, now: number, threshold: number): boolean {
        const start = this.starts.get(id);
        return start !== undefined && now - start >= threshold;
    }
    keep(ids: Set<string>): void {
        for (const id of this.starts.keys()) if (!ids.has(id)) this.starts.delete(id);
    }
    clear(): void { this.starts.clear(); }
}

export function mergeReaders(previous: string[] = [], incoming: string[] = []): string[] {
    return [...new Set([...previous, ...incoming])].sort();
}
