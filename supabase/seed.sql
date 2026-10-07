-- Seed dari mock data di components/AgencyTracker.jsx (CLIENTS + seedTasks).

insert into public.clients (id, name, short_name, color, tint, sort_order) values
  ('immfc', 'IMMFC Connect 2026', 'IMMFC', '#0E7C7B', '#E4F3F1', 1),
  ('iffina', 'IFFINA+', 'IFFINA', '#3D6FA6', '#E5EDF6', 2),
  ('ihfi', 'IHFI', 'IHFI', '#8B6A3F', '#F1EAE0', 3),
  ('interzum', 'Interzum Jakarta', 'Interzum', '#5A7D3A', '#EAF0E2', 4),
  ('denspace', 'Ferdinand / Den&space', 'Den&space', '#C97A1A', '#FBEEDD', 5),
  ('idw', 'IDW 2026', 'IDW', '#5B4EA8', '#ECE9F7', 6),
  ('tapaktumbuh', 'Tapak Tumbuh (JIA Curated)', 'Tapak Tumbuh', '#B4453F', '#F8E9E8', 7),
  ('internal', 'Internal / Up+Above', 'Internal', '#6B6A64', '#EEEDE8', 8);

with seed (pos, title, client_id, priority, due_date, status, subs) as (
  values
    (1, 'Content plan IG/LinkedIn Agustus', 'immfc', 'Tinggi', date '2026-08-05', 'progress',
      '[{"t":"Request kalender event IMMFC Agustus","d":false},{"t":"Request moodboard visual dari klien","d":false}]'::jsonb),
    (2, 'Executive summary deck', 'immfc', 'Sedang', date '2026-08-01', 'review',
      '[{"t":"Ambil data performa Q2","d":true},{"t":"Approval logo terbaru","d":false}]'),
    (3, 'Mailchimp performance review deck', 'immfc', 'Rendah', date '2026-07-20', 'done',
      '[{"t":"Export data open rate & CTR dari Mailchimp","d":true}]'),
    (4, 'Analisis penempatan billboard OOH Jakarta', 'interzum', 'Sedang', date '2026-08-10', 'todo',
      '[{"t":"Konfirmasi budget OOH","d":false},{"t":"Daftar lokasi prioritas dari klien","d":false}]'),
    (5, 'Ad copy LinkedIn targeting exhibitor', 'iffina', 'Rendah', date '2026-07-22', 'done',
      '[{"t":"Referensi profil exhibitor target","d":true},{"t":"Tone of voice brand","d":true}]'),
    (6, 'Carousel post Halal Bi Halal', 'ihfi', 'Rendah', date '2026-07-18', 'done',
      '[{"t":"Foto dokumentasi acara dari klien","d":true}]'),
    (7, 'VO script video ad - positioning client-side consultant', 'denspace', 'Tinggi', date '2026-08-02', 'progress',
      '[{"t":"Brief positioning terbaru","d":true},{"t":"Referensi tone VO","d":false}]'),
    (8, 'Laporan performa sosmed - Juni', 'denspace', 'Rendah', date '2026-07-15', 'done',
      '[{"t":"Data insight IG bulan Juni","d":true},{"t":"Data insight TikTok bulan Juni","d":true}]'),
    (9, 'Deck optimasi ads flow (click-to-chat gap)', 'denspace', 'Tinggi', date '2026-07-31', 'review',
      '[{"t":"Akses Meta Ads Manager","d":true},{"t":"Data funnel click-to-chat","d":true}]'),
    (10, 'Template WhatsApp automation', 'denspace', 'Sedang', date '2026-08-08', 'todo',
      '[{"t":"List pertanyaan FAQ","d":false},{"t":"Alur respons dari tim sales klien","d":false}]'),
    (11, 'Content plan Juli dari script library', 'denspace', 'Sedang', date '2026-08-01', 'progress',
      '[{"t":"Akses script library","d":true},{"t":"Jadwal posting yang disepakati","d":false}]'),
    (12, 'Brief signage Townhall Totem', 'idw', 'Sedang', date '2026-08-12', 'todo',
      '[{"t":"Denah lokasi totem","d":false},{"t":"Ukuran signage dari venue","d":false}]'),
    (13, 'Icon set template Instagram', 'idw', 'Rendah', date '2026-08-06', 'progress',
      '[{"t":"Request brand guideline warna IDW 2026","d":true},{"t":"Request brand guideline font IDW 2026","d":false}]'),
    (14, 'Dokumen partnership guideline (sizing + bilingual copy)', 'idw', 'Tinggi', date '2026-08-03', 'review',
      '[{"t":"Copy final versi Inggris","d":true},{"t":"Copy final versi Indonesia","d":true},{"t":"Review legal","d":false}]'),
    (15, 'Brief teaser video 15 detik (4 frame)', 'tapaktumbuh', 'Tinggi', date '2026-08-04', 'progress',
      '[{"t":"Storyboard 4 frame","d":true},{"t":"Referensi musik dari kurator JIA","d":false}]'),
    (16, 'Sourcing stock footage', 'tapaktumbuh', 'Sedang', date '2026-08-05', 'todo',
      '[{"t":"Konfirmasi budget lisensi footage","d":false},{"t":"Tema visual yang dibutuhkan","d":false}]'),
    (17, 'Rencana konten sosial kolaborator', 'tapaktumbuh', 'Rendah', date '2026-08-09', 'todo',
      '[{"t":"Daftar kolaborator","d":false},{"t":"Handle sosial media masing-masing","d":false}]')
),
ins as (
  insert into public.tasks (title, client_id, priority, due_date, status, position)
  select title, client_id, priority, due_date, status, pos from seed order by pos
  returning id, position
)
insert into public.subtasks (task_id, text, done, position)
select ins.id, s.value->>'t', (s.value->>'d')::boolean, s.ordinality::int
from ins
join seed on seed.pos = ins.position
cross join lateral jsonb_array_elements(seed.subs) with ordinality as s(value, ordinality);
