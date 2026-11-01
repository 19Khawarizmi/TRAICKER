# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tim internal satu agency marketing communication (pemilik: "Ai", Senior Marketing Communication). Tidak dijual ke pihak luar.

- **Admin** — pemilik. Semua kuasa: kelola anggota, klien, platform, target KPI, dan kuota kontrak.
- **Manager** — memantau seluruh pekerjaan, berkomentar, membuat dan menugaskan tugas/konten ke siapa saja. Tidak mengelola anggota, klien, platform, target, atau kuota; menghapus hanya yang dia buat.
- **Member** — mengerjakan tugas dan konten yang ditugaskan ke dirinya. Punya satu jabatan sebagai label (Social Media Specialist, Graphic Designer, Video Editor, Copywriter, dan jabatan lain yang ditambah admin).

Situasi kerja: sebagian besar di laptop/PC kantor; HP dipakai sesekali untuk cek cepat, komentar, dan notifikasi.

## Product Purpose

Satu tempat bagi tim agency untuk tahu siapa mengerjakan apa untuk klien mana, sampai kapan, dan bagaimana performa konten sosial medianya. Sukses berarti tim tidak perlu lagi bertanya lewat chat soal status pekerjaan, report mingguan/bulanan bisa disusun dari data di Traicker, dan pembagian kerja bisa diputuskan dengan melihat beban tiap orang.

## Positioning

Alat kerja internal yang dibentuk mengikuti alur kerja agency ini sendiri: dua ruang kerja (Project untuk tugas klien non-sosmed, Content plan untuk konten sosial media), report yang mengikuti format tracker Excel tim, dan nama "Traicker" yang memuat nama panggilan pemilik ("ai").

## Operating Context

- **Project:** papan tugas Perlu Dikerjakan → Sedang Berjalan → Review → Selesai, dengan subtask (pemegang, link, catatan, lampiran ≤ 4MB), komentar, riwayat aktivitas, kalender, dan timeline. Export Excel untuk tugas selesai.
- **Content plan:** konten per klien dan platform (utama: Instagram, LinkedIn; platform bisa diatur admin) melewati tahap Content Brief → Produksi → Review internal → Revisi → Terjadwal → Tayang. Dua PIC per konten: sosmed specialist dan kreatif. Approval klien ditandai manual di app.
- **Report mingguan** (disusun setiap Senin untuk Senin–Minggu sebelumnya): dari angka performa per konten (likes, komentar, share, repost, saved, klik/profile visit, follow, impressions, reach) dan followers akhir minggu. Export Excel mengikuti susunan tracker tim.
- **Report bulanan** (setelah bulan selesai): angka akun disalin manual dari Instagram/LinkedIn Insights untuk tanggal 1–akhir bulan. Hanya dilihat di app, angkanya lalu disalin ke deck presentasi klien.
- **Beban kerja tim:** daftar pekerjaan belum selesai per orang, dipakai untuk informasi tim dan saat membagi pekerjaan.
- Realtime: perubahan anggota lain langsung muncul; notifikasi di lonceng untuk penugasan dan komentar.

## Capabilities and Constraints

- Next.js (App Router) + React 18 di Vercel; Supabase (Postgres, Auth, Storage, Realtime). Hak akses dijaga aturan database (RLS), bukan hanya tampilan.
- Database dipakai bersama oleh localhost dan versi live.
- Organik dulu: angka iklan (CPC, budget, CTR) belum dicatat. Angka diisi manual; integrasi API Meta/LinkedIn belum ada.
- Rumus report: Engagement = likes + komentar + share + repost + saved; ER = total engagement ÷ total reach (bukan rata-rata ER per konten); ER/Reach bulanan = engagement ÷ reach dari Insights.
- Beban kerja ditampilkan sebagai jumlah dan daftar pekerjaan, tanpa skor kapasitas, karena jam kerja dan bobot tugas tidak dicatat.
- Auto logout setelah 30 menit tidak aktif. Password hanya bisa diganti, tidak bisa dilihat siapa pun.

## Brand Commitments

- Nama **Traicker**, dengan "ai" ditonjolkan karena itu nama panggilan pemilik.
- Logo: huruf A dengan siluet orang (kepala dan bahu) di dalamnya, gradient merah. File: `public/brand/ai-mark.svg`, `public/brand/ai-mark-square.svg`; komponen `components/BrandMark.jsx`.
- Pemilik tidak menyukai tampilan yang terasa "AI slop" atau murah; mode gelap harus nyaman di mata.
- Bahasa antarmuka: Indonesia santai-profesional. Istilah marketing yang lazim (reach, engagement, brief, insight) tetap bahasa Inggris.

## Evidence on Hand

- Data nyata tim di Supabase (klien, tugas, konten). Contoh format report klien: tracker Excel tim dan slide "Instagram Overview" (followers, reach, engagement, impression/views, profile visits, jumlah post).
- Tidak ada testimoni, studi kasus, atau klaim publik. Data klien (mis. daftar pembeli tiket) sengaja tidak dimasukkan ke Traicker.

## Product Principles

1. **Status pekerjaan harus bisa dibaca tanpa bertanya.** Siapa, apa, klien mana, kapan, dan sudah sampai mana terlihat di satu tempat.
2. **Angka apa adanya, bukan angka karangan.** Rumus report konsisten dan dijelaskan; tidak ada skor yang terlihat meyakinkan tapi tidak berdasar data.
3. **Mengikuti cara kerja tim, bukan sebaliknya.** Format report, tahap konten, dan peran meniru praktik agency yang sudah berjalan.
4. **Aman dipakai bersama.** Perubahan rekan tidak tertimpa, hak akses dijaga di database, dan data sensitif tetap di luar.
5. **Tenang untuk dipakai seharian.** Ini alat kerja harian; kejelasan dan kenyamanan mata lebih penting daripada efek.
