"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/icons";

// Tampilan kalender bulanan: tugas diletakkan di tanggal deadline-nya.
// Tugas bisa digeser ke tanggal lain untuk mengganti deadline (kalau user berhak mengedit).

const DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function CalendarView({ tasks, todayStr, clientOf, isOverdue, canEditTask, onOpen, onMoveDue }) {
  const [cursor, setCursor] = useState(() => {
    const t = todayStr ? new Date(todayStr + "T00:00:00") : new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1);
  });
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);

  const byDay = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (!t.due || t.column === "ongoing") continue;
      (map[t.due] ||= []).push(t);
    }
    return map;
  }, [tasks]);

  const undated = tasks.filter((t) => !t.due || t.column === "ongoing");

  // Grid dimulai hari Senin sebelum/tepat tanggal 1, selalu 6 minggu supaya tinggi stabil.
  const first = new Date(cursor);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));

  const monthLabel = cursor.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const shift = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div className="calendar-wrap">
      <div className="calendar-bar">
        <div className="calendar-title serif">{monthLabel}</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><Icon name="chevronLeft" size={14} /></button>
          <button className="btn btn-secondary btn-sm" onClick={() => { const t = new Date(todayStr + "T00:00:00"); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); }}>Hari ini</button>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={() => shift(1)} aria-label="Bulan berikutnya"><Icon name="chevronRight" size={14} /></button>
        </div>
      </div>

      <div className="calendar">
        {DAYS.map((d) => <div key={d} className="calendar-dow">{d}</div>)}
        {cells.map((date) => {
          const key = ymd(date);
          const inMonth = date.getMonth() === cursor.getMonth();
          const items = byDay[key] || [];
          const isToday = key === todayStr;
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div
              key={key}
              className={`calendar-cell ${inMonth ? "" : "is-out"} ${weekend ? "is-weekend" : ""} ${overDay === key ? "is-drop" : ""}`}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverDay(key); } }}
              onDragLeave={() => setOverDay((d) => (d === key ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                const task = tasks.find((t) => t.id === dragId);
                setDragId(null);
                setOverDay(null);
                if (task && task.due !== key) onMoveDue(task, key);
              }}
            >
              <div className={`calendar-date ${isToday ? "is-today" : ""}`}>{date.getDate()}</div>
              <div className="calendar-items">
                {items.slice(0, 4).map((t) => {
                  const c = clientOf(t.client);
                  const draggable = canEditTask(t);
                  return (
                    <button
                      key={t.id}
                      className={`calendar-chip ${t.column === "done" ? "is-done" : ""} ${isOverdue(t.due, t.column, todayStr) ? "is-late" : ""}`}
                      style={{ "--chip": c.color }}
                      draggable={draggable}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); setDragId(t.id); }}
                      onDragEnd={() => { setDragId(null); setOverDay(null); }}
                      onClick={() => onOpen(t)}
                      title={`${c.name} · ${t.title}`}
                    >
                      <span className="dot" style={{ background: c.color, width: 6, height: 6 }} />
                      <span className="calendar-chip-text">{t.title}</span>
                    </button>
                  );
                })}
                {items.length > 4 && <span className="calendar-more">+{items.length - 4} lagi</span>}
              </div>
            </div>
          );
        })}
      </div>

      {undated.length > 0 && (
        <div className="calendar-undated">
          <span className="text-muted">Tanpa deadline / ongoing:</span>
          {undated.map((t) => (
            <button key={t.id} className="calendar-chip" style={{ "--chip": clientOf(t.client).color }} onClick={() => onOpen(t)}>
              <span className="dot" style={{ background: clientOf(t.client).color, width: 6, height: 6 }} />
              <span className="calendar-chip-text">{t.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
