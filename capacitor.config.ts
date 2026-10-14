import type { CapacitorConfig } from '@capacitor/cli';

/** The iPhone app: the business app from `npm run build:app`, talking to the live site's API. */
const config: CapacitorConfig = {
  appId: 'il.co.tornu.app',
  appName: 'תורנו',
  webDir: 'dist',
  backgroundColor: '#F6F6F4',
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: { launchAutoHide: false, backgroundColor: '#F6F6F4', showSpinner: false },
    StatusBar: { style: 'LIGHT', overlaysWebView: true },
  },
};

export default config;
