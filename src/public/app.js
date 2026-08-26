// Mailbug dashboard. Rows are themed by priority, click one to expand it
// in place into the full message.

const state = {
  sort: "priority",
  order: "desc",
  category: "",
  // `#<email-id>` deep-links to an expanded message, so a row can be shared.
  openId: location.hash.slice(1) || null,
  /** Priority range from the mail spec, used to bucket rows into colours. */
  priorities: [1, 2, 3],
};

const el = (id) => document.getElementById(id);
const detailCache = new Map();

/* ------------------------------------------------------------- formatting */

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const shortFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function priorityBucket(priority) {
  const min = Math.min(...state.priorities);
  const max = Math.max(...state.priorities);
  const norm = max === min ? 0.5 : (priority - min) / (max - min);
  if (norm >= 0.66) return "high";
  if (norm >= 0.34) return "mid";
  return "low";
}

function initials(email) {
  const name = (email.from_name || email.from_address || "?").trim();
  return name[0] || "?";
}

function actionMessage(action) {
  try {
    return Object.values(JSON.parse(action.payload))[0] || "";
  } catch {
    return "";
  }
}

const ACTION_LABELS = {
  "add-to-calendar": "add to cal",
  ntfy: "notify",
  "remind-me": "remind me",
  webhook: "webhook",
};

/* ------------------------------------------------------------------ toast */

