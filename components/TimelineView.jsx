"use client";

import { useEffect, useMemo, useRef } from "react";

// Timeline (Gantt sederhana): satu baris per tugas, dikelompokkan per klien.
// Batang dari tanggal mulai sampai deadline; tanpa tanggal mulai = satu hari di deadline.

const DAY_W = 34;
const DAY_MS = 86400000;

function parse(d) {
  return new Date(d + "T00:00:00");
}

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function TimelineView({ tasks, todayStr, clientOf, isOverdue, onOpen, columns }) {
  const scrollRef = useRef(null);
  const today = todayStr ? parse(todayStr) : new Date();

  const dated = tasks.filter((t) => t.due && t.column !== "ongoing");
  const undated = tasks.filter((t) => !t.due || t.column === "ongoing");

  // Rentang: 2 minggu sebelum hari ini s/d minimal 6 minggu ke depan, diperluas mengikuti data.
  const range = useMemo(() => {
    let min = new Date(today.getTime() - 14 * DAY_MS);
    let max = new Date(today.getTime() + 42 * DAY_MS);
    for (const t of dated) {
      const s = parse(t.start || t.due);
      const e = parse(t.due);
      if (s < min) min = new Date(s.getTime() - 3 * DAY_MS);
      if (e > max) max = new Date(e.getTime() + 7 * DAY_MS);
    }
    // Mulai di hari Senin supaya garis minggu rapi.
    min = new Date(min.getFullYear(), min.getMonth(), min.getDate() - ((min.getDay() + 6) % 7));
    const days = Math.round((max - min) / DAY_MS) + 1;
    return { min, days };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, todayStr]);

  const dayIndex = (d) => Math.round((parse(d) - range.min) / DAY_MS);
  const todayIdx = Math.round((today - range.min) / DAY_MS);

  const groups = useMemo(() => {
    const map = new Map();
    for (const t of [...dated].sort((a, b) => (a.start || a.due).localeCompare(b.start || b.due))) {
      if (!map.has(t.client)) map.set(t.client, []);
      map.get(t.client).push(t);
    }
    return [...map.entries()].sort((a, b) => clientOf(a[0]).name.localeCompare(clientOf(b[0]).name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  // Gulir otomatis ke sekitar hari ini saat pertama dibuka.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, (todayIdx - 5) * DAY_W);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = Array.from({ length: range.days }, (_, i) => new Date(range.min.getFullYear(), range.min.getMonth(), range.min.getDate() + i));
  const width = range.days * DAY_W;

  return (
    <div className="timeline-wrap">
      {dated.length === 0 ? (
        <div className="empty-col" style={{ height: 120 }}>Belum ada tugas dengan deadline untuk ditampilkan di timeline.</div>
      ) : (
        <div className="timeline">
          <div className="timeline-labels">
            <div className="timeline-corner">
              <span className="serif" style={{ fontSize: 17, textTransform: "capitalize" }}>{today.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</span>
            </div>
            {groups.map(([clientId, list]) => (
              <div key={clientId}>
                <div className="timeline-group">
                  <span className="dot" style={{ background: clientOf(clientId).color }} />
                  {clientOf(clientId).name}
                </div>
                {list.map((t) => (
                  <button key={t.id} className="timeline-label" onClick={() => onOpen(t)} title={t.title}>
                    {t.title}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="timeline-scroll" ref={scrollRef}>
            <div style={{ width, position: "relative" }}>
              <div className="timeline-head" style={{ width }}>
                {days.map((d, i) => {
                  const firstOfMonth = d.getDate() === 1 || i === 0;
                  return (
                    <div key={i} className={`timeline-day ${d.getDay() === 0 || d.getDay() === 6 ? "is-weekend" : ""} ${ymd(d) === todayStr ? "is-today" : ""}`} style={{ width: DAY_W }}>
                      {firstOfMonth && <span className="timeline-month">{d.toLocaleDateString("id-ID", { month: "short", year: d.getMonth() === 0 || i === 0 ? "numeric" : undefined })}</span>}
                      <span className="mono">{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>

              <div className="timeline-grid" style={{ width, backgroundSize: `${DAY_W}px 100%, ${DAY_W * 7}px 100%` }}>
                {todayIdx >= 0 && todayIdx < range.days && <div className="timeline-today" style={{ left: todayIdx * DAY_W + DAY_W / 2 }} />}
                {groups.map(([clientId, list]) => (
                  <div key={clientId}>
                    <div className="timeline-group-spacer" />
                    {list.map((t) => {
                      const s = dayIndex(t.start || t.due);
                      const e = dayIndex(t.due);
                      const c = clientOf(t.client);
                      const late = isOverdue(t.due, t.column, todayStr);
                      const subs = t.subtasks || [];
                      const pct = subs.length ? Math.round((subs.filter((x) => x.done).length / subs.length) * 100) : t.column === "done" ? 100 : 0;
                      return (
                        <div key={t.id} className="timeline-row">
                          <button
                            className={`timeline-bar ${t.column === "done" ? "is-done" : ""} ${late ? "is-late" : ""}`}
                            style={{ left: s * DAY_W + 3, width: Math.max(1, e - s + 1) * DAY_W - 6, "--bar": c.color }}
                            onClick={() => onOpen(t)}
                            title={`${t.title}\n${t.start ? `${t.start} → ` : ""}${t.due} · ${columns[t.column] || t.column}`}
                          >
                            <span className="timeline-bar-fill" style={{ width: `${pct}%` }} />
                            <span className="timeline-bar-text">{t.title}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-muted" style={{ marginTop: 12 }}>
        Batang dimulai dari <b>tanggal mulai</b> sampai <b>deadline</b>. Isi tanggal mulai di detail tugas supaya durasinya terlihat.
        {undated.length > 0 && ` ${undated.length} tugas tanpa deadline tidak ditampilkan.`}
      </p>
    </div>
  );
}
