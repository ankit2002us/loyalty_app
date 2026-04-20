-- Loyalty coupons schema (Supabase / Postgres)
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Coupon "scope" controls minimum booking checks.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'coupon_scope') then
    create type public.coupon_scope as enum ('flight', 'domestic', 'international');
  end if;
end $$;

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),

  -- Code is 12 chars (can be numeric-only or mixed alphanumeric).
  code varchar(12) not null unique,

  scope public.coupon_scope not null,
  discount_inr int not null check (discount_inr in (100, 500, 1000)),
  min_amount_inr int not null,

  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,

  -- Optional: lock coupon to a phone last-6 digits if provided at issue time.
  issued_to_name text,
  issued_to_phone_last6 varchar(6),

  -- Redemption audit
  redeemed_at timestamptz,
  redeemed_booking_id text,
  redeemed_user_id uuid,
  redeemed_booking_amount_inr int,
  redeemed_booking_scope public.coupon_scope,

  metadata jsonb not null default '{}'::jsonb
);

create index if not exists coupons_expires_at_idx on public.coupons (expires_at);
create index if not exists coupons_redeemed_at_idx on public.coupons (redeemed_at);

-- Lock down table (recommended): only your server uses service role key.
alter table public.coupons enable row level security;
revoke all on table public.coupons from anon, authenticated;

-- Atomic redeem function: prevents double-redeem race conditions.
create or replace function public.redeem_coupon(
  p_code text,
  p_booking_id text,
  p_user_id uuid,
  p_booking_amount_inr int,
  p_booking_scope public.coupon_scope,
  p_phone_last6 text default null
)
returns table(
  code varchar,
  scope public.coupon_scope,
  discount_inr int,
  min_amount_inr int,
  issued_at timestamptz,
  expires_at timestamptz,
  redeemed_at timestamptz
)
language plpgsql
as $$
begin
  return query
  update public.coupons c
     set redeemed_at = now(),
         redeemed_booking_id = p_booking_id,
         redeemed_user_id = p_user_id,
         redeemed_booking_amount_inr = p_booking_amount_inr,
         redeemed_booking_scope = p_booking_scope
   where c.code = p_code
     and c.redeemed_at is null
     and c.expires_at > now()
     and c.scope = p_booking_scope
     and p_booking_amount_inr >= c.min_amount_inr
     and (
       c.issued_to_phone_last6 is null
       or (p_phone_last6 is not null and c.issued_to_phone_last6 = p_phone_last6)
     )
  returning c.code, c.scope, c.discount_inr, c.min_amount_inr, c.issued_at, c.expires_at, c.redeemed_at;

  if not found then
    raise exception 'INVALID_OR_EXPIRED_OR_ALREADY_REDEEMED_OR_NOT_ELIGIBLE';
  end if;
end;
$$;

