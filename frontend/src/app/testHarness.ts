import type { AppProps } from "./App";

declare global {
  interface Window {
    __SOCIAL_LOBBY_APP_PROPS__?: Partial<AppProps>;
  }
}

export function loadInjectedAppProps(browserWindow: Window & typeof globalThis = window): Partial<AppProps> {
  return browserWindow.__SOCIAL_LOBBY_APP_PROPS__ ?? {};
}
