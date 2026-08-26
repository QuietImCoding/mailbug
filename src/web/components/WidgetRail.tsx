import { useEffect, useState } from "react";
import type { Widgets } from "../lib/api.ts";

function CalendarWidget({
  calendar,
}: {
  calendar: Widgets["calendar"] | undefined;
}) {
  if (!calendar) return <div className="calendar" />;

  return (
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
          return (
            <div
              key={day.day}
              className={classes.join(" ")}
              // Three load steps is enough to read as a heatmap at this size.
              data-load={Math.min(3, Math.ceil(day.emails / 3))}
              title={tip.join(" · ")}
            />
          );
        })}
      </div>
    </div>
  );
}

function CodeButton({ code }: { code: string }) {
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
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {code}
    </button>
  );
}

function CodesWidget({ codes }: { codes: Widgets["codes"] }) {
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
      {codes.slice(0, 2).map((entry) => (
        <div className="code-item" key={entry.emailId}>
          <div className="label">code from {entry.domain}:</div>
          <CodeButton code={entry.code} />
        </div>
      ))}
    </div>
  );
}

export function WidgetRail({ widgets }: { widgets: Widgets | null }) {
  return (
    <section className="frame rail" aria-label="Widgets">
      <CalendarWidget calendar={widgets?.calendar} />
      <div className="divider" />
      <CodesWidget codes={widgets?.codes ?? []} />
      <div className="slot-fill">widgets go here</div>
    </section>
  );
}
