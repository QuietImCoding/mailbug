import "dotenv/config";
import { existsSync, unlinkSync } from "node:fs";
import { DB_FILE, initDb } from "./db.ts";

try {
  const file = DB_FILE();
  if (existsSync(file)) unlinkSync(file);
} catch {
  // best-effort removal; the DB is recreated by initDb() below
}

await initDb();
