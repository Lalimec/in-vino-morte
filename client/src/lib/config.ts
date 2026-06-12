/**
 * Environment-based configuration for server URLs.
 * Handles web (dev/prod) and mobile (Capacitor) environments.
 */

// Detect if running in Capacitor (mobile app)
function isCapacitor(): boolean {
    if (typeof window === 'undefined') return false;
    // Capacitor injects this object
    return !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

// Detect if running in development
function isDevelopment(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

/**
 * Get the base HTTP URL for API calls.
 * - Development: http://localhost:3001
 * - Production web: '' (relative URLs, proxied by server)
 * - Mobile app: Uses NEXT_PUBLIC_API_URL environment variable
 */
export function getApiUrl(): string {
    if (typeof window === 'undefined') return '';

    // Mobile app - must use absolute URL
    if (isCapacitor()) {
        // Set this at build time via environment variable
        const mobileApiUrl = process.env.NEXT_PUBLIC_API_URL;
        console.log('[CONFIG] Mobile app detected, API URL:', mobileApiUrl);
        if (!mobileApiUrl) {
            console.error('NEXT_PUBLIC_API_URL not set for mobile build!');
            return '';
        }
        return mobileApiUrl;
    }

    // Web development
    if (isDevelopment()) {
        return 'http://localhost:3001';
    }

    // Web production - use relative URLs (proxied by IIS/nginx)
    return '';
}

/**
 * Get the WebSocket URL for real-time communication.
 * - Development: ws://localhost:3001
 * - Production web: Derived from current page URL
 * - Mobile app: Uses NEXT_PUBLIC_WS_URL environment variable
 */
export function getWebSocketUrl(): string {
    if (typeof window === 'undefined') {
        return 'ws://localhost:3001';
    }

    // Mobile app - must use absolute URL
    if (isCapacitor()) {
        const mobileWsUrl = process.env.NEXT_PUBLIC_WS_URL;
        if (!mobileWsUrl) {
            console.error('NEXT_PUBLIC_WS_URL not set for mobile build!');
            return 'ws://localhost:3001';
        }
        return mobileWsUrl;
    }

    // Web development
    if (isDevelopment()) {
        return 'ws://localhost:3001';
    }

    // Web production - derive from current page URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
}

/**
 * Check if running on a mobile device (Capacitor)
 */
export function isMobileApp(): boolean {
    return isCapacitor();
}

/**
 * Whether to render the lightweight static background instead of the WebGL
 * raymarch shader. The shader is far too GPU-heavy for phones (it raymarches
 * 100 steps per pixel every frame), causing jank, battery drain and thermal
 * throttling. We fall back to a static gradient on:
 *   - Capacitor native apps (iOS/Android),
 *   - touch / coarse-pointer browsers (phones, most tablets),
 *   - users who prefer reduced motion.
 *
 * Returns true on the server and the first client paint so we never flash the
 * heavy shader before we've detected the device.
 */
export function shouldUseStaticBackground(): boolean {
    if (typeof window === 'undefined') return true; // SSR: cheap, safe default
    if (isCapacitor()) return true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return true;
    if (window.matchMedia?.('(pointer: coarse)')?.matches) return true;
    return false;
}

/**
 * Get the current platform
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
    if (typeof window === 'undefined') return 'web';

    const capacitor = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (capacitor?.getPlatform) {
        const platform = capacitor.getPlatform();
        if (platform === 'ios') return 'ios';
        if (platform === 'android') return 'android';
    }
    return 'web';
}
