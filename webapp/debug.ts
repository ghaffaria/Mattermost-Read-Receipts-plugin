// Debug utility for Read Receipts plugin
// Enable debug logging by running in browser console:
//   window.__DEBUG_RR__ = { verbose: true }
// Or for specific categories:
//   window.__DEBUG_RR__ = { store: true, visibility: true }

declare global {
    interface Window {
        __DEBUG_RR__?: {
            verbose?: boolean;
            store?: boolean;
            visibility?: boolean;
            websocket?: boolean;
            observer?: boolean;
            injection?: boolean;
        };
    }
}

type DebugCategory = 'store' | 'visibility' | 'websocket' | 'observer' | 'injection';

const isDebugEnabled = (category?: DebugCategory): boolean => {
    const debug = window.__DEBUG_RR__;
    if (!debug) return false;
    if (debug.verbose) return true;
    if (category && debug[category]) return true;
    return false;
};

export const debugLog = (category: DebugCategory, prefix: string, ...args: any[]) => {
    if (isDebugEnabled(category)) {
        console.log(`${prefix}`, ...args);
    }
};

export const debugError = (prefix: string, ...args: any[]) => {
    // Errors are always logged
    console.error(`${prefix}`, ...args);
};

// Shorthand functions for each category
export const storeLog = (prefix: string, ...args: any[]) => debugLog('store', prefix, ...args);
export const visibilityLog = (prefix: string, ...args: any[]) => debugLog('visibility', prefix, ...args);
export const websocketLog = (prefix: string, ...args: any[]) => debugLog('websocket', prefix, ...args);
export const observerLog = (prefix: string, ...args: any[]) => debugLog('observer', prefix, ...args);
export const injectionLog = (prefix: string, ...args: any[]) => debugLog('injection', prefix, ...args);
