import type { CapacitorConfig } from '@capacitor/cli';

/** The iPhone app: the business app from `npm run build:app`, talking to the live site's API. */
const config: CapacitorConfig = {
  appId: 'il.co.tornu.app',
  appName: 'תורנו',
  webDir: 'dist',
  backgroundColor: '#F6F6F4',
  ios: {
    contentInset: 'never',
    // Long-pressing a link shows no Safari preview.
    allowsLinkPreview: false,
  },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#F6F6F4', showSpinner: false },
    StatusBar: { overlaysWebView: true },
    // Shown even while the app is open (the bell updates too).
    PushNotifications: { presentationOptions: ['alert', 'sound', 'badge'] },
  },
};

export default config;
