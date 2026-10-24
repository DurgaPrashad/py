-- No free offer: no trial for new accounts, no free SI answers, and trials
-- that are still running end now. Presenting needs Standard or SI; AI needs SI.

update private.settings set value = '0' where key in ('trial_days', 'ai_free_answers');
update public.profiles set trial_until = now(), updated_at = now() where trial_until > now();
