-- ═══════════════════════════════════════════════════════════════════════════
-- Pensum académico — esquema, seguridad (RLS) y funciones.
-- Ejecutar completo en Supabase → SQL Editor (una sola vez, en un proyecto nuevo).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─────────────────────────── Tablas ───────────────────────────

-- Perfiles: uno por usuario de Supabase Auth. El rol lo asigna solo un admin (o el SQL Editor).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('admin', 'student', 'viewer')),
  created_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  name text not null check (length(trim(name)) between 1 and 160),
  institution text check (institution is null or length(institution) <= 160),
  organization_type text not null default 'semester'
    check (organization_type in ('semester', 'cycle', 'trimester', 'quarter', 'grade', 'year')),
  accent_color text not null default 'azul' check (accent_color in ('azul', 'indigo', 'vino', 'pizarra', 'ambar')),
  is_public boolean not null default false,
  show_progress_public boolean not null default false,
  student_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  year_number smallint check (year_number between 1 and 20),
  sort_order integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index terms_program_name_uq on public.terms (program_id, lower(name));
create index terms_program_idx on public.terms (program_id, sort_order);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  term_id uuid references public.terms (id) on delete set null,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9._-]*$' and length(code) <= 30),
  name text not null check (length(trim(name)) between 1 and 160),
  credits numeric(6, 2) not null default 0 check (credits >= 0 and credits <= 999),
  area text check (area is null or length(area) <= 80),
  description text check (description is null or length(description) <= 2000),
  sort_order integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, code)
);
create index courses_program_idx on public.courses (program_id, term_id, sort_order);

-- Reglas: un curso está disponible cuando TODAS sus reglas se cumplen.
create table public.course_requirements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  type text not null check (type in ('courses', 'credits')),
  mode text check (mode in ('all', 'any')),
  min_credits numeric(6, 2) check (min_credits is null or min_credits >= 0),
  sort_order integer not null default 0,
  check (
    (type = 'courses' and mode is not null and min_credits is null)
    or (type = 'credits' and mode is null and min_credits is not null)
  )
);
create index course_requirements_course_idx on public.course_requirements (course_id);

-- Cursos de una regla de tipo 'courses'.
create table public.requirement_courses (
  requirement_id uuid not null references public.course_requirements (id) on delete cascade,
  required_course_id uuid not null references public.courses (id) on delete cascade,
  primary key (requirement_id, required_course_id)
);
create index requirement_courses_required_idx on public.requirement_courses (required_course_id);

-- Progreso por estudiante y curso. La ausencia de fila equivale a «pendiente».
create table public.student_progress (
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  status text not null check (status in ('approved', 'pending')),
  updated_at timestamptz not null default now(),
  primary key (student_id, course_id)
);
create index student_progress_course_idx on public.student_progress (course_id);

-- ─────────────────────────── Funciones auxiliares ───────────────────────────

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.program_is_public(p_program_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_public from public.programs where id = p_program_id), false);
$$;

