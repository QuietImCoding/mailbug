import type { EmailAction, EmailDetail, EmailListItem } from "../lib/api.ts";
import {
  actionLabel,
  actionMessage,
  dateFmt,
  initials,
  paragraphs,
  priorityBucket,
  shortFmt,
} from "../lib/format.ts";
import { downloadInvite } from "../lib/ics.ts";

function Avatar({ email }: { email: EmailListItem }) {
  return (
    <div className="avatar" title={email.from_address}>
      {initials(email)}
    </div>
  );
}

interface ChipProps {
  email: EmailListItem;
  action: EmailAction;
  expanded: boolean;
  onToast: (message: string) => void;
  onTrigger: (emailId: string, actionType: string, label: string) => void;
}

function ActionChip({
  email,
  action,
  expanded,
  onToast,
  onTrigger,
}: ChipProps) {
  const message = actionMessage(action);
  const label = actionLabel(action.action_type);
  const isCalendar = action.action_type === "add-to-calendar";
  const when = new Date(email.received_at);

  const click = (event: React.MouseEvent) => {
    // The whole row is clickable, so chips must not also toggle it.
    event.stopPropagation();
    if (isCalendar) {
      // Nothing the server can do for us here — hand the user the invite.
      downloadInvite(email, message || email.subject, when);
      onToast("calendar invite downloaded");
    } else {
      onTrigger(email.id, action.action_type, label);
    }
  };

  let content: React.ReactNode = label;
  if (expanded && isCalendar) {
    content = (
      <>
        {`create calendar event "${message || email.subject}"`}
        <span className="sub">{dateFmt.format(when).toLowerCase()}</span>
      </>
    );
  } else if (expanded) {
    content = (
      <>
        {message ? `${label}: ${message}` : label}
        <span className="sub">{action.status}</span>
      </>
    );
  }

  return (
    <button type="button" className="action-chip" onClick={click}>
      {content}
    </button>
  );
}

function BlockSender({
  address,
  blocked,
  onBlock,
}: {
  address: string;
  blocked: boolean;
  onBlock: () => void;
}) {
  return (
    <button
      type="button"
      className={blocked ? "block-sender blocked" : "block-sender"}
      data-tip={blocked ? "click to unblock this sender" : "click to block this sender"}
      aria-label={blocked ? `Unblock ${address}` : `Block ${address}`}
      onClick={(event) => {
        event.stopPropagation();
        onBlock();
      }}
    >
      <svg className="stop" viewBox="0 0 24 24" aria-hidden="true">
        <polygon points="12,1.8 20.6,5.6 22.8,12 20.6,18.4 12,22.2 3.4,18.4 1.2,12 3.4,5.6" />
      </svg>
    </button>
  );
}

interface Props {
  email: EmailListItem;
  detail: EmailDetail | undefined;
  open: boolean;
  priorities: number[];
  blocked: boolean;
  onToggle: (id: string | null) => void;
  onBlock: (address: string) => void;
  onToast: (message: string) => void;
  onTrigger: (emailId: string, actionType: string, label: string) => void;
}

export function EmailRow({
  email,
  detail,
  open,
  priorities,
  blocked,
  onToggle,
  onBlock,
  onToast,
  onTrigger,
}: Props) {
  const toggle = () => onToggle(open ? null : email.id);

  const keydown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    } else if (event.key === "Escape" && open) {
      onToggle(null);
    }
  };

  // The list item's actions are refreshed on every load, so they are never
  // staler than the cached detail's copy.
  const actions = email.actions ?? detail?.actions ?? [];

  return (
    <div
      className={open ? "row open" : "row"}
      data-pri={priorityBucket(email.priority, priorities)}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={toggle}
      onKeyDown={keydown}
    >
      {open ? (
        <>
          <div className="row-head">
            <Avatar email={email} />
            <div className="headings">
              <div className="subject">{email.subject || "(no subject)"}</div>
              <div className="addresses">
                <div className="line">
                  <span>from: {email.from_address}</span>
                  <BlockSender
                    address={email.from_address}
                    blocked={blocked}
                    onBlock={() => onBlock(email.from_address)}
                  />
                </div>
              </div>
            </div>
            <div className="priority-badge">pri: {email.priority}</div>
          </div>

          <div className="body">
            {detail ? (
              paragraphs(detail.body_text).map((text, i) => (
                <p key={i}>{text}</p>
              ))
            ) : (
              <p>loading…</p>
            )}
          </div>

          {actions.length > 0 ? (
            <div className="row-footer">
              {actions.map((action, i) => (
                <ActionChip
                  key={`${action.action_type}-${i}`}
                  email={email}
                  action={action}
                  expanded
                  onToast={onToast}
                  onTrigger={onTrigger}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <div className="row-head">
          <Avatar email={email} />
          <div className="subject">{email.subject || "(no subject)"}</div>
          <div className="meta">
            {shortFmt.format(new Date(email.received_at))}
          </div>
          {email.actions[0] ? (
            <ActionChip
              email={email}
              action={email.actions[0]}
              expanded={false}
              onToast={onToast}
              onTrigger={onTrigger}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
