export {}

declare global {
  interface Window {
    readonly ounDesktop?: {
      readonly proxyUrl: string
    }
  }
}
