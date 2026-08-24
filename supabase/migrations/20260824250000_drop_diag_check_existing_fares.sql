-- Cleanup — the temporary diagnostic used to verify validate_ride_order_fare
-- against real data before trusting it (20260824241000/242000/243000).
-- Confirmed clean: the only 25 rows it flagged were all completed/cancelled
-- bookings whose fare was legitimately set later via set_ride_fare, not a
-- transcription error or evidence of tampering. No longer needed.
drop function if exists public.diag_check_existing_fares();
