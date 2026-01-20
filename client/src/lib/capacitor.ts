/**
 * Capacitor initialization utilities
 * Handles splash screen and other native features
 */

import { isMobileApp } from './config';

/**
 * Hide the splash screen when the app is ready
 * Call this after your app has finished initial loading
 */
export async function hideSplashScreen(): Promise<void> {
    if (!isMobileApp()) return;

    try {
        // Dynamically import to avoid issues on web
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide({
            fadeOutDuration: 500,
        });
    } catch (error) {
        // Silently fail on web or if plugin not available
        console.debug('SplashScreen.hide() not available:', error);
    }
}

/**
 * Show the splash screen (useful for app state transitions)
 */
export async function showSplashScreen(): Promise<void> {
    if (!isMobileApp()) return;

    try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.show({
            autoHide: false,
        });
    } catch (error) {
        console.debug('SplashScreen.show() not available:', error);
    }
}
