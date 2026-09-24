-- Shareable proposal-deck links: one unguessable token per audit.
alter table public.audits add column if not exists share_token uuid not null default gen_random_uuid();
create unique index if not exists audits_share_token_idx on public.audits (share_token);
