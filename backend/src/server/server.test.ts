import { describe, expect, test, vi } from "vitest";
import { buildServer } from "./server.js";
import { loadConfig } from "../config/config.js";

describe("server", () => {
  test("GET /healthz returns the existing health contract", async () => {
    const server = buildServer({ config: loadConfig({}) });

    const response = await server.inject({ method: "GET", url: "api/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ status: "ok" });
  });

  test("POST /healthz is not allowed", async () => {
    const server = buildServer({ config: loadConfig({}) });

    const response = await server.inject({ method: "POST", url: "api/healthz" });

    expect(response.statusCode).toBe(405);
  });

  test("GET /readyz reports ready when dependencies are healthy", async () => {
    const server = buildServer({
      config: loadConfig({}),
      readinessCheck: async () => ({ ready: true })
    });

    const response = await server.inject({ method: "GET", url: "api/readyz" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ status: "ready" });
  });

  test("GET /readyz reports dependency failures", async () => {
    const server = buildServer({
      config: loadConfig({ DATABASE_URL: "postgres://social-lobby" }),
      readinessCheck: async () => ({
        ready: false,
        checks: {
          database: "unreachable"
        }
      })
    });

    const response = await server.inject({ method: "GET", url: "api/readyz" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: "not_ready",
      checks: {
        database: "unreachable"
      }
    });
  });

  test("GET /metrics exposes prometheus-style counters", async () => {
    const server = buildServer({ config: loadConfig({}) });

    await server.inject({ method: "GET", url: "api/healthz" });
    const response = await server.inject({ method: "GET", url: "api/metrics" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.body).toContain("# HELP sl_http_requests_total Total HTTP requests processed.");
    expect(response.body).toContain('sl_http_requests_total{method="GET",route="/api/healthz",status_code="200"} 1');
  });

  test("logs completed HTTP requests with structured route data", async () => {
    const eventLogger = vi.fn();
    const server = buildServer({ config: loadConfig({}), eventLogger });

    await server.inject({ method: "GET", url: "api/healthz" });

    expect(eventLogger).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "http.request.completed",
        method: "GET",
        route: "/api/healthz",
        statusCode: 200
      })
    );
  });
});
