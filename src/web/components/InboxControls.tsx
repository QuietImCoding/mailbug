import type { Statistics } from "../lib/api.ts";

export interface InboxQuery {
  sort: string;
  order: "asc" | "desc";
  category: string;
}

interface Props {
  query: InboxQuery;
  onChange: (next: InboxQuery) => void;
  categories: Statistics["byCategory"];
  shown: number;
  total: number;
}

export function InboxControls({
  query,
  onChange,
  categories,
  shown,
  total,
}: Props) {
  return (
    <div className="inbox-controls">
      <span className="count">
        {shown} of {total} shown
      </span>

      <label className="control">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 5h18l-7 8v6l-4 2v-8z" />
        </svg>
        <select
          aria-label="Filter by category"
          value={query.category}
          onChange={(e) => onChange({ ...query, category: e.target.value })}
        >
          <option value="">all</option>
          {categories.map((c) => (
            <option value={c.category} key={c.category}>
              {c.category} ({c.count})
            </option>
          ))}
        </select>
      </label>

      <label className="control">
        <select
          aria-label="Sort by"
          value={query.sort}
          onChange={(e) => onChange({ ...query, sort: e.target.value })}
        >
          <option value="priority">pri</option>
          <option value="received_at">date</option>
          <option value="from_address">sender</option>
          <option value="category">category</option>
        </select>
      </label>

      <button
        type="button"
        className="ghost-button"
        aria-label="Toggle sort direction"
        onClick={() =>
          onChange({ ...query, order: query.order === "desc" ? "asc" : "desc" })
        }
      >
        {query.order === "desc" ? "↓" : "↑"}
      </button>
    </div>
  );
}