let toastTimer;
function toast(message) {
  const node = el("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}

/* -------------------------------------------------------------------- ics */

function icsEscape(text) {
  return String(text)
    .replace(/([\\;,])/g, "\\$1")
    .replace(/\n/g, "\\n");
}

function icsStamp(date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Downloads a calendar invite for an `add-to-calendar` action. */
function downloadInvite(email, title, start) {
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mailbug//EN",
    "BEGIN:VEVENT",
    `UID:${email.id}@mailbug`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(title)}`,
    `DESCRIPTION:${icsEscape(`From ${email.from_name || ""} <${email.from_address}>\n${email.subject}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${title.replace(/[^\w -]+/g, "").slice(0, 60) || "event"}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
  toast("calendar invite downloaded");
}

/* --------------------------------------------------------------- widgets */

function renderCalendar(cal) {
  const root = el("calendar");
  root.textContent = "";
  if (!cal) return;

  const month = document.createElement("div");
  month.className = "month";
  month.textContent = cal.label;
  root.appendChild(month);

  const grid = document.createElement("div");
  grid.className = "days";

  for (let i = 0; i < cal.firstWeekday; i++) {
    const pad = document.createElement("div");
    pad.className = "day pad";
    grid.appendChild(pad);
  }

  for (const day of cal.days) {
    const cell = document.createElement("div");
    cell.className = "day";
    // Three load steps is enough to read as a heatmap at this size.
    cell.dataset.load = String(Math.min(3, Math.ceil(day.emails / 3)));
    if (day.events > 0) cell.classList.add("has-event");
    if (day.day === cal.today) cell.classList.add("today");
    const parts = [`${cal.label} ${day.day}`, `${day.emails} email(s)`];
    if (day.events > 0) parts.push(`${day.events} calendar action(s)`);
    cell.title = parts.join(" · ");
    grid.appendChild(cell);
  }

  root.appendChild(grid);
}

function renderCodes(codes) {
  const root = el("codes");
  root.textContent = "";

  if (!codes || codes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "code-item";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = "no recent codes";
    empty.appendChild(label);
    root.appendChild(empty);
    return;
  }

  for (const entry of codes.slice(0, 2)) {
    const item = document.createElement("div");
    item.className = "code-item";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = `code from ${entry.domain}:`;

    const button = document.createElement("button");
    button.className = "value";
    button.type = "button";
    button.textContent = entry.code;
    button.title = "click to copy";
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(entry.code);
        button.classList.add("copied");
        setTimeout(() => button.classList.remove("copied"), 1600);
        toast("code copied");
      } catch {
        toast("couldn't copy — select it manually");
      }
    });

    item.append(label, button);
    root.appendChild(item);
  }
}

/* ------------------------------------------------------------------- rows */

function buildAvatar(email) {
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = initials(email);
  avatar.title = email.from_address;
  return avatar;
}

function buildActionChip(email, action, expanded) {
  const chip = document.createElement("button");
  chip.className = "action-chip";
  chip.type = "button";

  const message = actionMessage(action);
  const label = ACTION_LABELS[action.action_type] || action.action_type;
  const isCalendar = action.action_type === "add-to-calendar";
  const when = new Date(email.received_at);

  if (!expanded) {
    chip.textContent = label;
  } else if (isCalendar) {
    chip.textContent = `create calendar event "${message || email.subject}"`;
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = dateFmt.format(when).toLowerCase();
    chip.appendChild(sub);
  } else {
    chip.textContent = message ? `${label}: ${message}` : label;
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = action.status;
    chip.appendChild(sub);
  }

  chip.addEventListener("click", (event) => {
    event.stopPropagation();
    if (isCalendar) {
      downloadInvite(email, message || email.subject, when);
    } else {
      toast(`${label} — ${action.status}`);
    }
  });

  return chip;
}

function buildCollapsed(email) {
  const head = document.createElement("div");
  head.className = "row-head";

  const subject = document.createElement("div");
  subject.className = "subject";
  subject.textContent = email.subject || "(no subject)";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = shortFmt.format(new Date(email.received_at));

  head.append(buildAvatar(email), subject, meta);

  const action = (email.actions || [])[0];
  if (action) head.appendChild(buildActionChip(email, action, false));

  return head;
}

function buildAddressLine(label, address, onBlock) {
  const line = document.createElement("div");
  line.className = "line";

  const text = document.createElement("span");
  text.textContent = `${label}: ${address}`;
  line.appendChild(text);

  if (onBlock) {
    const block = document.createElement("button");
    block.className = "block-sender";
    block.type = "button";
    block.dataset.tip = "click to block this sender";
    block.setAttribute("aria-label", `Block ${address}`);
    const stop = document.createElement("span");
    stop.className = "stop";
    block.appendChild(stop);
    block.addEventListener("click", (event) => {
      event.stopPropagation();
      onBlock();
    });
    line.appendChild(block);
  }

  return line;
}

async function blockSender(address) {
  if (!confirm(`Block ${address}? Their mail will be hidden from the inbox.`))
    return;
  const res = await fetch("/api/senders/blocked", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) {
    toast("couldn't block that sender");
    return;
  }
  detailCache.clear();
  setOpen(null);
  toast(`blocked ${address}`);
  await load();
}

function buildExpanded(email, detail) {
  const fragment = document.createDocumentFragment();

  const head = document.createElement("div");
  head.className = "row-head";

  const headings = document.createElement("div");
  headings.className = "headings";

  const subject = document.createElement("div");
  subject.className = "subject";
  subject.textContent = email.subject || "(no subject)";

  const addresses = document.createElement("div");
  addresses.className = "addresses";
  addresses.append(
    buildAddressLine("from", email.from_address, () =>
      blockSender(email.from_address),
    ),
  );
  if (detail?.to_address)
    addresses.append(buildAddressLine("to", detail.to_address));

  headings.append(subject, addresses);

  const badge = document.createElement("div");
  badge.className = "priority-badge";
  badge.textContent = `pri: ${email.priority}`;

  head.append(buildAvatar(email), headings, badge);
  fragment.appendChild(head);

  const body = document.createElement("div");
  body.className = "body";
  if (detail) {
    const paragraphs = String(detail.body_text || "")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) paragraphs.push("(no message body)");
    for (const text of paragraphs) {
      const p = document.createElement("p");
      p.textContent = text;
      body.appendChild(p);
    }
  } else {
    body.textContent = "loading…";
  }
  fragment.appendChild(body);

  const actions = detail?.actions ?? email.actions ?? [];
  if (actions.length > 0) {
    const footer = document.createElement("div");
    footer.className = "row-footer";
    for (const action of actions)
      footer.appendChild(buildActionChip(email, action, true));
    fragment.appendChild(footer);
  }

  return fragment;
}

function buildRow(email) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.pri = priorityBucket(email.priority);
  row.dataset.id = email.id;
  row.tabIndex = 0;
  row.setAttribute("role", "button");

  const open = state.openId === email.id;
  row.setAttribute("aria-expanded", String(open));

  if (open) {
    row.classList.add("open");
    row.appendChild(buildExpanded(email, detailCache.get(email.id)));
  } else {
    row.appendChild(buildCollapsed(email));
  }

  const toggle = () => {
    setOpen(open ? null : email.id);
  };

  row.addEventListener("click", toggle);
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    } else if (event.key === "Escape" && open) {
      setOpen(null);
    }
  });

  return row;
}

let emails = [];

function setOpen(id) {
  state.openId = id;
  // replaceState keeps the back button meaning "leave the dashboard".
  history.replaceState(null, "", id ? `#${id}` : location.pathname);
  renderRows();
  if (id) void loadDetail(id);
}

function renderRows() {
  const root = el("rows");
  root.textContent = "";

  if (emails.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "inbox is clear";
    root.appendChild(empty);
    return;
  }

  for (const email of emails) root.appendChild(buildRow(email));
}

async function loadDetail(id) {
  if (detailCache.has(id)) return;
  const detail = await fetch(`/api/emails/${id}`).then((r) =>
    r.ok ? r.json() : null,
  );
  if (!detail) return;
  detailCache.set(id, detail);
  if (state.openId === id) renderRows();
}

/* ------------------------------------------------------------------- load */

function renderFilterOptions(byCategory) {
  const select = el("filter");
  const current = state.category;
  select.textContent = "";

  const all = document.createElement("option");
  all.value = "";
  all.textContent = "all";
  select.appendChild(all);

  for (const row of byCategory ?? []) {
    const option = document.createElement("option");
    option.value = row.category;
    option.textContent = `${row.category} (${row.count})`;
    select.appendChild(option);
  }
  select.value = current;
}

async function load() {
  const query = new URLSearchParams({
    sort: state.sort,
    order: state.order,
    limit: "100",
  });
  if (state.category) query.set("category", state.category);

  const [stats, data, widgets] = await Promise.all([
    fetch("/api/statistics").then((r) => r.json()),
    fetch(`/api/emails?${query}`).then((r) => r.json()),
    fetch("/api/widgets").then((r) => r.json()),
  ]);

  if (Array.isArray(stats.priorities) && stats.priorities.length > 0) {
    state.priorities = stats.priorities;
  }
  renderFilterOptions(stats.byCategory);
  renderCalendar(widgets.calendar);
  renderCodes(widgets.codes);

  emails = data.items ?? [];
  el("count").textContent = `${data.total} of ${stats.total} shown`;
  // A deep-linked row may have been filtered out of the current view.
  if (state.openId && !emails.some((e) => e.id === state.openId))
    state.openId = null;
  renderRows();
  if (state.openId) void loadDetail(state.openId);
}

el("filter").addEventListener("change", (event) => {
  state.category = event.target.value;
  setOpen(null);
  void load();
});

window.addEventListener("hashchange", () =>
  setOpen(location.hash.slice(1) || null),
);

el("sort").addEventListener("change", (event) => {
  state.sort = event.target.value;
  void load();
});

el("order").addEventListener("click", (event) => {
  state.order = state.order === "desc" ? "asc" : "desc";
  event.currentTarget.textContent = state.order === "desc" ? "↓" : "↑";
  void load();
});

void load();
