import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { prepareTestDatabase, withLockedTestDatabase, withTestPool } from "./testDatabase.js";

describe.sequential("prepareTestDatabase", () => {
  test("resets mutable records while preserving seeded rooms", async () => {
    await withLockedTestDatabase(async () => {
      await prepareTestDatabase();

      await withTestPool(async (pool) => {
        await pool.query("INSERT INTO users (id, display_name) VALUES ($1, $2)", [randomUUID(), "Integration User"]);
      });

      await prepareTestDatabase();

      await withTestPool(async (pool) => {
        const userCount = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM users");
        const roomCount = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM rooms");

        expect(userCount.rows[0]?.count).toBe("0");
        expect(roomCount.rows[0]?.count).toBe("2");
      });
    });
  });
});
