import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Native Android shell for Veltrix Hom.
 *
 * The web build in dist/ runs inside a native WebView — not a TWA. That
 * distinction matters: a TWA is Chrome in a costume and can only use web APIs.
 * This gives real native camera, filesystem, haptics, keyboard control and,
 * critically, native Google Sign-In (no browser redirect dance).
 */
const config: CapacitorConfig = {
  appId: 'uz.veltrix.hom',
  appName: 'Veltrix Hom',
  webDir: 'dist',

  android: {
    // Uzbek students are mostly on mid-range Android. Keep the WebView lean.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#080B12',
  },

  plugins: {
    SplashScreen: {
      // The real entry moment is Veltrix Ignition, rendered by the web layer.
      // The native splash only covers the WebView boot, so it must be brief
      // and visually identical — otherwise the user sees two splash screens.
      launchShowDuration: 400,
      launchAutoHide: true,
      backgroundColor: '#060810',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#080B12',
      overlaysWebView: false,
    },
    Keyboard: {
      // The composer must never be covered by the keyboard.
      resize: 'native',
      resizeOnFullScreen: true,
    },
    SocialLogin: {
      // Filled from GOOGLE_WEB_CLIENT_ID at build time (see README).
      google: { webClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? '' },
    },
  },
}

export default config
