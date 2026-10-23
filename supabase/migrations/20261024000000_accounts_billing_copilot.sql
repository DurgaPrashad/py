-- Reflex Presenter: accounts, plans (Razorpay) and the AI Q&A copilot.
--
-- Plans: "Standard" (non-SI: the voice-following teleprompter for your own
-- script) and "SI" (Smart Intelligence: Standard plus the AI copilot that
-- answers questions asked on a call). Both are prepaid for a month or a year.
-- New accounts get a free trial of Standard and a few SI answers.
--
-- Everything server-side lives in Postgres, so the site itself stays static.
-- Secrets are kept in Supabase Vault and are never part of this repository:
--
--   select vault.create_secret('<razorpay key id>',     'razorpay_key_id');
--   select vault.create_secret('<razorpay key secret>', 'razorpay_key_secret');
--   select vault.create_secret('<anthropic api key>',   'anthropic_api_key');
--
-- (To replace one: select vault.update_secret(id, '<new value>') with the id
-- from vault.secrets.)

create extension if not exists http with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- private

-- Not exposed through the Data API; only the security-definer functions below read it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.plans (
  id text primary key,
  tier text not null check (tier in ('standard', 'si')),
  label text not null,
  amount integer not null,          -- smallest currency unit (cents)
  currency text not null,
  period interval not null
);

insert into private.plans (id, tier, label, amount, currency, period) values
  ('standard_monthly', 'standard', 'Reflex Standard · 1 month', 400, 'USD', interval '1 month'),
  ('standard_yearly', 'standard', 'Reflex Standard · 1 year', 2400, 'USD', interval '1 year'),
  ('si_monthly', 'si', 'Reflex SI · 1 month', 900, 'USD', interval '1 month'),
  ('si_yearly', 'si', 'Reflex SI · 1 year', 6900, 'USD', interval '1 year')
on conflict (id) do update
  set tier = excluded.tier, label = excluded.label, amount = excluded.amount, currency = excluded.currency, period = excluded.period;

create table if not exists private.settings (
  key text primary key,
  value text not null
);

insert into private.settings (key, value) values
  ('ai_model', 'claude-opus-5-5'),
  ('ai_effort', 'low'),
  ('ai_free_answers', '5'),
  ('trial_days', '7'),
  ('ai_daily_limit', '300'),
  ('signups_per_10min', '40')
on conflict (key) do nothing;

-- Usage counts only; questions and answers are not stored.
create table if not exists private.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  mode text not null,
  ok boolean not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_user_time on private.ai_requests (user_id, created_at desc);

create or replace function private.secret(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1
$$;

create or replace function private.setting(p_key text) returns text
language sql stable security definer set search_path = '' as $$
  select value from private.settings where key = p_key
$$;

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  trial_until timestamptz,
  standard_until timestamptz,
  si_until timestamptz,
  ai_answers_used integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users rename themselves" on public.profiles;
create policy "Users rename themselves" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, trial_until)
  values (new.id, coalesce(new.email, ''), nullif(new.raw_user_meta_data ->> 'full_name', ''),
          now() + make_interval(days => private.setting('trial_days')::integer))
  on conflict (id) do nothing;
  return new;
end
$$;

create or replace function private.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, ''), updated_at = now() where id = new.id;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Accounts created before this migration.
insert into public.profiles (id, email, full_name, created_at, trial_until)
select id, coalesce(email, ''), nullif(raw_user_meta_data ->> 'full_name', ''), created_at,
       created_at + make_interval(days => private.setting('trial_days')::integer)
from auth.users
on conflict (id) do nothing;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email) execute function private.handle_user_email_change();

-- ---------------------------------------------------------------- accounts

-- Creates an email + password account that can sign in straight away (the
-- client then calls signInWithPassword). This is what Supabase does with
-- "Confirm email" off; it avoids depending on the project's email sender.
create or replace function public.create_account(p_email text, p_password text, p_full_name text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
  v_id uuid := gen_random_uuid();
  v_recent integer;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Use a password of at least 6 characters.' using errcode = '22023';
  end if;
  if length(p_password) > 72 then
    raise exception 'Use a password of at most 72 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'An account with this email already exists. Sign in instead.' using errcode = '23505';
  end if;
  select count(*) into v_recent from auth.users where created_at > now() - interval '10 minutes';
  if v_recent >= private.setting('signups_per_10min')::integer then
    raise exception 'Too many sign-ups right now. Please try again in a few minutes.' using errcode = '53400';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    jsonb_strip_nulls(jsonb_build_object('full_name', v_name)), now(), now(),
    '', '', '', '', '', '', '', '',
    false, false
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
          'email', now(), now(), now());

  return jsonb_build_object('id', v_id, 'email', v_email);
end
$$;

