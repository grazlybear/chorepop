-- ============================================================
-- ChorePop — Auth Bootstrap
-- Adds the RPC that creates a household + owner profile atomically
-- on first parent login, and drops the now-unused pin_hash column.
--
-- Kid auth uses native Supabase Auth: each kid is an auth.users row
-- with a synthetic email and a PIN-derived password, so auth.uid()
-- matches profiles.id for both parents and kids. No custom JWT or
-- separate pin_hash column is needed.
-- ============================================================

-- Drop unused column (kids' PINs are stored as Supabase auth passwords)
alter table profiles drop column if exists pin_hash;

-- ============================================================
-- FUNCTION: generate_invite_code()
-- Returns a fresh 6-character alphanumeric code not yet in use.
-- Excludes visually ambiguous characters (0/O, 1/I/L) so parents
-- can read codes out loud.
-- ============================================================

create or replace function generate_invite_code()
returns text as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i int;
begin
  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from households where invite_code = v_code);
  end loop;
  return v_code;
end;
$$ language plpgsql volatile;

-- ============================================================
-- FUNCTION: bootstrap_owner_household(household_name, display_name, avatar_url)
--
-- Called once by a newly-authenticated parent after Google sign-in to
-- create their profile (role='owner') and a household atomically.
-- Runs as SECURITY DEFINER to bypass the chicken-and-egg RLS
-- between profiles.household_id and households.created_by.
--
-- Returns the new household id, or raises if the caller already has
-- a profile.
-- ============================================================

create or replace function bootstrap_owner_household(
  p_household_name text,
  p_display_name text,
  p_avatar_url text default null
)
returns uuid as $$
declare
  v_user_id uuid;
  v_household_id uuid;
  v_invite_code text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'Profile already exists for this user' using errcode = '23505';
  end if;

  if coalesce(trim(p_household_name), '') = '' then
    raise exception 'Household name is required' using errcode = '22023';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'Display name is required' using errcode = '22023';
  end if;

  -- Profile first (household_id null), so households.created_by FK is valid
  insert into profiles (id, household_id, display_name, avatar_url, role)
  values (v_user_id, null, p_display_name, p_avatar_url, 'owner');

  v_invite_code := generate_invite_code();

  insert into households (name, invite_code, created_by)
  values (p_household_name, v_invite_code, v_user_id)
  returning id into v_household_id;

  update profiles set household_id = v_household_id where id = v_user_id;

  return v_household_id;
end;
$$ language plpgsql security definer;

-- Let any authenticated user call this; the function guards itself.
grant execute on function bootstrap_owner_household(text, text, text) to authenticated;

-- ============================================================
-- FUNCTION: household_kids_for_invite(invite_code)
--
-- Public-ish lookup used during kid PIN login: given an invite code,
-- returns the list of active kids (id, display_name, avatar_url,
-- auth_email) in that household. No secrets are exposed — the PIN
-- itself is still required to actually sign in.
--
-- Available to unauthenticated callers so kids can pick their avatar
-- before signing in.
-- ============================================================

create or replace function household_kids_for_invite(p_invite_code text)
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  auth_email text,
  household_name text
) as $$
  select
    p.id,
    p.display_name,
    p.avatar_url,
    u.email::text as auth_email,
    h.name as household_name
  from households h
  join profiles p on p.household_id = h.id
  join auth.users u on u.id = p.id
  where upper(h.invite_code) = upper(p_invite_code)
    and p.role = 'child'
    and p.is_active = true
  order by p.display_name;
$$ language sql stable security definer;

grant execute on function household_kids_for_invite(text) to anon, authenticated;
