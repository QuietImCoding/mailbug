import "dotenv/config";
import { existsSync, unlinkSync } from "node:fs";
import { initDb } from "./db.ts";

const DB_FILE = "mailbug.db";

try {
  if (existsSync(DB_FILE)) unlinkSync(DB_FILE);
} catch {
  // best-effort removal; the DB is recreated by initDb() below
}

await initDb();
