"use client";

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/icons";

// Dropdown pengganti <select> bawaan browser.
//
//   <Select value onChange={(v) => …} options={[{ value, label, leading?, description?, group?, disabled? }]} />
//
// variant  : "toolbar" (pill di toolbar; `active` = filter sedang dipakai) | "field" (form) |
//            "prop" (baris properti di panel detail, tanpa bingkai) | "icon" (tombol kecil, mis. pindah kolom di kartu)
// Menu dirender di <body> supaya tidak terpotong panel/kartu. Di HP (≤ 640px) muncul dari bawah layar.
// Keyboard: ↑ ↓ Home End untuk memilih, Enter untuk menyimpan, Esc untuk menutup, ketik huruf untuk melompat.

// Tombol memakai gaya isian yang sudah ada (.select = pill toolbar, .field = isian form) supaya serasi.
const BASE_CLASS = { toolbar: "select", field: "field", prop: "field", icon: "" };
const MENU_GAP = 6;
const MENU_MAX_H = 320;

export default function Select({
  value,
  onChange,
  options,
  variant = "field",
  active = false,
  disabled = false,
  placeholder = "Pilih…",
  ariaLabel,
  title,
  icon,
  searchable,
  searchPlaceholder = "Cari…",
  triggerLeading = true,
  menuWidth,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const typeahead = useRef({ text: "", at: 0 });
  const id = useId();

  const canSearch = searchable ?? options.length > 8;
  const selected = options.find((o) => o.value === value) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => `${o.label} ${o.description || ""}`.toLowerCase().includes(q));
  }, [options, query]);

  function place() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(menuWidth || 0, variant === "icon" ? 220 : r.width, 200);
    const below = window.innerHeight - r.bottom;
    const up = below < Math.min(MENU_MAX_H, 220) && r.top > below;
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setPos(up ? { left, width, bottom: window.innerHeight - r.top + MENU_GAP, up } : { left, width, top: r.bottom + MENU_GAP, up });
  }

  function openMenu() {
    if (disabled) return;
    place();
    setQuery("");
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }

  function choose(option) {
    if (!option || option.disabled) return;
    close();
    if (option.value !== value) onChange(option.value);
  }

  // Posisi menu ikut saat halaman/panel di-scroll atau jendela berubah ukuran.
  useEffect(() => {
    if (!open) return;
    const onMove = (e) => {
      if (listRef.current?.closest(".sel-menu")?.contains(e.target)) return;
      place();
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fokus ke kolom cari / daftar saat menu terbuka.
  useLayoutEffect(() => {
    if (!open) return;
    (canSearch ? searchRef.current : listRef.current)?.focus({ preventScroll: true });
  }, [open, canSearch]);

  // Pilihan aktif selalu terlihat.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function step(from, dir) {
    if (filtered.length === 0) return -1;
    let i = from;
    for (let n = 0; n < filtered.length; n++) {
      i = (i + dir + filtered.length) % filtered.length;
      if (!filtered[i].disabled) return i;
    }
    return from;
  }

  function onTriggerKey(e) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openMenu();
    }
  }

  function onMenuKey(e) {
    // Esc di sini jangan sampai ikut menutup panel/dialog di belakangnya.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "Tab") {
      close(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => step(i, e.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      if (canSearch && e.target === searchRef.current) return;
      e.preventDefault();
      setActiveIndex(e.key === "Home" ? step(-1, 1) : step(filtered.length, -1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      choose(filtered[activeIndex]);
      return;
    }
    // Ketik huruf untuk melompat (kalau tidak ada kolom cari).
    if (!canSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const t = typeahead.current;
      t.text = now - t.at > 700 ? e.key.toLowerCase() : t.text + e.key.toLowerCase();
      t.at = now;
      const i = filtered.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.text));
      if (i >= 0) setActiveIndex(i);
    }
  }

  const triggerLabel = selected ? selected.label : placeholder;
  const showLeading = triggerLeading && selected?.leading;
  const listId = `${id}-list`;

  let lastGroup;
  const menu = open && pos && (
    <>
      <div className="sel-scrim" onMouseDown={(e) => { e.preventDefault(); close(); }} />
      <div
        className={`sel-menu ${pos.up ? "is-up" : ""}`}
        style={{ "--sel-left": `${pos.left}px`, "--sel-width": `${pos.width}px`, "--sel-top": pos.top != null ? `${pos.top}px` : "auto", "--sel-bottom": pos.bottom != null ? `${pos.bottom}px` : "auto" }}
        onKeyDown={onMenuKey}
      >
        {ariaLabel && <div className="sel-sheet-title">{ariaLabel}</div>}
        {canSearch && (
          <div className="sel-search">
            <Icon name="search" size={14} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
            />
          </div>
        )}
        <ul
          ref={listRef}
          id={listId}
          className="sel-list"
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={!canSearch && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
        >
          {filtered.length === 0 && <li className="sel-empty">Tidak ada yang cocok</li>}
          {filtered.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? <li className="sel-group" role="presentation">{o.group}</li> : null;
            lastGroup = o.group;
            const isSelected = o.value === value;
            return (
              <React.Fragment key={String(o.value)}>
                {head}
                <li
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={o.disabled || undefined}
                  className={`sel-option ${i === activeIndex ? "is-active" : ""} ${isSelected ? "is-selected" : ""} ${o.disabled ? "is-disabled" : ""}`}
                  onMouseMove={() => i !== activeIndex && setActiveIndex(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o)}
                >
                  {o.leading && <span className="sel-leading">{o.leading}</span>}
                  <span className="sel-text">
                    <span className="sel-label">{o.label}</span>
                    {o.description && <span className="sel-desc">{o.description}</span>}
                  </span>
                  {isSelected && <Icon name="check" size={14} className="sel-check" />}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${BASE_CLASS[variant]} sel-trigger is-${variant} ${active ? "is-active" : ""} ${open ? "is-open" : ""} ${!selected ? "is-placeholder" : ""} ${className}`}
        onClick={(e) => { e.stopPropagation(); open ? close() : openMenu(); }}
        onKeyDown={onTriggerKey}
        disabled={disabled}
        title={title || (variant === "icon" ? ariaLabel : undefined)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={variant === "icon" ? ariaLabel : ariaLabel ? `${ariaLabel}: ${triggerLabel}` : undefined}
      >
        {variant === "icon" ? (
          icon
        ) : (
          <>
            {showLeading && <span className="sel-leading">{selected.leading}</span>}
            <span className="sel-value">{triggerLabel}</span>
            <Icon name="chevronDown" size={14} className="sel-chevron" />
          </>
        )}
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
