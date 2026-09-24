-- HomSci Pro base schema: audits + photos + crew profiles with roles.
-- Written idempotently: provisions an empty database (Supabase preview
-- branches, fresh environments) and no-ops on the production project,
-- which was originally provisioned with these same objects.

create table if not exists public.audits (
  id text primary key,
  customer_name text not null default '',
  address text not null default '',
  status text not null default 'scheduled',
  appointment_date date,
  photo_count int not null default 0,
  payload jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_photos (
  id text primary key,
  audit_id text references public.audits(id) on delete cascade,
  zone text default '',
  label text default '',
  tag text default '',
  storage_path text not null,
  taken_at timestamptz,
  inspector text default ''
);

-- Crew profiles: one row per auth user, created by trigger on signup.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'auditor' check (role in ('admin','auditor')),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS: crew (any authenticated user) reads/writes audit data; profiles are
-- visible to crew, but only admins change them (role assignments).
alter table public.audits enable row level security;
alter table public.audit_photos enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "crew read audits" on public.audits;
create policy "crew read audits" on public.audits for select to authenticated using (true);
drop policy if exists "crew write audits" on public.audits;
create policy "crew write audits" on public.audits for insert to authenticated with check (true);
drop policy if exists "crew update audits" on public.audits;
create policy "crew update audits" on public.audits for update to authenticated using (true) with check (true);

drop policy if exists "crew read photos" on public.audit_photos;
create policy "crew read photos" on public.audit_photos for select to authenticated using (true);
drop policy if exists "crew write photos" on public.audit_photos;
create policy "crew write photos" on public.audit_photos for insert to authenticated with check (true);
drop policy if exists "crew update photos" on public.audit_photos;
create policy "crew update photos" on public.audit_photos for update to authenticated using (true) with check (true);

drop policy if exists "crew read profiles" on public.profiles;
create policy "crew read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "admin update profiles" on public.profiles;
create policy "admin update profiles" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete profiles" on public.profiles;
create policy "admin delete profiles" on public.profiles for delete to authenticated
  using (public.is_admin() and id <> auth.uid());

-- Storage: public-read bucket for audit photos, authenticated uploads.
insert into storage.buckets (id, name, public) values ('audit-photos', 'audit-photos', true)
on conflict (id) do nothing;

drop policy if exists "crew upload photos" on storage.objects;
create policy "crew upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'audit-photos');
drop policy if exists "crew upsert photos" on storage.objects;
create policy "crew upsert photos" on storage.objects for update to authenticated
  using (bucket_id = 'audit-photos') with check (bucket_id = 'audit-photos');
