---
name: Traicker
description: Ruang kerja internal agency — tugas klien, content plan, report, dan beban kerja tim.
colors:
  paper: "#f6f5f1"
  surface: "#ffffff"
  surface-raised-soft: "#fbfaf7"
  sunken: "#efede7"
  hover: "#ecebe5"
  ink: "#191917"
  ink-soft: "#44433e"
  muted: "#6a6862"
  faint: "#b5b2aa"
  line: "#e6e3dc"
  line-strong: "#d6d2c8"
  on-ink: "#fafaf8"
  brand-red: "#d4141c"
  danger: "#b4453f"
  danger-bg: "#f8eae8"
  warn: "#965a0b"
  warn-bg: "#faf0df"
  ok: "#1f7a5a"
  ok-bg: "#e5f1eb"
  info: "#3d6fa6"
  info-bg: "#e8eff7"
  status-todo: "#a19d93"
  status-progress: "#c98a1a"
  status-review: "#3d6fa6"
  status-done: "#1f7a5a"
  dark-paper: "#171717"
  dark-surface: "#212121"
  dark-surface-raised-soft: "#1b1b1b"
  dark-sunken: "#1a1a1a"
  dark-hover: "#2b2b2b"
  dark-ink: "#e2e2e2"
  dark-ink-soft: "#bcbcbc"
  dark-muted: "#8e8e8e"
  dark-faint: "#5f5f5f"
  dark-line: "#2e2e2e"
  dark-line-strong: "#3d3d3d"
  dark-brand-red: "#ff5a4d"
typography:
  display:
    fontFamily: "Figtree, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.05em"
  numeric:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tnum"
  section:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
  brand:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
  input-touch:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  panel-title:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 650
  ui-large:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  ui:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
  caption:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  meta:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 400
  badge:
    fontFamily: "Figtree, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
rounded:
  sm: "6px"
  md: "6px"
  lg: "6px"
  inner: "4px"
  logo: "8px"
  sheet: "14px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 14px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    height: "34px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "34px"
    padding: "0 11px"
  select-toolbar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    height: "32px"
  select-toolbar-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px"
  board-column:
    backgroundColor: "{colors.sunken}"
    rounded: "{rounded.lg}"
    padding: "6px"
  nav-item-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "32px"
  chip-approval-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn}"
    rounded: "{rounded.sm}"
    height: "22px"
    padding: "0 8px"
---

# Design System: Traicker

## Overview

**Creative North Star: "The Tidy Desk"**

Traicker is a desk a team works at all day. Everything has a place, nothing shouts, and the surface itself stays quiet so the work on it can be read at a glance. Warm paper in light mode, neutral graphite in dark mode, dark ink, and hairline rules carry the whole interface; color appears only when it means something: a client's identity dot, a task's status, a missed deadline, or the red "ai" in the name.

Density is moderate and operational. Pages open with a compact head (bold title, then one meta line that starts with the workspace name and its counts, e.g. "Project   6 tugas   1 selesai", the parts separated by space alone) followed straight by the work: a board, a calendar, a table, a report, or cards per person. Components are calm and precise: small consistent corners, thin borders, short labels, and controls that look like controls without decoration. The owner explicitly rejects interfaces that feel "AI-generated" or cheap, and needs dark mode to be easy on the eyes for long sessions.

**Key Characteristics:**
- One typeface (Figtree) for everything; hierarchy comes from weight and size, never from a second family.
- Color is semantic, not decorative: client colors, status colors, deadline states, brand red.
- Flat surfaces separated by tone and 1px lines; shadows only on things that float.
- Uniform small corners (6px) across buttons, fields, cards, columns, dialogs.
- Numbers use tabular figures so columns of dates and counts line up.

## Colors

A restrained neutral system with a single brand red and a small semantic set; in light mode the neutrals lean warm like paper, in dark mode they are pure neutral grey with no brown or red cast.

### Primary
- **Traicker Red** (`brand-red`, dark: `dark-brand-red`): the "ai" in the Traicker wordmark and the logo gradient. Reserved for brand moments; never used for buttons, links, or status.

### Neutral
- **Desk Paper** (`paper`, dark: `dark-paper`): page background.
- **Sheet White** (`surface`, dark: `dark-surface`): cards, panels, drawers, dialogs, inputs.
- **Soft Sheet** (`surface-raised-soft`, dark: `dark-surface-raised-soft`): table headers, hover rows, quiet sub-panels.
- **Tray Grey** (`sunken`, dark: `dark-sunken`): board columns, segmented control tracks, recessed areas.
- **Ink** (`ink`, dark: `dark-ink`): primary text and the primary button fill. Dark-mode ink is deliberately below pure white to avoid glare.
- **Soft Ink** (`ink-soft`) and **Muted** (`muted`): secondary text, labels, metadata, and input placeholders. Muted is tuned to ≥4.5:1 on paper and white.
- **Faint** (`faint`): decorative icons, empty-state marks, and disabled states only; never for text someone needs to read.
- **Hairline** (`line`) and **Rule** (`line-strong`): borders and dividers; Rule for input outlines and secondary buttons.

