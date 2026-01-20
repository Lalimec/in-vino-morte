import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lalimec.invinomorte',
  appName: 'In Vino Morte',
  webDir: 'out', // Next.js static export directory
  ios: {
    // iOS WebView settings
    allowsLinkPreview: false,
    scrollEnabled: true,
    contentInset: 'automatic',
  },
  android: {
    // Android WebView settings
    backgroundColor: '#0d0a0e', // Dark wine background color
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    SplashScreen: {
      // Duration to show splash screen (ms)
      launchShowDuration: 500,
      // Auto-hide after duration
      launchAutoHide: true,
      // Fade-out animation duration (ms)
      launchFadeOutDuration: 300,
      // Background color matches the app theme
      backgroundColor: '#0d0a0e',
      // Android specific
      androidScaleType: 'CENTER_CROP',
      // iOS specific
      showSpinner: false,
      // Use dark mode splash when system is in dark mode
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
