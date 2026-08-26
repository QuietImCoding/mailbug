import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "./schema.ts";

/** Overridable so tests (and throwaway runs) never touch the dev database. */
export const DB_FILE = (): string => process.env.MAILBUG_DB ?? "mailbug.db";

// Opens the database lazily on the first query so that `db:reset` can unlink
// the file before any connection is established. Kysely calls the factory
// once and reuses the connection for the lifetime of the instance.
export const db = new Kysely<DB>({
  dialect: new SqliteDialect({
    database: () => Promise.resolve(new Database(DB_FILE())),
  }),
});

export async function initDb(): Promise<void> {
  await db.schema
    .createTable("emails")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey())
    .addColumn("message_id", "text", (col) => col.notNull().unique())
    .addColumn("subject", "text", (col) => col.notNull())
    .addColumn("from_address", "text", (col) => col.notNull())
    .addColumn("from_name", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("to_address", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("received_at", "text", (col) => col.notNull())
    .addColumn("category", "text", (col) => col.notNull())
    .addColumn("priority", "integer", (col) => col.notNull())
    .addColumn("topic", "text", (col) => col.notNull())
    .addColumn("body_text", "text", (col) => col.notNull())
    .addColumn("raw_json", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(""))
    .execute();

  await db.schema
    .createTable("email_actions")
    .ifNotExists()
    .addColumn("id", "text", (col) => col.notNull().primaryKey())
    .addColumn("email_id", "text", (col) =>
      col.notNull().references("emails.id").onDelete("cascade"),
    )
    .addColumn("action_type", "text", (col) => col.notNull())
    .addColumn("payload", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(""))
    .execute();

  await db.schema
    .createTable("blocked_senders")
    .ifNotExists()
    .addColumn("address", "text", (col) => col.notNull().primaryKey())
    .addColumn("blocked_at", "text", (col) => col.notNull().defaultTo(""))
    .execute();

  await db.schema
    .createTable("ingest_state")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.notNull().primaryKey())
    .addColumn("last_ingested_at", "text", (col) => col.notNull())
    .execute();

  // `createTable(...).ifNotExists()` is a no-op on an existing database, so
  // columns added after the first release need their own idempotent ALTER.
  await addColumnIfMissing("emails", "to_address");

  await db.schema
    .createIndex("emails_category")
    .ifNotExists()
    .on("emails")
    .column("category")
    .execute();
  await db.schema
    .createIndex("emails_sender")
    .ifNotExists()
    .on("emails")
    .column("from_address")
    .execute();
  await db.schema
    .createIndex("emails_topic")
    .ifNotExists()
    .on("emails")
    .column("topic")
    .execute();
}

async function addColumnIfMissing(
  table: "emails",
  column: string,
): Promise<void> {
  try {
    await db.schema
      .alterTable(table)
      .addColumn(column, "text", (col) => col.notNull().defaultTo(""))
      .execute();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/duplicate column/i.test(message)) throw err;
  }
}