### Semantic
- **Status set** (`status-todo`, `status-progress`, `status-review`, `status-done`): ring-shaped status dots on board columns and stage pickers. Content stages reuse the same family (Revisi uses `danger`, Terjadwal a violet).
- **Danger / Warn / OK / Info** with their `-bg` tints: overdue dates, approval chips ("Menunggu klien" warn, "Disetujui" ok, "Minta revisi" danger), deltas in reports, role badges (Admin ok, Manager info).
- **Client colors**: each client carries its own color, shown only as a small dot or swatch beside its name.
- **Platform colors**: Instagram `#C13584`, LinkedIn `#0A66C2`, shown as small badges and as report chart marks.

### Named Rules
**The Meaning-Only Rule.** If a color does not identify a client, a platform, a status, a deadline state, or the brand, it is a neutral.

**The No-Glare Rule.** Dark mode never uses pure black backgrounds or pure white text, and never tints neutrals brown or red.

## Typography

**Display Font:** Figtree (with ui-sans-serif, system-ui, Segoe UI fallback)
**Body Font:** Figtree
**Label/Mono Font:** none; numbers use Figtree with tabular figures

**Character:** a single friendly-geometric grotesk used firmly: bold, tight-tracked titles over quiet regular text.

### Hierarchy
- **Display** (700, 30px, 1.1, -0.03em): page titles ("Semua klien", "Siapa sedang mengerjakan apa"); 26–28px on tablet and phone.
- **Headline** (650, 24px, 1.2): the editable task/content title in the detail drawer.
- **Title** (650, 20px, 1.2): dialog titles; month labels in calendar and report use 650 at 19–22px.
- **Body** (400, 13–14px, 1.5): cards, tables, form fields, comments. Phones bump fields to 16px so iOS does not zoom.
- **Label** (500, 11px, 0.05em, uppercase): table column headers, list labels, report tile labels. Never placed above a page title.
- **Panel title** (650, 15px, -0.015em, sentence case): report cards and checklists; platform sections in reports use 700 at 18px.

### Named Rules
**The One Family Rule.** Figtree only. No serif display faces, no italics for emphasis, no monospace for numbers.

**The Tabular Rule.** Any number that can sit in a column (dates, counts, metrics, deltas) uses tabular figures.

## Layout

App shell: a 224px sidebar (brand, workspace switch, Beban kerja tim, client list, admin tools) beside a main column with a sticky 60px topbar (search, primary "new" button, notifications, account). Content blocks sit under a page head and use horizontal padding of 24px on desktop, 20px at ≤1100px, and 16px at ≤640px.

Spacing rhythm is 4/8/12/16/24px, with flex/grid gaps between siblings. Boards are horizontal columns (220–380px each); report tiles use a 6-column grid that drops to 3 then 2; cards-per-person use auto-fill columns of at least 300px.

Responsive behavior: at ≤1100px the sidebar becomes an off-canvas drawer opened from the topbar; at ≤640px the "new" action becomes a floating button, detail drawers go full screen, dialogs, popovers, and dropdown menus become bottom sheets over a dimmed scrim, and toolbars become a two-column grid. Touch devices (`hover: none`) reveal controls that are hover-only on desktop.

## Elevation & Depth

