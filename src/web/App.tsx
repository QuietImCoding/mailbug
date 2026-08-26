import { useCallback, useEffect, useState } from "react";
import {
  blockSender,
  dismissEmail,
  fetchBlocked,
  fetchEmail,
  fetchEmails,
  fetchStatistics,
  fetchWidgets,
  triggerAction,
  unblockSender,
  type EmailDetail,
  type EmailList,
  type Statistics,
  type Widgets,
} from "./lib/api.ts";
import { EmailRow } from "./components/EmailRow.tsx";
import { InboxControls, type InboxQuery } from "./components/InboxControls.tsx";
import { OverviewPanel } from "./components/OverviewPanel.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { Toast, useToast } from "./components/Toast.tsx";
import { WidgetRail } from "./components/WidgetRail.tsx";

const DEFAULT_PRIORITIES = [1, 2, 3, 4, 5];

/**
 * `#<email-id>` deep-links to an expanded message so a row can be shared.
 * Programmatic changes use replaceState (which fires no hashchange), so the
 * id is held in state and the two are kept in step by hand.
 */
function useHashId(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(
    () => window.location.hash.slice(1) || null,
  );

  useEffect(() => {
    const onHashChange = () => setId(window.location.hash.slice(1) || null);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const set = useCallback((next: string | null) => {
    setId(next);
    // replaceState keeps the back button meaning "leave the dashboard".
    window.history.replaceState(
      null,
      "",
      next ? `#${next}` : window.location.pathname,
    );
  }, []);

  return [id, set];
}

export function App() {
  const [query, setQuery] = useState<InboxQuery>({
    sort: "priority",
    // Priority 1 is most urgent, so ascending order surfaces the most urgent
    // email first (3 → 2 → 1 would be backwards).
    order: "asc",
    category: "",
  });
  const [reloadKey, setReloadKey] = useState(0);

  const [stats, setStats] = useState<Statistics | null>(null);
  const [list, setList] = useState<EmailList | null>(null);
  const [widgets, setWidgets] = useState<Widgets | null>(null);
  const [details, setDetails] = useState<Record<string, EmailDetail>>({});
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);

  const [openId, setOpenId] = useHashId();
  const { toast, show } = useToast();

  useEffect(() => {
    let cancelled = false;
    setError(null);

    Promise.all([fetchStatistics(), fetchEmails(query), fetchWidgets(), fetchBlocked()])
      .then(([nextStats, nextList, nextWidgets, nextBlocked]) => {
        if (cancelled) return;
        setStats(nextStats);
        setList(nextList);
        setWidgets(nextWidgets);
      setBlocked(new Set(nextBlocked));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [query, reloadKey]);

  // A deep-linked row may not be in the current view (filtered out, or blocked).
  useEffect(() => {
    if (!list || !openId) return;
    if (!list.items.some((item) => item.id === openId)) setOpenId(null);
  }, [list, openId, setOpenId]);

  // Bodies are only fetched when a row is actually opened.
  useEffect(() => {
    if (!openId || details[openId]) return;
    let cancelled = false;

    fetchEmail(openId)
      .then((detail) => {
        if (!cancelled) setDetails((prev) => ({ ...prev, [openId]: detail }));
      })
      .catch(() => {
        /* the row stays in its loading state */
      });

    return () => {
      cancelled = true;
    };
  }, [openId, details]);

  const handleBlock = useCallback(
    async (address: string) => {
      const key = address.toLowerCase();

      if (blocked.has(key)) {
        try {
          await unblockSender(address);
        } catch {
          show("couldn't unblock that sender");
          return;
        }
        setBlocked((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        show(`unblocked ${address}`);
      } else {
        if (
          !window.confirm(
            `Block ${address}? Their mail will be hidden from the inbox.`,
          )
        ) {
          return;
        }
        try {
          await blockSender(address);
        } catch {
          show("couldn't block that sender");
          return;
        }
        setBlocked((prev) => new Set(prev).add(key));
        show(`blocked ${address}`);
      }

      setDetails({});
      setOpenId(null);
      setReloadKey((key) => key + 1);
    },
    [blocked, setOpenId, show],
  );

  const handleTrigger = useCallback(
    async (emailId: string, actionType: string, label: string) => {
      try {
        await triggerAction(emailId, actionType);
      } catch {
        show(`couldn't trigger ${label}`);
        return;
      }
      show(`${label} triggered`);
      // Refresh so the chips reflect the status of the new run. The cached
      // bodies stay put: rows read their actions from the list, so an expanded
      // row updates without flashing back to "loading".
      setReloadKey((key) => key + 1);
    },
    [show],
  );

  const handleDismiss = useCallback(
    async (emailId: string) => {
      try {
        await dismissEmail(emailId);
      } catch {
        show("couldn't dismiss that email");
        return;
      }
      setDetails((prev) => {
        const next = { ...prev };
        delete next[emailId];
        return next;
      });
      setReloadKey((key) => key + 1);
      show("email dismissed");
    },
    [show],
  );

  const items = list?.items ?? [];
  const priorities =
    stats?.priorities && stats.priorities.length > 0
      ? stats.priorities
      : DEFAULT_PRIORITIES;

  return (
    <>
      <header className="wordmark">
        <img src="/assets/mailbug.png" alt="" />
        <h1>Mailbug</h1>
        <button
          type="button"
          className="settings-button"
          aria-label="Overview"
          title="Overview"
          onClick={() => setOverviewOpen(true)}
        >
          ☰
        </button>
        <button
          type="button"
          className="settings-button"
          aria-label="Settings"
          title="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
      </header>

      <WidgetRail widgets={widgets} />

      <section className="frame" aria-label="Inbox">
        <InboxControls
          query={query}
          onChange={setQuery}
          categories={stats?.byCategory ?? []}
          shown={list?.total ?? 0}
          total={stats?.total ?? 0}
        />

        <div className="rows">
          {error ? (
            <div className="empty">
              couldn&rsquo;t reach the server — {error}
            </div>
          ) : items.length === 0 ? (
            <div className="empty">{list ? "inbox is clear" : "loading…"}</div>
          ) : (
            items.map((email) => (
              <EmailRow
                key={email.id}
                email={email}
                detail={details[email.id]}
                open={openId === email.id}
                priorities={priorities}
                blocked={blocked.has(email.from_address.toLowerCase())}
                onToggle={setOpenId}
                onBlock={(address) => void handleBlock(address)}
                onDismiss={(emailId) => void handleDismiss(emailId)}
                onToast={show}
                onTrigger={(emailId, actionType, label) =>
                  void handleTrigger(emailId, actionType, label)
                }
              />
            ))
          )}
        </div>
      </section>

      {settingsOpen ? (
        <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={show} />
      ) : null}
      {overviewOpen ? <OverviewPanel onClose={() => setOverviewOpen(false)} /> : null}

      <Toast toast={toast} />
    </>
  );
}
