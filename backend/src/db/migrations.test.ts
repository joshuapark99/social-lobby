import { describe, expect, test } from "vitest";
import { applyMigrations, migrationNames, seedLayoutNames, seedNames } from "./migrations.js";

describe("migration assets", () => {
  test("preserves existing SQL migrations and seed assets", async () => {
    await expect(migrationNames()).resolves.toEqual([
      "001_initial_schema.sql",
      "002_auth_sessions.sql",
      "003_enable_row_level_security.sql"
    ]);
    await expect(seedNames()).resolves.toEqual(["001_default_community_and_rooms.sql"]);
    await expect(seedLayoutNames()).resolves.toEqual(["main-lobby.json", "rooftop.json"]);
  });

  test("executes migrations before optional seed SQL", async () => {
    const executedSql: string[] = [];

    await applyMigrations(
      {
        query: async (sql: string) => {
          executedSql.push(sql);
          return { rows: [], rowCount: 0 };
        }
      },
      { seed: true }
    );

    expect(executedSql).toHaveLength(4);
    expect(executedSql[0]).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(executedSql[1]).toContain("CREATE TABLE IF NOT EXISTS user_sessions");
    expect(executedSql[2]).toContain("ENABLE ROW LEVEL SECURITY");
    expect(executedSql[3]).toContain("main-lobby");
  });

  test("can execute schema migrations without seed SQL", async () => {
    const executedSql: string[] = [];

    await applyMigrations(
      {
        query: async (sql: string) => {
          executedSql.push(sql);
          return { rows: [], rowCount: 0 };
        }
      },
      { seed: false }
    );

    expect(executedSql).toHaveLength(3);
    expect(executedSql.join("\n")).not.toContain("main-lobby");
  });
});
