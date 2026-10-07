-- Klien bisa diarsipkan: disembunyikan dari sidebar, pilihan klien, dan board, tapi datanya tetap ada.
-- Hapus permanen hanya bisa kalau klien tidak punya task (FK tasks.client_id menolak penghapusan).
alter table public.clients add column archived_at timestamptz;
