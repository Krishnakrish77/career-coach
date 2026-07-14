-- User-confirmed contact details used only for explicit, current-page form fills.
alter table profiles add column if not exists application_profile jsonb not null default '{}';
