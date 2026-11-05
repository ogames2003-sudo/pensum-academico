-- ═══════════════════════════════════════════════════════════════════════════
-- Calificaciones: ZONA (A 10 + E 20 + E1 20 + E2 20 = 70) + EXAMEN FINAL (30) = 100. Aprueba con ≥ 61.
-- NULL = no registrada (la app muestra «--»; nunca equivale a 0).
-- Ejecutar en Supabase → SQL Editor después de 0001–0003. Se puede ejecutar más de una vez.
-- No modifica datos existentes: los cursos sin calificaciones conservan su aprobación manual.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.course_grades (
  student_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  attendance_score numeric(5, 2) check (attendance_score between 0 and 10),
  exercises_score numeric(5, 2) check (exercises_score between 0 and 20),
  partial_exam_1_score numeric(5, 2) check (partial_exam_1_score between 0 and 20),
  partial_exam_2_score numeric(5, 2) check (partial_exam_2_score between 0 and 20),
  final_exam_score numeric(5, 2) check (final_exam_score between 0 and 30),
  -- Derivado de las notas (no se escribe a mano): misma regla que src/lib/engine/grades.ts.
  evaluation_status text not null default 'pending'
    check (evaluation_status in ('approved', 'failed', 'preapproved', 'in_progress', 'pending')),
  updated_at timestamptz not null default now(),
  primary key (student_id, course_id)
);
create index if not exists course_grades_course_idx on public.course_grades (course_id);

-- Regla única de evaluación en la base.
create or replace function public.grade_status(a numeric, e numeric, e1 numeric, e2 numeric, ef numeric)
returns text language sql immutable as $$
  select case
    when a is null and e is null and e1 is null and e2 is null and ef is null then 'pending'
    when a is not null and e is not null and e1 is not null and e2 is not null and ef is not null then
      case when a + e + e1 + e2 + ef >= 61 then 'approved' else 'failed' end
    when ef is null and a is not null and e is not null and e1 is not null and e2 is not null
         and a + e + e1 + e2 >= 61 then 'preapproved'
    else 'in_progress'
  end;
$$;

-- Al guardar: se calcula el estado y se sincroniza la aprobación (créditos y prerrequisitos).
create or replace function public.course_grades_before()
returns trigger language plpgsql as $$
begin
  new.evaluation_status := public.grade_status(
    new.attendance_score, new.exercises_score, new.partial_exam_1_score, new.partial_exam_2_score, new.final_exam_score);
  new.updated_at := now();
  return new;
end $$;

create or replace function public.course_grades_sync_progress()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from public.student_progress where student_id = old.student_id and course_id = old.course_id;
  elsif new.evaluation_status = 'approved' then
    insert into public.student_progress (student_id, course_id, status)
    values (new.student_id, new.course_id, 'approved')
    on conflict (student_id, course_id) do update set status = 'approved';
  else
    -- Reprobado, preaprobado, en curso o pendiente: sin aprobación definitiva.
    delete from public.student_progress where student_id = new.student_id and course_id = new.course_id;
  end if;
  return null;
end $$;

drop trigger if exists course_grades_before on public.course_grades;
create trigger course_grades_before before insert or update on public.course_grades
  for each row execute function public.course_grades_before();

drop trigger if exists course_grades_sync_progress on public.course_grades;
create trigger course_grades_sync_progress after insert or update or delete on public.course_grades
  for each row execute function public.course_grades_sync_progress();

-- ─────────────────────────── Seguridad ───────────────────────────
alter table public.course_grades enable row level security;
drop policy if exists course_grades_select on public.course_grades;
drop policy if exists course_grades_admin_all on public.course_grades;
-- Lectura: el propio estudiante (solo lectura), el admin, o el público si el programa publica ese progreso.
create policy course_grades_select on public.course_grades for select
  using (student_id = auth.uid() or public.is_admin() or public.progress_is_public(course_id, student_id));
-- Escritura: solo el administrador.
create policy course_grades_admin_all on public.course_grades for all
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.course_grades from anon, authenticated;
grant select on public.course_grades to anon, authenticated;
grant insert, update, delete on public.course_grades to authenticated;

-- Guarda varias calificaciones en UNA transacción (generador de pruebas y ediciones en lote).
-- p_rows: [{"course_id": uuid, "attendance": n|null, "exercises": n|null, "partial1": n|null, "partial2": n|null, "final_exam": n|null}]
create or replace function public.save_grades_batch(p_student_id uuid, p_rows jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  r jsonb;
  v_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'No autorizado.' using errcode = 'insufficient_privilege';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.course_grades (student_id, course_id, attendance_score, exercises_score,
                                      partial_exam_1_score, partial_exam_2_score, final_exam_score)
    values (p_student_id, (r->>'course_id')::uuid, (r->>'attendance')::numeric, (r->>'exercises')::numeric,
            (r->>'partial1')::numeric, (r->>'partial2')::numeric, (r->>'final_exam')::numeric)
    on conflict (student_id, course_id) do update set
      attendance_score = excluded.attendance_score,
      exercises_score = excluded.exercises_score,
      partial_exam_1_score = excluded.partial_exam_1_score,
      partial_exam_2_score = excluded.partial_exam_2_score,
      final_exam_score = excluded.final_exam_score;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke all on function public.save_grades_batch from public, anon;
grant execute on function public.save_grades_batch to authenticated;

-- ─────────────────────────── Tiempo real ───────────────────────────
-- La vista del estudiante se actualiza sola cuando el admin cambia una nota (respetando RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'course_grades') then
      execute 'alter publication supabase_realtime add table public.course_grades';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'student_progress') then
      execute 'alter publication supabase_realtime add table public.student_progress';
    end if;
  end if;
end $$;