Flat by default, with depth expressed through tone: paper → tray grey (columns, tracks) → white sheets (cards, panels). Resting cards carry only a 1px hairline and an almost invisible shadow. Real shadows appear only on layers that float above the page.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 1px rgba(25,25,23,0.03)`): cards and secondary buttons at rest.
- **Lift** (`box-shadow: 0 1px 2px rgba(25,25,23,0.05), 0 1px 1px rgba(25,25,23,0.03)`): active segmented tab, active nav item, primary button.
- **Float** (`box-shadow: 0 24px 60px -16px rgba(25,25,23,0.28), 0 4px 12px -4px rgba(25,25,23,0.08)`): drawers, dialogs, popovers, dropdown menus.

### Named Rules
**The Float-Only Shadow Rule.** A visible shadow means "this is above the page and can be dismissed". Nothing that sits in the page flow gets one.

## Shapes

One small corner everywhere: 6px on buttons, fields, cards, board columns, drawers, dialogs, menus, and chips; inner elements of a 6px container step down to 4px (segmented tabs, badges). Full rounding is reserved for things that are naturally round: avatars, status dots, notification count badges, and the theme/icon buttons. Borders are 1px hairlines; the status dot is a 2px ring that fills as work progresses.

## Components

### Buttons
Calm and exact; they read as controls through fill and border, not decoration.
- **Shape:** 6px corners, 34px tall, 0 14px padding, 13px medium text, icon gap 6px.
- **Primary:** Ink fill with near-white text and the Lift shadow; one per area ("Tugas baru", "Simpan").
- **Secondary:** white sheet with a Rule border and Soft Ink text.
- **Ghost / Danger-ghost:** transparent; danger variant uses danger text for delete actions.
- **Hover / Focus:** background and border shift in 150ms; keyboard focus shows a 3px soft ring.

### Chips
- **Approval chips:** 22px tall, 6px corners, tinted background with matching text (warn, ok, danger), never color alone.
- **Platform badge:** small filled rectangle in the platform color with a white two-letter code (IG, IN).
- **Client tag:** a 7–8px client-color dot beside the client's short name in muted text.

### Cards / Containers
- **Corner Style:** 6px.
- **Background:** white sheet on paper; board columns sit in Tray Grey with 6px padding.
- **Shadow Strategy:** Rest only (see Elevation).
- **Border:** 1px Hairline.
- **Internal Padding:** 12px on task cards; 14–18px on report and person cards.

### Inputs / Fields
- **Style:** 34px tall, 1px Rule outline, white sheet, 6px corners, 11px side padding.
- **Focus:** border shifts to Soft Ink with a 3px soft ink ring.
- **In detail drawers:** fields are borderless and transparent until hovered or focused, so the drawer reads like a document.
- **Disabled:** Soft Sheet background, muted text, not-allowed cursor.

### Dropdowns
- **Trigger:** matches its context (toolbar pill, form field, or borderless property row); a chevron rotates when open.
- **Menu:** white sheet, 6px corners, Float shadow, rendered above everything; options carry a leading identity mark (avatar, client dot, platform badge, status dot) and a check on the selected one. Lists over 8 items get a search box. On phones the menu becomes a bottom sheet.

### Feedback (toast & confirm)
- **Undo toast:** dark ink bar at the bottom center (above the floating button on phones), message plus one action ("Urungkan") and a close button; destructive actions on tasks and content wait ~8s before they are committed.
- **Confirm dialog:** Traicker's own small dialog (never the browser's `window.confirm`); title states the question, body states the consequence, buttons read as actions ("Hapus akun", "Buang", "Lanjut edit", "Simpan"). Initial focus sits on the safe choice. On phones it becomes a bottom sheet.

### Report stat strip
Platform metrics sit in one framed strip divided by hairlines (not separate boxes inside a box). Tile labels are 11px uppercase muted; values are 18–20px tabular. The Monday checklist ("Yang perlu diisi untuk report minggu ini") leads the weekly report; recap tables are folded behind "Lihat rekap…", and trend charts appear only once there are at least two data points.

### Navigation
- **Sidebar items:** 32px rows, 13px text; the active item becomes a white sheet with the Lift shadow and a hairline ring. Counts sit right-aligned in muted tabular figures.
- **Workspace switch & view switch:** segmented control in Tray Grey; the active tab becomes a white sheet.
- **Mobile:** sidebar slides in from the left over a scrim.

### Status Dot (signature)
A 9px ring in the status color that fills as work advances (empty for to-do, half for in progress/review, full for done). Used on board columns, stage pickers, and dropdown options, so status is legible without reading the label.

## Do's and Don'ts

### Do:
- **Do** keep every surface neutral and let client, platform, status, and deadline colors be the only color on screen.
- **Do** use Figtree at 700 with -0.03em tracking for page titles, and 11px uppercase labels with 0.05em tracking for column headers and tile labels.
- **Do** make every clickable card and table row reachable with Tab and openable with Enter, with a 2px Soft Ink focus outline.
- **Do** use 6px corners for every box-like element and full rounding only for naturally round things.
- **Do** reserve visible shadows for drawers, dialogs, popovers, and menus.
- **Do** show numbers with tabular figures and show overdue dates in danger red.

### Don't:
- **Don't** use a serif or italic display face, or monospace for numbers; the owner rejected both as feeling cheap and "AI".
- **Don't** use pure black backgrounds, pure white text, or brown/red-tinted greys in dark mode.
- **Don't** use Traicker Red for buttons, links, or status; it belongs to the brand mark and the "ai".
- **Don't** use blue as a general accent; info blue is a status color only.
- **Don't** add gradients anywhere except the logo.
- **Don't** place a small uppercase label (kicker/eyebrow) above a heading; put the workspace name in the meta line instead.
- **Don't** use the middle dot (·) as a separator anywhere, in UI text or tooltips. Separate parts with spacing, a comma, or a new line; the owner reads it as an AI-generated tell.
- **Don't** use red for "today" markers; red means overdue or brand.
