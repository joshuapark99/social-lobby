import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(server: FastifyInstance): void {
  server.get("/healthz", async () => ({ status: "ok" }));
  server.route({
    method: ["POST", "PUT", "PATCH", "DELETE"],
    url: "/healthz",
    handler: async (_request, reply) => reply.status(405).send({ error: "method not allowed" })
  });
}
