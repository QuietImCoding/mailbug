import { useEffect, useState } from "react";
import type { Widgets } from "../lib/api.ts";

function CalendarWidget({
  calendar,
  events,
}: {
  calendar: Widgets["calendar"] | undefined;
  events: Widgets["events"];
}) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  if (!calendar) return <div className="calendar" />;

  const dayEvents =
    selectedDay == null
      ? []
      : events.filter((event) => {
          const t = new Date(event.date);
          return (
            !Number.isNaN(t.getTime()) &&
            t.getFullYear() === calendar.year &&
            t.getMonth() === calendar.monthIndex &&
            t.getDate() === selectedDay
          );
        });

  return (
    <>
      <div className="calendar">
        <div className="month">{calendar.label}</div>
        <div className="days">
          {Array.from({ length: calendar.firstWeekday }, (_, i) => (
            <div className="day pad" key={`pad-${i}`} />
          ))}
          {calendar.days.map((day) => {
            const tip = [
              `${calendar.label} ${day.day}`,
              `${day.emails} email(s)`,
            ];
            if (day.events > 0) tip.push(`${day.events} calendar action(s)`);
            const classes = ["day"];
            if (day.events > 0) classes.push("has-event");
            if (day.day === calendar.today) classes.push("today");
            if (day.day === selectedDay) classes.push("selected");
            return (
              <div
                key={day.day}
                className={classes.join(" ")}
                // Three load steps is enough to read as a heatmap at this size.
                data-load={Math.min(3, Math.ceil(day.emails / 3))}
                title={tip.join(" · ")}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedDay(day.day)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedDay(day.day);
                  }
                }}
              >
                <span className="day-num">{day.day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDay != null ? (
        <div className="modal-backdrop" onClick={() => setSelectedDay(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${calendar.label} ${selectedDay}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <span>
                {calendar.label} {selectedDay}
              </span>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => setSelectedDay(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {dayEvents.length === 0 ? (
                <p className="muted">no events on this day</p>
              ) : (
                <ul className="day-events">
                  {dayEvents.map((event) => (
                    <li key={`${event.emailId}-${event.date}`}>
                      <div className="ev-title">{event.title}</div>
                      <div className="ev-meta">
                        {event.subject} · {event.status}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CodeButton({ code, onUsed }: { code: string; onUsed: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      className={copied ? "value copied" : "value"}
      title="click to copy"
      onClick={() => {
        void navigator.clipboard.writeText(code).then(
          () => {
            setCopied(true);
            onUsed();
          },
          () => setCopied(false),
        );
      }}
    >
      {code}
    </button>
  );
}

function CodesWidget({ codes }: { codes: Widgets["codes"] }) {
  const [used, setUsed] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const markUsed = (code: string) => {
    setRemoving((prev) => new Set(prev).add(code));
    setTimeout(() => {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
      setUsed((prev) => new Set(prev).add(code));
    }, 400);
  };

  if (codes.length === 0) {
    return (
      <div className="codes">
        <div className="code-item">
          <div className="label">no recent codes</div>
        </div>
      </div>
    );
  }

  return (
    <div className="codes">
      {codes
        .slice(0, 2)
        .filter((entry) => !used.has(entry.code))
        .map((entry) => (
          <div
            className={removing.has(entry.code) ? "code-item removing" : "code-item"}
            key={entry.emailId}
          >
            <div className="label">code from {entry.domain}:</div>
            <CodeButton code={entry.code} onUsed={() => markUsed(entry.code)} />
          </div>
        ))}
    </div>
  );
}

export function WidgetRail({ widgets }: { widgets: Widgets | null }) {
  return (
    <section className="frame rail" aria-label="Widgets">
      <CalendarWidget calendar={widgets?.calendar} events={widgets?.events ?? []} />
      <div className="divider" />
      <CodesWidget codes={widgets?.codes ?? []} />
    </section>
  );
}
