import { Capacitor } from '@capacitor/core'

const ANDROID_PROXY_URL = 'http://127.0.0.1:8787/proxy?url='

export const isAndroidApp = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export const getProxyUrl = (desktopProxyUrl?: string): string => {
  if (isAndroidApp()) {
    return ANDROID_PROXY_URL
  }

  if (!desktopProxyUrl) {
    return '/proxy?url='
  }

  const origin = new URL(desktopProxyUrl).origin
  return `${origin}/proxy?url=`
}

export const getMediaUrl = (targetUrl: string): string => {
  if (
    !isAndroidApp() ||
    targetUrl.startsWith(ANDROID_PROXY_URL) ||
    !/^https?:\/\//i.test(targetUrl)
  ) {
    return targetUrl
  }
  return `${ANDROID_PROXY_URL}${encodeURIComponent(targetUrl)}`
}
