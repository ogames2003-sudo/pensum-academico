-- ═══════════════════════════════════════════════════════════════════════════
-- Estudiantes con cuenta propia: cada uno ve SOLO su progreso, con sus credenciales.
-- Ejecutar en Supabase → SQL Editor después de 0001 y 0002. Se puede ejecutar más de una vez.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── Datos del perfil ───────────────────────────
alter table public.profiles add column if not exists first_name text check (first_name is null or length(first_name) <= 80);
alter table public.profiles add column if not exists last_name text check (last_name is null or length(last_name) <= 80);
alter table public.profiles add column if not exists email text;

update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is distinct from u.email;

-- Perfiles para usuarios creados antes de 0001 (no pasaron por el trigger).
insert into public.profiles (id, display_name, email)
select u.id, u.email, u.email from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- El nombre puede venir en los metadatos del registro; el ROL nunca (siempre 'viewer' hasta que un admin lo cambie).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email, first_name, last_name)
  values (
    new.id, new.email, new.email,
    nullif(left(trim(new.raw_user_meta_data->>'first_name'), 80), ''),
    nullif(left(trim(new.raw_user_meta_data->>'last_name'), 80), '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace function public.is_student()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'student');
$$;
revoke all on function public.is_student from public;
grant execute on function public.is_student to anon, authenticated;

-- ─────────────────────────── RLS: se reactiva y se rehace desde cero ───────────────────────────
-- Garantiza que no quede ninguna regla extra ni una tabla con RLS desactivado.
do $$
declare
  t text;
  pol record;
begin
  foreach t in array array['profiles','programs','terms','courses','course_requirements','requirement_courses','student_progress'] loop
    execute format('alter table public.%I enable row level security', t);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
  end loop;
end $$;

-- Perfiles: cada quien ve el suyo; el admin ve y edita todos (los cambios de rol pasan por admin_update_student).
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- Estructura del pensum: pública si el programa está publicado; siempre visible para estudiantes y admin.
create policy programs_select on public.programs for select using (is_public or public.is_student() or public.is_admin());
create policy programs_admin_insert on public.programs for insert with check (public.is_admin());
create policy programs_admin_update on public.programs for update using (public.is_admin()) with check (public.is_admin());
create policy programs_admin_delete on public.programs for delete using (public.is_admin());

create policy terms_select on public.terms for select
  using (public.program_is_public(program_id) or public.is_student() or public.is_admin());
create policy terms_admin_all on public.terms for all using (public.is_admin()) with check (public.is_admin());

create policy courses_select on public.courses for select
  using (public.program_is_public(program_id) or public.is_student() or public.is_admin());
create policy courses_admin_all on public.courses for all using (public.is_admin()) with check (public.is_admin());

create policy course_requirements_select on public.course_requirements for select
  using (public.program_is_public(public.course_program(course_id)) or public.is_student() or public.is_admin());
create policy course_requirements_admin_all on public.course_requirements for all
  using (public.is_admin()) with check (public.is_admin());

create policy requirement_courses_select on public.requirement_courses for select
  using (public.program_is_public(public.course_program(required_course_id)) or public.is_student() or public.is_admin());
create policy requirement_courses_admin_all on public.requirement_courses for all
  using (public.is_admin()) with check (public.is_admin());

-- Progreso: el propio estudiante, el admin, o el público solo si el programa publica el del estudiante principal.
create policy student_progress_select on public.student_progress for select
  using (student_id = auth.uid() or public.is_admin() or public.progress_is_public(course_id, student_id));
create policy student_progress_admin_all on public.student_progress for all
  using (public.is_admin()) with check (public.is_admin());

-- ─────────────────────────── Funciones del panel (solo admin) ───────────────────────────

-- Lista de usuarios registrados, con o sin sesión iniciada.
create or replace function public.admin_list_users()
returns table (
  id uuid, email text, first_name text, last_name text, role text,
  created_at timestamptz, last_sign_in_at timestamptz, approved_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select p.id, coalesce(p.email, u.email)::text, p.first_name, p.last_name, p.role,
           coalesce(u.created_at, p.created_at), u.last_sign_in_at,
           (select count(*) from public.student_progress sp where sp.student_id = p.id and sp.status = 'approved')
    from public.profiles p
    left join auth.users u on u.id = p.id
    order by (p.role = 'student') desc, p.last_name nulls last, p.first_name nulls last, 2;
end $$;

-- Nombre y rol de un usuario. El rol 'admin' solo se asigna por SQL, nunca desde la app.
create or replace function public.admin_update_student(p_id uuid, p_first_name text, p_last_name text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;
  if p_role not in ('student', 'viewer') then
    raise exception 'Rol no permitido.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.profiles where id = p_id and role = 'admin') then
    raise exception 'No se puede cambiar el rol de un administrador desde la app.' using errcode = 'check_violation';
  end if;
  update public.profiles
     set first_name = nullif(left(trim(p_first_name), 80), ''),
         last_name = nullif(left(trim(p_last_name), 80), ''),
         role = p_role
   where id = p_id;
  if not found then
    raise exception 'El usuario no existe.' using errcode = 'no_data_found';
  end if;
end $$;

-- Copia el progreso de un estudiante a otro (reemplaza el del destino).
create or replace function public.admin_copy_progress(p_from uuid, p_to uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.student_progress where student_id = p_to;
  insert into public.student_progress (student_id, course_id, status)
  select p_to, course_id, status from public.student_progress where student_id = p_from and status = 'approved';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.admin_list_users, public.admin_update_student, public.admin_copy_progress from public, anon;
grant execute on function public.admin_list_users, public.admin_update_student, public.admin_copy_progress to authenticated;
