import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export async function migrationNames(): Promise<string[]> {
  return sqlNames(path.join(dirname, "migrations"));
}

export async function seedNames(): Promise<string[]> {
  return sqlNames(path.join(dirname, "seeds"));
}

export async function seedLayoutNames(): Promise<string[]> {
  return sortedFileNames(path.join(dirname, "seeds", "layouts"), ".json");
}

export type QueryExecutor = {
  query(sql: string): Promise<unknown>;
};

export async function applyMigrations(pool: QueryExecutor, options: { seed: boolean }): Promise<void> {
  for (const sql of await sqlContents(path.join(dirname, "migrations"))) {
    await pool.query(sql);
  }
  if (!options.seed) return;
  for (const sql of await sqlContents(path.join(dirname, "seeds"))) {
    await pool.query(sql);
  }
}

async function sqlNames(directory: string): Promise<string[]> {
  return sortedFileNames(directory, ".sql");
}

async function sqlContents(directory: string): Promise<string[]> {
  return Promise.all((await sqlNames(directory)).map((name) => readFile(path.join(directory, name), "utf8")));
}

async function sortedFileNames(directory: string, extension: string): Promise<string[]> {
  return (await readdir(directory)).filter((name) => path.extname(name) === extension).sort();
}
