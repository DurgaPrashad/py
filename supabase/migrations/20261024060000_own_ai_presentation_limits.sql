-- 1. No built-in AI: SI always runs on the presenter's own AI provider and
--    key, straight from their device. The site no longer calls an AI itself.
-- 2. Presentation limits: Standard monthly 5, SI monthly 10, any yearly plan
--    unlimited. Presentations live on the presenter's device, so the app
--    enforces the count; the database records yearly access as
--    profiles.yearly_until.

alter table public.profiles add column if not exists yearly_until timestamptz;

-- Same as before, plus: any yearly payment extends yearly_until.
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
  if v_plan.id = 'si_yearly' then
    update public.profiles
      set si_yearly_until = greatest(coalesce(si_yearly_until, now()), now()) + v_period
      where id = v_pay.user_id;
  end if;
  if v_plan.id like '%\_yearly' then
    update public.profiles
      set yearly_until = greatest(coalesce(yearly_until, now()), now()) + v_period
      where id = v_pay.user_id;
  end if;
  update public.payments
    set status = 'paid', razorpay_payment_id = p_razorpay_payment_id, paid_at = now(),
        period_start = v_start, period_end = v_start + v_period
    where id = p_payment;
end
$$;

revoke execute on function private.grant_plan(uuid, text) from public, anon, authenticated;

-- Existing yearly payments (Standard and SI).
update public.profiles p
set yearly_until = x.until
from (
  select user_id, max(period_end) as until from public.payments
  where status = 'paid' and plan like '%\_yearly' group by user_id
) x
where x.user_id = p.id and (p.yearly_until is null or p.yearly_until < x.until);

-- The app calls this before each request to the presenter's own AI: it checks
-- the SI plan and logs the use. The built-in AI and its daily caps are gone.
drop function if exists public.claim_copilot_use(text, boolean);

create or replace function public.claim_copilot_use(p_mode text default 'answer', p_builtin boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_si boolean;
begin
  if v_user is null then
    raise exception 'Sign in to use SI.' using errcode = '28000';
  end if;
  if p_mode not in ('answer', 'script', 'suggest') then
    raise exception 'Unknown mode.' using errcode = '22023';
  end if;
  if p_builtin then
    raise exception 'AI_NOT_CONFIGURED: SI runs on your own AI. Connect a provider with your API key in Settings → SI.' using errcode = 'P0001';
  end if;
  select coalesce(si_until > now(), false) into v_si from public.profiles where id = v_user;
  if not coalesce(v_si, false) then
    raise exception 'SI_REQUIRED: AI answers are part of the SI plan. Upgrade to SI to use the copilot.' using errcode = 'P0001';
  end if;
  insert into private.ai_requests (user_id, mode, ok) values (v_user, 'own-key:' || p_mode, true);
  return jsonb_build_object('si', true);
end
$$;

revoke execute on function public.claim_copilot_use(text, boolean) from public, anon;
grant execute on function public.claim_copilot_use(text, boolean) to authenticated;

-- The built-in AI's database path (it called Anthropic with a Vault key).
drop function if exists public.ask_copilot(text, text, text, text);
drop function if exists public.ask_copilot(text, text, text);
