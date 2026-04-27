import { describe, expect, test } from "vitest";
import { buildServer } from "./server.js";
import { loadConfig } from "../config/config.js";

describe("server", () => {
  test("GET /healthz returns the existing health contract", async () => {
    const server = buildServer({ config: loadConfig({}) });

    const response = await server.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ status: "ok" });
  });

  test("POST /healthz is not allowed", async () => {
    const server = buildServer({ config: loadConfig({}) });

    const response = await server.inject({ method: "POST", url: "/healthz" });

    expect(response.statusCode).toBe(405);
  });
});
