# Traicker

Task tracker internal Up+Above, dibangun dengan Next.js (App Router). Data tugas tersimpan di `localStorage` browser, jadi tetap ada setelah reload tanpa perlu backend.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka http://localhost:3000.

## Build untuk produksi

```bash
npm run build
npm run start
```

## Struktur

- `app/layout.js` — root layout dan metadata halaman.
- `app/page.js` — halaman utama, me-render komponen tracker.
- `app/globals.css` — reset dasar dan font.
- `components/AgencyTracker.jsx` — komponen utama: board kanban per klien, subtask, notifikasi tenggat, drag-and-drop antar kolom.

## Catatan

- Data disimpan di `localStorage` key `agency-tracker-tasks`, per browser/perangkat. Belum ada sinkronisasi antar perangkat atau penyimpanan terpusat.
- Lampiran file di subtask disimpan sebagai data URL di `localStorage`, jadi cocok untuk file kecil (maks 4MB per file).