-- ---------------------------------------------------------------- payments

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('standard_monthly', 'standard_yearly', 'si_monthly', 'si_yearly')),
  amount integer not null,
  currency text not null,
  razorpay_order_id text not null unique,
  razorpay_payment_id text unique,
  status text not null default 'created' check (status in ('created', 'paid')),
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_user on public.payments (user_id, created_at desc);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
drop policy if exists "Users read their own payments" on public.payments;
create policy "Users read their own payments" on public.payments
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function private.razorpay(p_method text, p_path text, p_body jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id text := private.secret('razorpay_key_id');
  v_secret text := private.secret('razorpay_key_secret');
  v_res extensions.http_response;
  v_json jsonb;
begin
  if v_id is null or v_secret is null then
    raise exception 'Payments are not configured yet.' using errcode = 'P0001';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '7000');
  v_res := extensions.http((
    p_method,
    'https://api.razorpay.com/v1' || p_path,
    array[extensions.http_header('Authorization', 'Basic ' || replace(encode(convert_to(v_id || ':' || v_secret, 'UTF8'), 'base64'), E'\n', ''))],
    'application/json',
    coalesce(p_body::text, '')
  )::extensions.http_request);
  begin
    v_json := v_res.content::jsonb;
  exception when others then
    v_json := jsonb_build_object('raw', left(v_res.content, 500));
  end;
  if v_res.status >= 300 then
    raise exception 'Payment provider error (%): %', v_res.status,
      coalesce(v_json #>> '{error,description}', v_json ->> 'raw', 'unknown error') using errcode = 'P0001';
  end if;
  return v_json;
end
$$;

-- Marks a payment paid and extends that plan's tier. Idempotent per payment.
create or replace function private.grant_plan(p_payment uuid, p_razorpay_payment_id text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_pay public.payments;
  v_plan private.plans;
  v_period interval;
  v_start timestamptz;
begin
  select * into v_pay from public.payments where id = p_payment for update;
  if v_pay.status = 'paid' then return; end if;
  select * into v_plan from private.plans where id = v_pay.plan;
  v_period := v_plan.period;
  select greatest(coalesce(case when v_plan.tier = 'si' then si_until else standard_until end, now()), now())
    into v_start from public.profiles where id = v_pay.user_id for update;
  if v_plan.tier = 'si' then
    update public.profiles set si_until = v_start + v_period, updated_at = now() where id = v_pay.user_id;
  else
    update public.profiles set standard_until = v_start + v_period, updated_at = now() where id = v_pay.user_id;
  end if;
  update public.payments
    set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, paid_at = now(),
        period_start = v_start, period_end = v_start + v_period
    where id = p_payment;
end
$$;

-- Captures an authorized payment (accounts with manual capture) and checks it
-- belongs to the order. Returns true when the money is captured.
create or replace function private.settle(p_pay public.payments, p_payment jsonb)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_status text := p_payment ->> 'status';
begin
  if p_payment ->> 'order_id' is distinct from p_pay.razorpay_order_id
     or (p_payment ->> 'amount')::integer <> p_pay.amount
     or upper(p_payment ->> 'currency') <> upper(p_pay.currency) then
    return false;
  end if;
  if v_status = 'authorized' then
    v_status := private.razorpay('POST', '/payments/' || (p_payment ->> 'id') || '/capture',
      jsonb_build_object('amount', p_pay.amount, 'currency', p_pay.currency)) ->> 'status';
  end if;
  if v_status = 'captured' then
    perform private.grant_plan(p_pay.id, p_payment ->> 'id');
    return true;
  end if;
  return false;
end
$$;

create or replace function public.create_checkout(p_plan text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_plan private.plans;
  v_profile public.profiles;
  v_order jsonb;
begin
  if v_user is null then
    raise exception 'Sign in to upgrade.' using errcode = '28000';
  end if;
  select * into v_plan from private.plans where id = p_plan;
  if not found then
    raise exception 'Unknown plan.' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles where id = v_user;

  v_order := private.razorpay('POST', '/orders', jsonb_build_object(
    'amount', v_plan.amount,
    'currency', v_plan.currency,
    'receipt', 'rx_' || left(replace(gen_random_uuid()::text, '-', ''), 24),
    'notes', jsonb_build_object('user_id', v_user, 'plan', v_plan.id, 'email', v_profile.email)
  ));

  insert into public.payments (user_id, plan, amount, currency, razorpay_order_id)
  values (v_user, v_plan.id, v_plan.amount, v_plan.currency, v_order ->> 'id');

  return jsonb_build_object(
    'key_id', private.secret('razorpay_key_id'),
    'order_id', v_order ->> 'id',
    'amount', v_plan.amount,
    'currency', v_plan.currency,
    'description', v_plan.label,
    'email', v_profile.email,
    'name', v_profile.full_name
  );
end
$$;

-- Called by the checkout success handler.
create or replace function public.confirm_payment(p_order_id text, p_payment_id text, p_signature text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_pay public.payments;
  v_expected text;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  select * into v_pay from public.payments where razorpay_order_id = p_order_id and user_id = v_user;
  if not found then
    raise exception 'Unknown order.' using errcode = '22023';
  end if;
  if v_pay.status <> 'paid' then
    v_expected := encode(extensions.hmac(convert_to(p_order_id || '|' || p_payment_id, 'UTF8'),
                                         convert_to(private.secret('razorpay_key_secret'), 'UTF8'), 'sha256'), 'hex');
    if v_expected <> lower(coalesce(p_signature, '')) then
      raise exception 'Payment could not be verified.' using errcode = '22023';
    end if;
    if not private.settle(v_pay, private.razorpay('GET', '/payments/' || p_payment_id)) then
      raise exception 'Payment is not complete yet. If you were charged, it will be applied automatically.' using errcode = 'P0001';
    end if;
  end if;
  return (select to_jsonb(p) from public.profiles p where id = v_user);
end
$$;

-- Applies any paid-but-unconfirmed orders (e.g. the tab closed right after
-- paying). Called when the account page loads.
create or replace function public.sync_payments()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_pay public.payments;
  v_payment jsonb;
begin
  if v_user is null then
    raise exception 'Sign in first.' using errcode = '28000';
  end if;
  for v_pay in
    select * from public.payments
    where user_id = v_user and status = 'created' and created_at > now() - interval '7 days'
    order by created_at desc limit 3
  loop
    begin
      for v_payment in
        select jsonb_array_elements(private.razorpay('GET', '/orders/' || v_pay.razorpay_order_id || '/payments') -> 'items')
      loop
        exit when private.settle(v_pay, v_payment);
      end loop;
    exception when others then
      -- Provider unreachable: try again on the next sync.
      null;
    end;
  end loop;
  return (select to_jsonb(p) from public.profiles p where id = v_user);
end
$$;

-- ---------------------------------------------------------------- AI copilot

-- p_mode 'answer': a question asked on the call -> what the presenter could say.
-- p_mode 'script': slide text -> a spoken script for that slide.
create or replace function public.ask_copilot(p_question text, p_context text, p_mode text default 'answer')
returns jsonb
language plpgsql security definer set search_path = ''
set statement_timeout = '45s'
as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_si boolean;
  v_free integer := private.setting('ai_free_answers')::integer;
  v_key text := private.secret('anthropic_api_key');
  v_system text;
  v_body jsonb;
  v_res extensions.http_response;
  v_json jsonb;
  v_text text;
begin
  if v_user is null then
    raise exception 'Sign in to use the AI copilot.' using errcode = '28000';
  end if;
  if p_mode not in ('answer', 'script') then
    raise exception 'Unknown mode.' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_question, ''))) = 0 then
    raise exception 'Nothing to answer.' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles where id = v_user for update;
  v_si := coalesce(v_profile.si_until > now(), false);
  if not v_si and v_profile.ai_answers_used >= v_free then
    raise exception 'SI_REQUIRED: AI answers are part of the SI plan. Upgrade to SI to keep using the copilot.' using errcode = 'P0001';
  end if;
  if (select count(*) from private.ai_requests where user_id = v_user and created_at > now() - interval '1 day')
     >= private.setting('ai_daily_limit')::integer then
    raise exception 'Daily AI limit reached. It resets within 24 hours.' using errcode = 'P0001';
  end if;
  if v_key is null then
    raise exception 'AI_NOT_CONFIGURED: AI answers are not switched on for this site yet.' using errcode = 'P0001';
  end if;

  if p_mode = 'answer' then
    v_system := 'You are a live Q&A copilot for someone presenting on a video call - an investor pitch, a client demo, a webinar or an interview. '
      || 'Someone on the call has just asked a question. Using only the presenter''s material (deck text, speaking scripts, notes and prep notes), '
      || 'write what the presenter could say back.' || E'\n\n'
      || 'How to answer:' || E'\n'
      || '- Speak as the presenter, in the first person, in plain spoken language.' || E'\n'
      || '- Start with a one-sentence direct answer, then at most three short lines that each begin with "• " and carry the specifics (numbers, names, examples) from the material.' || E'\n'
      || '- Keep the whole answer under 90 words so it can be read at a glance mid-conversation.' || E'\n'
      || '- Never invent facts, figures, customers or claims that are not in the material. If the material does not cover the question, say so in one line and suggest an honest reply, such as offering to follow up with the details.' || E'\n'
      || '- The question was transcribed from speech and may contain recognition errors; answer the question that was most likely meant.' || E'\n'
      || '- Output only the answer text: no preamble, no headings, no markdown other than the "• " bullets.';
  else
    v_system := 'You write speaking scripts for presentation slides. Given the deck context and one slide''s text, write what the presenter should say for that slide: '
      || 'natural spoken sentences (not bullets), first person, 50 to 110 words, confident and specific, using only facts from the material. '
      || 'Output only the script text.';
  end if;

  v_body := jsonb_build_object(
    'model', private.setting('ai_model'),
    'max_tokens', 2000,
    'output_config', jsonb_build_object('effort', private.setting('ai_effort')),
    'fallbacks', 'default',
    'system', v_system,
    'messages', jsonb_build_array(jsonb_build_object(
      'role', 'user',
      'content', jsonb_build_array(
        -- The deck context repeats across questions in one call: cache it.
        jsonb_build_object('type', 'text', 'text', '<material>' || E'\n' || left(coalesce(p_context, ''), 120000) || E'\n' || '</material>',
                           'cache_control', jsonb_build_object('type', 'ephemeral')),
        jsonb_build_object('type', 'text', 'text',
          case when p_mode = 'answer' then '<question>' || left(p_question, 2000) || '</question>'
               else '<slide>' || left(p_question, 8000) || '</slide>' end)
      )
    ))
  );

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '40000');
  v_res := extensions.http((
    'POST',
    'https://api.anthropic.com/v1/messages',
    array[
      extensions.http_header('x-api-key', v_key),
      extensions.http_header('anthropic-version', '2026-10-21'),
      extensions.http_header('anthropic-beta', 'server-side-fallback-2026-07-01')
    ],
    'application/json',
    v_body::text
  )::extensions.http_request);

  begin
    v_json := v_res.content::jsonb;
  exception when others then
    v_json := '{}'::jsonb;
  end;

  if v_res.status <> 200 then
    insert into private.ai_requests (user_id, mode, ok) values (v_user, p_mode, false);
    raise exception 'The AI service is unavailable right now (%). Try again in a moment.', coalesce(v_json #>> '{error,message}', v_res.status::text) using errcode = 'P0001';
  end if;

  select string_agg(block ->> 'text', '' order by ord) into v_text
  from jsonb_array_elements(v_json -> 'content') with ordinality as t(block, ord)
  where block ->> 'type' = 'text';

  insert into private.ai_requests (user_id, mode, ok, input_tokens, output_tokens)
  values (v_user, p_mode, v_json ->> 'stop_reason' <> 'refusal',
          (v_json #>> '{usage,input_tokens}')::integer, (v_json #>> '{usage,output_tokens}')::integer);

  if v_json ->> 'stop_reason' = 'refusal' or coalesce(trim(v_text), '') = '' then
    raise exception 'No answer was generated for this one. Try rephrasing the question.' using errcode = 'P0001';
  end if;

  if not v_si then
    update public.profiles set ai_answers_used = ai_answers_used + 1, updated_at = now() where id = v_user;
  end if;

  return jsonb_build_object(
    'text', trim(v_text),
    'si', v_si,
    'free_left', case when v_si then null else greatest(0, v_free - v_profile.ai_answers_used - 1) end
  );
end
$$;

-- Free-trial allowance, for the UI.
create or replace function public.copilot_allowance()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'free_answers', private.setting('ai_free_answers')::integer,
    'configured', private.secret('anthropic_api_key') is not null
  )
$$;

-- ---------------------------------------------------------------- contact

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  topic text not null default 'general' check (topic in ('general', 'billing', 'refund', 'support', 'privacy')),
  message text not null check (char_length(message) between 1 and 5000),
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.contact_messages enable row level security;
revoke all on public.contact_messages from anon, authenticated;
grant insert (name, email, topic, message) on public.contact_messages to anon, authenticated;
drop policy if exists "Anyone can write to us" on public.contact_messages;
create policy "Anyone can write to us" on public.contact_messages
  for insert to anon, authenticated with check (user_id is null or user_id = (select auth.uid()));

-- ---------------------------------------------------------------- grants

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.create_account(text, text, text) from public;
revoke execute on function public.create_checkout(text) from public, anon;
revoke execute on function public.confirm_payment(text, text, text) from public, anon;
revoke execute on function public.sync_payments() from public, anon;
revoke execute on function public.ask_copilot(text, text, text) from public, anon;
revoke execute on function public.copilot_allowance() from public, anon;

grant execute on function public.create_account(text, text, text) to anon, authenticated;
grant execute on function public.create_checkout(text) to authenticated;
grant execute on function public.confirm_payment(text, text, text) to authenticated;
grant execute on function public.sync_payments() to authenticated;
grant execute on function public.ask_copilot(text, text, text) to authenticated;
grant execute on function public.copilot_allowance() to authenticated;
