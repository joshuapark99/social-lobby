import type { FastifyInstance } from "fastify";
import type { Observability, ReadinessCheck } from "./observability.js";

export function registerHealthRoutes(
  server: FastifyInstance,
  options: {
    observability: Observability;
    readinessCheck: ReadinessCheck;
  }
): void {
  server.get("/api/healthz", async () => ({ status: "ok" }));
  server.get("/api/readyz", async (_request, reply) => {
    const readiness = await options.readinessCheck();
    if (readiness.ready) {
      return { status: "ready" };
    }

    return reply.status(503).send({
      status: "not_ready",
      checks: readiness.checks ?? {}
    });
  });
  server.get("/api/metrics", async (_request, reply) =>
    reply
      .header("content-type", "text/plain; version=0.0.4; charset=utf-8")
      .send(options.observability.metricsText())
  );
  server.route({
    method: ["POST", "PUT", "PATCH", "DELETE"],
    url: "/api/healthz",
    handler: async (_request, reply) => reply.status(405).send({ error: "method not allowed" })
  });
}
