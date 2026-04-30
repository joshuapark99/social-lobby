import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { loadConfig } from "../config/config.js";
import { applyMigrations } from "../db/migrations.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const testDatabaseLockId = 17_017;
const resetSql = `
TRUNCATE TABLE
  linked_identities,
  memberships,
  invites,
  room_messages,
  visited_rooms,
  temporary_room_lifecycle_records,
  user_sessions,
  rooms,
  room_layouts,
  communities,
  users
RESTART IDENTITY CASCADE
`;

let poolPromise: Promise<Pool> | null = null;
let envPromise: Promise<NodeJS.ProcessEnv> | null = null;

export async function prepareTestDatabase(): Promise<void> {
  const pool = await getTestPool();

  await applyMigrations(pool, { seed: false });
  await pool.query(resetSql);
  await applyMigrations(pool, { seed: true });
}

export async function withTestPool<T>(callback: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = await getTestPool();
  return callback(pool);
}

export async function withLockedTestDatabase<T>(callback: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = await getTestPool();
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [testDatabaseLockId]);
    return await callback(pool);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [testDatabaseLockId]);
    client.release();
  }
}

async function getTestPool(): Promise<Pool> {
  if (!poolPromise) {
    poolPromise = createTestPool();
  }

  return poolPromise;
}

async function createTestPool(): Promise<Pool> {
  const env = await loadTestEnv();
  const config = loadConfig(env);

  if (!config.testDatabaseUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }

  return new Pool({ connectionString: config.testDatabaseUrl });
}

async function loadTestEnv(): Promise<NodeJS.ProcessEnv> {
  if (!envPromise) {
    envPromise = readDotEnv();
  }

  return envPromise;
}

async function readDotEnv(): Promise<NodeJS.ProcessEnv> {
  const file = await readFile(resolve(repoRoot, ".env"), "utf8");
  const parsed = Object.fromEntries(
    file
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );

  return {
    ...parsed,
    ...process.env
  };
}
