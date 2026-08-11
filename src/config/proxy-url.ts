export const getProxyUrl = (desktopProxyUrl?: string): string => {
  if (!desktopProxyUrl) {
    return '/proxy?url='
  }

  const origin = new URL(desktopProxyUrl).origin
  return `${origin}/proxy?url=`
}
