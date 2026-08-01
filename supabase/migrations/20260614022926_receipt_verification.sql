-- ============================================================
-- Migration: AI receipt verification fields
-- Run in: Supabase Dashboard > SQL Editor > New query
-- ============================================================

alter table public.profiles
  add column if not exists fee_receipt_verified      boolean not null default false,
  add column if not exists fee_receipt_amount        text    not null default '',
  add column if not exists fee_receipt_date          text    not null default '',
  add column if not exists fee_receipt_expiry        date,
  add column if not exists fee_receipt_reject_reason text    not null default '';
