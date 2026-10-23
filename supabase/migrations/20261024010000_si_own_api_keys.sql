-- SI with any AI provider. Presenters can use the built-in AI (Claude, with
-- the site's key in Vault) or their own API key from Settings -> SI. Own keys
-- stay on the device and requests go straight to the provider, so the server
-- only checks the plan and counts usage: claim_copilot_use().
--
-- ask_copilot gains p_style: the presenter's answer length and instructions.

create or replace function public.claim_copilot_use(p_mode text default 'answer')
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
  insert into private.ai_requests (user_id, mode, ok) values (v_user, 'own-key:' || p_mode, true);
  if not v_si then
    update public.profiles set ai_answers_used = ai_answers_used + 1, updated_at = now() where id = v_user;
  end if;
  return jsonb_build_object('si', v_si, 'free_left', case when v_si then null else greatest(0, v_free - v_profile.ai_answers_used - 1) end);
end
$$;

revoke execute on function public.claim_copilot_use(text) from public, anon;
grant execute on function public.claim_copilot_use(text) to authenticated;

-- Same as before, plus the presenter's style preferences.
drop function if exists public.ask_copilot(text, text, text);

create or replace function public.ask_copilot(p_question text, p_context text, p_mode text default 'answer', p_style text default null)
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
  if (select count(*) from private.ai_requests where user_id = v_user and mode in ('answer', 'script') and created_at > now() - interval '1 day')
     >= private.setting('ai_daily_limit')::integer then
    raise exception 'Daily AI limit reached. It resets within 24 hours, or add your own API key in Settings → SI.' using errcode = 'P0001';
  end if;
  if v_key is null then
    raise exception 'AI_NOT_CONFIGURED: The built-in AI isn''t switched on yet. Add your own API key in Settings → SI.' using errcode = 'P0001';
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
  if length(trim(coalesce(p_style, ''))) > 0 then
    v_system := v_system || E'\n\n' || 'The presenter''s preferences (they override the length guidance above, never the rule against inventing facts):' || E'\n' || left(p_style, 2000);
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

revoke execute on function public.ask_copilot(text, text, text, text) from public, anon;
grant execute on function public.ask_copilot(text, text, text, text) to authenticated;
