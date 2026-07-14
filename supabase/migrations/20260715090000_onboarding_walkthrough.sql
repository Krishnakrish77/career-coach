-- Cross-device state for the optional dashboard walkthrough. Individual
-- checklist completion remains derived from the user's real data.
alter table profiles add column if not exists onboarding_state jsonb not null default '{"version": 1, "dismissed": false}';
