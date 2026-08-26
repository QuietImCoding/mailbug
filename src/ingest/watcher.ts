import { ImapFlow } from "imapflow";

// A long-lived IMAP connection that sits in IDLE and reports when the server
// says new mail has arrived. It deliberately does not fetch anything: it only
// nudges the existing ingest pipeline, which stays the single place that knows
// how to turn messages into rows.
//
// ImapFlow enters IDLE on its own once a mailbox is open and the connection
// goes quiet, so there is no manual idle() call here — calling it directly
// would block until IDLE ends.

/** Grace period so a burst of arrivals triggers one ingest, not one each. */
const COALESCE_MS = 3_000;

const RECONNECT_MIN_MS = 2_000;
const RECONNECT_MAX_MS = 5 * 60 * 1000;

// Servers hang up on an IDLE that runs too long (commonly ~29 minutes) and
// NAT tables drop idle mappings sooner. ImapFlow does not cycle IDLE unless
// asked, so break and restart it well inside both limits.
const MAX_IDLE_MS = 5 * 60 * 1000;

export interface MailWatcher {
  stop(): Promise<void>;
}

/**
 * Starts watching INBOX. `onNewMail` fires when the mailbox grows, and again
 * after a reconnect — mail that landed while the connection was down produces
 * no event, so the reconnect itself is treated as "something may have arrived".
 *
 * Returns null when IMAP is not configured.
 */
export function startMailWatcher(
  onNewMail: (reason: string) => void,
): MailWatcher | null {
  const host = process.env.MAILBUG_IMAP_HOST;
  const user = process.env.MAILBUG_IMAP_USER;
  if (!host || !user) {
    console.warn("[imap-idle] no IMAP configured — not watching for new mail");
    return null;
  }

  const pass = process.env.MAILBUG_IMAP_PASS ?? "";
  const port = Number(process.env.MAILBUG_IMAP_PORT ?? 993);
  const secure = process.env.MAILBUG_IMAP_SECURE !== "false";

  let client: ImapFlow | null = null;
  let stopped = false;
  let everConnected = false;
  let backoff = RECONNECT_MIN_MS;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let coalesceTimer: NodeJS.Timeout | undefined;

  function notify(reason: string): void {
    if (stopped || coalesceTimer) return;
    coalesceTimer = setTimeout(() => {
      coalesceTimer = undefined;
      if (!stopped) onNewMail(reason);
    }, COALESCE_MS);
  }

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return;
    const delay = backoff;
    backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    console.warn(
      `[imap-idle] disconnected — retrying in ${Math.round(delay / 1000)}s`,
    );
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, delay);
  }

  async function connect(): Promise<void> {
    if (stopped) return;

    const c = new ImapFlow({
      host: host!,
      port,
      secure,
      auth: { user: user!, pass },
      logger: false,
      maxIdleTime: MAX_IDLE_MS,
    });
    client = c;

    // Without an `error` listener a socket reset is an unhandled 'error' event,
    // which takes down the process.
    c.on("error", (err: unknown) => {
      console.error(
        `[imap-idle] ${host}: connection error`,
        err instanceof Error ? err.message : err,
      );
    });

    // Only reconnect for the client we still consider current: a superseded or
    // stopped connection closing must not resurrect the watcher.
    c.on("close", () => {
      if (c === client) scheduleReconnect();
    });

    c.on("exists", (data) => {
      if (data.count > data.prevCount) {
        console.log(
          `[imap-idle] ${data.count - data.prevCount} new message(s) in ${data.path}`,
        );
        notify("new mail");
      }
    });

    try {
      await c.connect();
      // Opened without a lock on purpose: holding one keeps the connection
      // "busy" and auto-IDLE never starts.
      await c.mailboxOpen("INBOX");
      backoff = RECONNECT_MIN_MS;
      console.log(`[imap-idle] watching INBOX on ${host} as ${user}`);

      // A reconnect means there was a window with no listener. The mailbox is
      // re-selected rather than reported as changed, so sweep for what we missed.
      if (everConnected) notify("reconnected");
      everConnected = true;
    } catch (err) {
      console.error(
        "[imap-idle] could not start watching:",
        err instanceof Error ? err.message : err,
      );
      scheduleReconnect();
    }
  }

  void connect();

  return {
    async stop(): Promise<void> {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearTimeout(coalesceTimer);
      reconnectTimer = undefined;
      coalesceTimer = undefined;

      const c = client;
      client = null; // makes the close handler a no-op
      if (!c) return;
      try {
        await c.logout();
      } catch {
        c.close(); // best effort — the socket may already be gone
      }
    },
  };
}
