import { describe, expect, test } from "vitest";
import { loadInjectedAppProps } from "./testHarness";

describe("loadInjectedAppProps", () => {
  test("returns injected app props from the browser global", () => {
    const bootstrapSession = async () => ({ status: "anonymous" } as const);
    const browserWindow = {
      __SOCIAL_LOBBY_APP_PROPS__: {
        bootstrapSession,
        initialPathname: "/rooms/main-lobby"
      }
    } as Window & typeof globalThis;

    const props = loadInjectedAppProps(browserWindow);

    expect(props.bootstrapSession).toBe(bootstrapSession);
    expect(props.initialPathname).toBe("/rooms/main-lobby");
  });

  test("falls back to an empty object when no overrides are provided", () => {
    expect(loadInjectedAppProps({} as Window & typeof globalThis)).toEqual({});
  });
});
