-- Temporary — grants execute on the read-only diagnostic function just
-- long enough to call it once with the anon key. Revoked in the cleanup
-- migration that follows.
grant execute on function public.diag_check_existing_fares() to anon;
