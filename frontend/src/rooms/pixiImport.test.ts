import { describe, expect, it, vi } from "vitest";

describe("PixiRoomCanvas module import", () => {
  it("does not touch canvas rendering APIs during module import in jsdom", async () => {
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext");

    const module = await import("./PixiRoomCanvas");

    expect(module.PixiRoomCanvas).toBeTypeOf("function");
    expect(getContextSpy).not.toHaveBeenCalled();
  });
});
