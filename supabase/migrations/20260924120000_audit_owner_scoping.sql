-- Scope audits to their assigned auditor: admins see everything, an
-- auditor sees only their own customers. owner_email matches the crew
-- sign-in the evaluation is assigned to; legacy/unassigned rows (null
-- owner) stay visible to all crew. Idempotent.

alter table public.audits add column if not exists owner_email text;

drop policy if exists "crew read audits" on public.audits;
create policy "crew read audits" on public.audits for select to authenticated
  using (
    public.is_admin()
    or owner_email is null
    or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "crew write audits" on public.audits;
create policy "crew write audits" on public.audits for insert to authenticated
  with check (
    public.is_admin()
    or owner_email is null
    or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "crew update audits" on public.audits;
create policy "crew update audits" on public.audits for update to authenticated
  using (
    public.is_admin()
    or owner_email is null
    or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.is_admin()
    or owner_email is null
    or lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
