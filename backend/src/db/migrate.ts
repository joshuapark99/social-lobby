import { Pool } from "pg";
import { loadConfig } from "../config/config.js";
import { applyMigrations } from "./migrations.js";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const [key, value] = process.argv[index].split("=");
  args.set(key.replace(/^--?/, ""), value ?? "true");
}

const target = args.get("db") ?? "app";
const seed = args.get("seed") !== "false";
const config = loadConfig();
const connectionString = target === "test" ? config.testDatabaseUrl : target === "app" ? config.databaseUrl : "";

if (!connectionString) {
  throw new Error(`database URL is required for ${target}`);
}

const pool = new Pool({ connectionString });
try {
  await applyMigrations(pool, { seed });
} finally {
  await pool.end();
}
