import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Keyboard } from '@capacitor/keyboard'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Network } from '@capacitor/network'
import { Share } from '@capacitor/share'
import { supabase } from '@/lib/supabase'

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() // 'android' | 'ios' | 'web'

/**
 * Wires the WebView into the OS. Called once from App on mount.
 * Returns a cleanup function.
 */
export async function initNative(handlers: {
  onBack: () => boolean // return true if the app handled it, false to exit
  onNetworkChange: (online: boolean) => void
  onTheme: (theme: 'dark' | 'light') => void
}): Promise<() => void> {
  if (!isNative) {
    const onOnline = () => handlers.onNetworkChange(true)
    const onOffline = () => handlers.onNetworkChange(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }

  await StatusBar.setStyle({ style: Style.Dark })
  await StatusBar.setBackgroundColor({ color: '#080B12' })

  // The composer must sit above the keyboard, not behind it.
  await Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {})
  const kbShow = await Keyboard.addListener('keyboardWillShow', (info) => {
    document.documentElement.style.setProperty('--keyboard-h', `${info.keyboardHeight}px`)
  })
  const kbHide = await Keyboard.addListener('keyboardWillHide', () => {
    document.documentElement.style.setProperty('--keyboard-h', '0px')
  })

  // Android hardware back button: navigate within the app, exit only at root.
  const back = await CapApp.addListener('backButton', () => {
    if (!handlers.onBack()) void CapApp.exitApp()
  })

  // Deep link for the email-confirmation flow (uz.veltrix.hom://auth/callback).
  const deepLink = await CapApp.addListener('appUrlOpen', ({ url }) => {
    const hash = url.split('#')[1]
    if (!hash) return
    const params = new URLSearchParams(hash)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')
    if (access_token && refresh_token) {
      void supabase.auth.setSession({ access_token, refresh_token })
    }
  })

  const status = await Network.getStatus()
  handlers.onNetworkChange(status.connected)
  const net = await Network.addListener('networkStatusChange', (s) =>
    handlers.onNetworkChange(s.connected)
  )

  // Refresh the session whenever the app returns to the foreground.
  const resume = await CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void supabase.auth.getSession()
  })

  return () => {
    void kbShow.remove(); void kbHide.remove(); void back.remove()
    void deepLink.remove(); void net.remove(); void resume.remove()
  }
}

/** Snap & Solve: native camera, downscaled on device before upload. */
export async function capturePhoto(source: 'camera' | 'gallery' = 'camera') {
  const photo = await Camera.getPhoto({
    quality: 82,
    allowEditing: true,
    resultType: CameraResultType.Base64,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    width: 1600, // spec: compress client-side to max 1600px
    correctOrientation: true,
    promptLabelHeader: 'Vazifani suratga oling',
    promptLabelPhoto: '🖼 Galereyadan tanlash',
    promptLabelPicture: '📷 Rasmga olish',
    promptLabelCancel: 'Bekor qilish',
  })
  return { data: photo.base64String ?? '', mimeType: `image/${photo.format}` }
}

/** Set from settings so the toggle genuinely turns haptics off. */
let hapticsOn = true
export function setHapticsEnabled(on: boolean) { hapticsOn = on }

export async function tap(style: 'light' | 'medium' = 'light') {
  if (!hapticsOn) return
  if (!isNative) return
  await Haptics.impact({
    style: style === 'light' ? ImpactStyle.Light : ImpactStyle.Medium,
  }).catch(() => {})
}

export async function shareAnswer(title: string, text: string) {
  if (isNative) {
    await Share.share({ title, text, dialogTitle: 'Javobni ulashish' })
    return
  }
  if (navigator.share) await navigator.share({ title, text })
  else await navigator.clipboard.writeText(text)
}


/** Register a single Android hardware-back handler without wiring the rest of native boot. */
export async function registerBackButton(handler: () => void): Promise<() => void> {
  if (!isNative) return () => {}
  const listener = await CapApp.addListener('backButton', handler)
  return () => { void listener.remove() }
}

export async function exitNativeApp(): Promise<void> {
  if (isNative) await CapApp.exitApp()
}