create or replace function public.course_program(p_course_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select program_id from public.courses where id = p_course_id;
$$;

-- ¿El progreso de este estudiante en este curso es público?
create or replace function public.progress_is_public(p_course_id uuid, p_student_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.courses c join public.programs p on p.id = c.program_id
    where c.id = p_course_id and p.is_public and p.show_progress_public and p.student_id = p_student_id
  );
$$;

revoke all on function public.is_admin, public.program_is_public, public.course_program, public.progress_is_public from public;
grant execute on function public.is_admin, public.program_is_public, public.course_program, public.progress_is_public to anon, authenticated;

-- ─────────────────────────── Triggers ───────────────────────────

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger programs_touch before update on public.programs for each row execute function public.touch_updated_at();
create trigger courses_touch before update on public.courses for each row execute function public.touch_updated_at();
create trigger progress_touch before update on public.student_progress for each row execute function public.touch_updated_at();

-- Perfil automático al crear un usuario (rol 'viewer': sin permisos de escritura).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un curso no puede cambiar de programa (protege la integridad de requisitos y progreso).
create or replace function public.courses_keep_program()
returns trigger language plpgsql as $$
begin
  if new.program_id <> old.program_id then
    raise exception 'Un curso no puede cambiar de programa.' using errcode = 'check_violation';
  end if;
  if new.term_id is not null and not exists (
    select 1 from public.terms where id = new.term_id and program_id = new.program_id
  ) then
    raise exception 'El ciclo no pertenece al programa del curso.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger courses_keep_program before update on public.courses
  for each row execute function public.courses_keep_program();

-- Requisitos: mismo programa y sin dependencias circulares.
create or replace function public.requirement_courses_check()
returns trigger language plpgsql as $$
declare
  v_course uuid;
begin
  select course_id into v_course from public.course_requirements where id = new.requirement_id;
  if v_course = new.required_course_id then
    raise exception 'Un curso no puede requerirse a sí mismo.' using errcode = 'check_violation';
  end if;
  if public.course_program(v_course) is distinct from public.course_program(new.required_course_id) then
    raise exception 'El prerrequisito pertenece a otro programa.' using errcode = 'check_violation';
  end if;
  -- ¿El curso requerido depende (directa o indirectamente) del curso que lo requiere?
  if exists (
    with recursive deps(id) as (
      select new.required_course_id
      union
      select rc.required_course_id
      from deps d
      join public.course_requirements cr on cr.course_id = d.id
      join public.requirement_courses rc on rc.requirement_id = cr.id
    )
    select 1 from deps where id = v_course
  ) then
    raise exception 'Dependencia circular entre cursos.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger requirement_courses_check before insert or update on public.requirement_courses
  for each row execute function public.requirement_courses_check();

-- ─────────────────────────── Row Level Security ───────────────────────────

alter table public.profiles enable row level security;
alter table public.programs enable row level security;
alter table public.terms enable row level security;
alter table public.courses enable row level security;
alter table public.course_requirements enable row level security;
alter table public.requirement_courses enable row level security;
alter table public.student_progress enable row level security;

-- Perfiles: cada quien ve el suyo; el admin ve todos. Solo el admin modifica (nadie se auto-asciende).
create policy profiles_select on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_admin_update on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- Programas: lectura pública solo si están publicados.
create policy programs_select on public.programs for select using (is_public or public.is_admin());
create policy programs_admin_insert on public.programs for insert with check (public.is_admin());
create policy programs_admin_update on public.programs for update using (public.is_admin()) with check (public.is_admin());
create policy programs_admin_delete on public.programs for delete using (public.is_admin());

create policy terms_select on public.terms for select using (public.program_is_public(program_id) or public.is_admin());
create policy terms_admin_all on public.terms for all using (public.is_admin()) with check (public.is_admin());

create policy courses_select on public.courses for select using (public.program_is_public(program_id) or public.is_admin());
create policy courses_admin_all on public.courses for all using (public.is_admin()) with check (public.is_admin());

create policy course_requirements_select on public.course_requirements for select
  using (public.program_is_public(public.course_program(course_id)) or public.is_admin());
create policy course_requirements_admin_all on public.course_requirements for all
  using (public.is_admin()) with check (public.is_admin());

create policy requirement_courses_select on public.requirement_courses for select
  using (public.program_is_public(public.course_program(required_course_id)) or public.is_admin());
create policy requirement_courses_admin_all on public.requirement_courses for all
  using (public.is_admin()) with check (public.is_admin());

-- Progreso: el propio estudiante, el admin, o el público si el programa lo publica.
create policy student_progress_select on public.student_progress for select
  using (student_id = auth.uid() or public.is_admin() or public.progress_is_public(course_id, student_id));
create policy student_progress_admin_all on public.student_progress for all
  using (public.is_admin()) with check (public.is_admin());

-- Privilegios por tabla (RLS filtra filas; esto limita operaciones).
-- Solo las tablas del pensum: el proyecto de Supabase puede compartirse con otras apps.
revoke all on public.profiles, public.programs, public.terms, public.courses, public.course_requirements,
  public.requirement_courses, public.student_progress from anon, authenticated;
grant select on public.programs, public.terms, public.courses, public.course_requirements,
  public.requirement_courses, public.student_progress to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant insert, update, delete on public.programs, public.terms, public.courses, public.course_requirements,
  public.requirement_courses, public.student_progress to authenticated;

-- ─────────────────────────── Operaciones atómicas (RPC) ───────────────────────────

-- Reemplaza los requisitos de un curso. p_requirements:
--   [{"type":"courses","mode":"all"|"any","course_ids":[uuid,...]}, {"type":"credits","min_credits":30}]
create or replace function public.replace_course_requirements(p_course_id uuid, p_requirements jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  v_req uuid;
  v_i integer := 0;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.course_requirements where course_id = p_course_id;
  for r in select * from jsonb_array_elements(coalesce(p_requirements, '[]'::jsonb)) loop
    v_i := v_i + 1;
    if r->>'type' = 'credits' then
      insert into public.course_requirements (course_id, type, min_credits, sort_order)
      values (p_course_id, 'credits', (r->>'min_credits')::numeric, v_i);
    elsif r->>'type' = 'courses' then
      if jsonb_array_length(coalesce(r->'course_ids', '[]'::jsonb)) = 0 then continue; end if;
      insert into public.course_requirements (course_id, type, mode, sort_order)
      values (p_course_id, 'courses', coalesce(r->>'mode', 'all'), v_i) returning id into v_req;
      insert into public.requirement_courses (requirement_id, required_course_id)
      select distinct v_req, x::uuid from jsonb_array_elements_text(r->'course_ids') x;
    else
      raise exception 'Tipo de requisito desconocido: %', r->>'type' using errcode = 'check_violation';
    end if;
  end loop;
end $$;

-- Crea o actualiza un curso junto con sus requisitos en una sola transacción. Devuelve el id.
create or replace function public.save_course(p_course jsonb, p_requirements jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := nullif(p_course->>'id', '')::uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;
  if v_id is null then
    insert into public.courses (program_id, term_id, code, name, credits, area, description, sort_order, is_demo)
    values (
      (p_course->>'program_id')::uuid, nullif(p_course->>'term_id', '')::uuid, upper(trim(p_course->>'code')),
      trim(p_course->>'name'), (p_course->>'credits')::numeric, nullif(trim(p_course->>'area'), ''),
      nullif(trim(p_course->>'description'), ''), coalesce((p_course->>'sort_order')::integer, 0),
      coalesce((p_course->>'is_demo')::boolean, false)
    ) returning id into v_id;
  else
    update public.courses set
      term_id = nullif(p_course->>'term_id', '')::uuid,
      code = upper(trim(p_course->>'code')),
      name = trim(p_course->>'name'),
      credits = (p_course->>'credits')::numeric,
      area = nullif(trim(p_course->>'area'), ''),
      description = nullif(trim(p_course->>'description'), ''),
      sort_order = coalesce((p_course->>'sort_order')::integer, sort_order)
    where id = v_id;
    if not found then
      raise exception 'El curso ya no existe.' using errcode = 'no_data_found';
    end if;
  end if;
  if p_requirements is not null then
    perform public.replace_course_requirements(v_id, p_requirements);
  end if;
  return v_id;
end $$;

-- Reordena (sort_order = posición * 10) cursos o ciclos de un programa.
create or replace function public.reorder_items(p_table text, p_ids uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;
  if p_table = 'courses' then
    update public.courses c set sort_order = t.pos * 10
    from unnest(p_ids) with ordinality as t(id, pos) where c.id = t.id;
  elsif p_table = 'terms' then
    update public.terms c set sort_order = t.pos * 10
    from unnest(p_ids) with ordinality as t(id, pos) where c.id = t.id;
  else
    raise exception 'Tabla no permitida.' using errcode = 'check_violation';
  end if;
end $$;

-- Importación CSV ya validada en el cliente; aquí se aplica todo o nada.
-- p_payload: {"courses":[{"code","name","credits","term_name","year_number","area","sort_order","description",
--             "requirements": null | {"groups":[{"mode","codes":[...]}],"min_credits": number|null}}]}
create or replace function public.import_courses(p_program_id uuid, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  c jsonb;
  g jsonb;
  v_term uuid;
  v_course uuid;
  v_reqs jsonb;
  v_ids jsonb;
  v_next_term integer;
  v_created integer := 0;
  v_updated integer := 0;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;

  -- 1) Ciclos y cursos.
  for c in select * from jsonb_array_elements(p_payload->'courses') loop
    v_term := null;
    if nullif(trim(c->>'term_name'), '') is not null then
      select id into v_term from public.terms
      where program_id = p_program_id and lower(name) = lower(trim(c->>'term_name'));
      if v_term is null then
        select coalesce(max(sort_order), 0) + 10 into v_next_term from public.terms where program_id = p_program_id;
        insert into public.terms (program_id, name, year_number, sort_order)
        values (p_program_id, trim(c->>'term_name'), (c->>'year_number')::smallint, v_next_term)
        returning id into v_term;
      end if;
    end if;

    select id into v_course from public.courses where program_id = p_program_id and code = upper(c->>'code');
    if v_course is null then
      insert into public.courses (program_id, term_id, code, name, credits, area, description, sort_order)
      values (p_program_id, v_term, upper(c->>'code'), c->>'name', (c->>'credits')::numeric,
              nullif(c->>'area', ''), nullif(c->>'description', ''), (c->>'sort_order')::integer);
      v_created := v_created + 1;
    else
      update public.courses set term_id = v_term, name = c->>'name', credits = (c->>'credits')::numeric,
        area = nullif(c->>'area', ''), description = nullif(c->>'description', ''),
        sort_order = (c->>'sort_order')::integer
      where id = v_course;
      v_updated := v_updated + 1;
    end if;
  end loop;

  -- 2) Requisitos (cuando ya existen todos los cursos referenciados).
  for c in select * from jsonb_array_elements(p_payload->'courses') loop
    if c->'requirements' is null or jsonb_typeof(c->'requirements') = 'null' then continue; end if;
    select id into v_course from public.courses where program_id = p_program_id and code = upper(c->>'code');
    v_reqs := '[]'::jsonb;
    for g in select * from jsonb_array_elements(coalesce(c->'requirements'->'groups', '[]'::jsonb)) loop
      select coalesce(jsonb_agg(co.id), '[]'::jsonb) into v_ids
      from public.courses co
      where co.program_id = p_program_id and co.code in (select upper(x) from jsonb_array_elements_text(g->'codes') x);
      if jsonb_array_length(v_ids) <> jsonb_array_length(g->'codes') then
        raise exception 'Prerrequisito inexistente en %.', c->>'code' using errcode = 'foreign_key_violation';
      end if;
      v_reqs := v_reqs || jsonb_build_array(jsonb_build_object('type', 'courses', 'mode', g->>'mode', 'course_ids', v_ids));
    end loop;
    if (c->'requirements'->>'min_credits') is not null then
      v_reqs := v_reqs || jsonb_build_array(jsonb_build_object('type', 'credits', 'min_credits', (c->'requirements'->>'min_credits')::numeric));
    end if;
    perform public.replace_course_requirements(v_course, v_reqs);
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end $$;

revoke all on function public.replace_course_requirements, public.save_course, public.reorder_items,
  public.import_courses from public, anon;
grant execute on function public.replace_course_requirements, public.save_course, public.reorder_items,
  public.import_courses to authenticated;
