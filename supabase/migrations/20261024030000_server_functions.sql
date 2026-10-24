-- Payments and the built-in AI now run in Vercel functions (api/*.ts) that
-- read their keys from environment variables (RAZORPAY_KEY_ID,
-- RAZORPAY_KEY_SECRET, ANTHROPIC_API_KEY, DATABASE_URL). Those functions use
-- private.grant_plan() over DATABASE_URL and claim_copilot_use() as the user.
-- The older Vault-based RPCs (create_checkout, confirm_payment, sync_payments,
-- ask_copilot) are no longer called by the app.

drop function if exists public.claim_copilot_use(text);

-- p_builtin: the request uses the site's AI key, so the daily limit applies.
create or replace function public.claim_copilot_use(p_mode text default 'answer', p_builtin boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_si boolean;
  v_free integer := private.setting('ai_free_answers')::integer;
begin
  if v_user is null then
    raise exception 'Sign in to use the AI copilot.' using errcode = '28000';
  end if;
  if p_mode not in ('answer', 'script') then
    raise exception 'Unknown mode.' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles where id = v_user for update;
  v_si := coalesce(v_profile.si_until > now(), false);
  if not v_si and v_profile.ai_answers_used >= v_free then
    raise exception 'SI_REQUIRED: AI answers are part of the SI plan. Upgrade to SI to keep using the copilot.' using errcode = 'P0001';
  end if;
  if p_builtin and (select count(*) from private.ai_requests where user_id = v_user and mode in ('answer', 'script') and created_at > now() - interval '1 day')
     >= private.setting('ai_daily_limit')::integer then
    raise exception 'DAILY_LIMIT: Daily limit for the built-in AI reached. It resets within 24 hours, or add your own API key in Settings → SI.' using errcode = 'P0001';
  end if;
  insert into private.ai_requests (user_id, mode, ok) values (v_user, case when p_builtin then p_mode else 'own-key:' || p_mode end, true);
  if not v_si then
    update public.profiles set ai_answers_used = ai_answers_used + 1, updated_at = now() where id = v_user;
  end if;
  return jsonb_build_object('si', v_si, 'free_left', case when v_si then null else greatest(0, v_free - v_profile.ai_answers_used - 1) end);
end
$$;

revoke execute on function public.claim_copilot_use(text, boolean) from public, anon;
grant execute on function public.claim_copilot_use(text, boolean) to authenticated;

-- Product renamed to Present (shown in Razorpay Checkout).
update private.plans set label = replace(label, 'Reflex ', 'Present ') where label like 'Reflex %';
