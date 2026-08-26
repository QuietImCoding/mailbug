import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { fetchStatistics, type Statistics } from "../lib/api.ts";

// Colors sampled from the page's :root (--orange / --pri ramp).
const PALETTE = {
  orange: "#e16918",
  ink: "#e46c1b",
  paper: "#ffffff",
  high: "#c90000",
  mid: "#c98400",
  low: "#64c900",
};

const CATEGORY_COLORS = [
  PALETTE.high,
  PALETTE.orange,
  PALETTE.mid,
  PALETTE.low,
  PALETTE.ink,
  "#4da0a0",
  "#7d6b9a",
];

function priorityColor(priority: number): string {
  // Higher priority number = more urgent (red), per the dashboard's ramp.
  if (priority >= 3) return PALETTE.high;
  if (priority >= 2) return PALETTE.mid;
  return PALETTE.low;
}

function renderCategoryDonut(
  svgEl: SVGSVGElement,
  items: Array<{ category: string; count: number }>,
): void {
  if (items.length === 0) return;
  const width = 300;
  const height = 300;
  const radius = Math.min(width, height) / 2;

  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();
  const g = svg
    .attr("viewBox", `0 0 ${width} ${height}`)
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  const arcs = d3
    .pie<{ category: string; count: number }>()
    .value((d) => d.count)
    .sort(null)(items);
  const arc = d3
    .arc<d3.PieArcDatum<{ category: string; count: number }>>()
    .innerRadius(radius * 0.55)
    .outerRadius(radius);

  const paths = g
    .selectAll("path")
    .data(arcs)
    .enter()
    .append("path")
    .attr("d", (d) => arc(d))
    .attr("fill", (d, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length])
    .attr("stroke", PALETTE.paper)
    .attr("stroke-width", 2);

  g.selectAll("text")
    .data(arcs)
    .enter()
    .append("text")
    .attr("transform", (d) => `translate(${arc.centroid(d)})`)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#3a2d10")
    .text((d) => (d.data.count / items.reduce((s, x) => s + x.count, 0) >= 0.06 ? d.data.category : ""));

  void paths;
}

function renderPriorityBars(
  svgEl: SVGSVGElement,
  items: Array<{ priority: number; count: number }>,
): void {
  const width = 300;
  const height = 220;
  const margin = { top: 16, right: 16, bottom: 28, left: 34 };

  const svg = d3.select(svgEl);
  svg.selectAll("*").remove();
  const x = d3
    .scaleBand<number>()
    .domain(items.map((d) => d.priority))
    .range([margin.left, width - margin.right])
    .padding(0.35);
  const y = d3
    .scaleLinear()
    .domain([0, Math.max(1, d3.max(items, (d) => d.count) ?? 1)])
    .nice()
    .range([height - margin.bottom, margin.top]);

  const g = svg.attr("viewBox", `0 0 ${width} ${height}`);
  g.append("g")
    .call(d3.axisLeft(y).ticks(4))
    .attr("font-size", 11);
  g.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x))
    .attr("font-size", 11);

  g.selectAll("rect")
    .data(items)
    .enter()
    .append("rect")
    .attr("x", (d) => x(d.priority) ?? 0)
    .attr("y", (d) => y(d.count))
    .attr("width", x.bandwidth())
    .attr("height", (d) => height - margin.bottom - y(d.count))
    .attr("fill", (d) => priorityColor(d.priority))
    .attr("rx", 3);

  // Count labels.
  g.selectAll(".pri-label")
    .data(items)
    .enter()
    .append("text")
    .attr("class", "pri-label")
    .attr("x", (d) => (x(d.priority) ?? 0) + x.bandwidth() / 2)
    .attr("y", (d) => y(d.count) - 5)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", PALETTE.ink)
    .text((d) => String(d.count));
}

export function OverviewPanel({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categoryRef = useRef<SVGSVGElement | null>(null);
  const priorityRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStatistics()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        if (!cancelled) setError("couldn't load statistics");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stats && categoryRef.current) renderCategoryDonut(categoryRef.current, stats.byCategory);
  }, [stats]);

  useEffect(() => {
    if (stats && priorityRef.current) renderPriorityBars(priorityRef.current, stats.byPriority);
  }, [stats]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal overview"
        role="dialog"
        aria-modal="true"
        aria-label="Overview"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <span>Overview</span>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          {error ? (
            <p className="muted">{error}</p>
          ) : !stats ? (
            <p className="muted">loading…</p>
          ) : (
            <>
              <div className="stat-total">
                <span className="stat-num">{stats.total}</span>
                <span className="stat-label">emails</span>
              </div>
              <div className="chart-row">
                <div className="chart-block">
                  <h3>by category</h3>
                  <svg ref={categoryRef} className="chart" width={300} height={300} />
                </div>
                <div className="chart-block">
                  <h3>by priority</h3>
                  <svg ref={priorityRef} className="chart" width={300} height={220} />
                </div>
              </div>
              <div className="senders">
                <h3>top senders</h3>
                <ul>
                  {stats.topSenders.slice(0, 5).map((s) => (
                    <li key={s.sender}>
                      <span className="sender">{s.sender}</span>
                      <span className="sender-count">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
