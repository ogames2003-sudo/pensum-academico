// Prueba la migración en un Postgres real embebido (PGlite) con un «auth» mínimo estilo Supabase.
// Uso: npm run test:sql
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync } from 'node:fs';

const migrations = ['0001_pensum.sql', '0002_branding.sql'].map((f) =>
  readFileSync(new URL(`../supabase/migrations/${f}`, import.meta.url), 'utf8'),
);
const db = new PGlite({ extensions: { pgcrypto } });
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};
async function expectError(sql, pattern, msg) {
  try {
    await db.exec(sql);
    ok(false, `${msg} (no lanzó error)`);
  } catch (e) {
    ok(pattern.test(e.message), `${msg} → «${e.message}»`);
  }
}

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
for (const m of migrations) await db.exec(m);
ok(true, 'migraciones aplicadas');

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const VIEWER = '00000000-0000-0000-0000-00000000000b';
await db.exec(`insert into auth.users values ('${ADMIN}', 'admin@example.test'), ('${VIEWER}', 'otro@example.test')`);
const profiles = await db.query(`select role from public.profiles order by id`);
ok(profiles.rows.length === 2 && profiles.rows.every((r) => r.role === 'viewer'), 'perfiles automáticos con rol viewer');
await db.exec(`update public.profiles set role = 'admin' where id = '${ADMIN}'`);

const as = async (role, uid) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
};

// ───── Admin ─────
await as('authenticated', ADMIN);
const prog = (await db.query(`insert into public.programs (slug, name, student_id) values ('ing-demo', 'Programa', '${ADMIN}') returning id`)).rows[0].id;
const t1 = (await db.query(`insert into public.terms (program_id, name, sort_order) values ('${prog}', 'Ciclo 1', 10) returning id`)).rows[0].id;
const save = async (course, reqs) =>
  (await db.query(`select public.save_course($1::jsonb, $2::jsonb) as id`, [JSON.stringify(course), JSON.stringify(reqs)])).rows[0].id;
const A = await save({ program_id: prog, term_id: t1, code: 'mat101', name: 'Mat I', credits: 4 }, []);
const B = await save({ program_id: prog, term_id: t1, code: 'MAT102', name: 'Mat II', credits: 4 }, [{ type: 'courses', mode: 'all', course_ids: [A] }]);
const C = await save({ program_id: prog, code: 'PRO300', name: 'Prog', credits: 5 }, [
  { type: 'courses', mode: 'any', course_ids: [A, B] },
  { type: 'credits', min_credits: 30 },
]);
ok((await db.query(`select code from public.courses where id = '${A}'`)).rows[0].code === 'MAT101', 'save_course normaliza el código a mayúsculas');
ok((await db.query(`select count(*)::int n from public.course_requirements where course_id = '${C}'`)).rows[0].n === 2, 'requisitos combinados guardados');

await expectError(`select public.save_course('{"program_id":"${prog}","code":"MAT101","name":"x","credits":1}'::jsonb, '[]'::jsonb)`, /duplicate key|courses_program_id_code_key/, 'código duplicado rechazado');
await expectError(`select public.save_course('{"id":"${A}","code":"MAT101","name":"Mat I","credits":4}'::jsonb, '[{"type":"courses","mode":"all","course_ids":["${C}"]}]'::jsonb)`, /circular/, 'ciclo indirecto A→C→B→A rechazado');
await expectError(`select public.save_course('{"id":"${A}","code":"MAT101","name":"Mat I","credits":4}'::jsonb, '[{"type":"courses","mode":"all","course_ids":["${A}"]}]'::jsonb)`, /sí mismo/, 'auto-referencia rechazada');
await expectError(`select public.save_course('{"program_id":"${prog}","code":"BAD CODE","name":"x","credits":1}'::jsonb, '[]'::jsonb)`, /check/, 'código con espacios rechazado');
await expectError(`select public.save_course('{"program_id":"${prog}","code":"NEG1","name":"x","credits":-1}'::jsonb, '[]'::jsonb)`, /check/, 'créditos negativos rechazados');
ok((await db.query(`select count(*)::int n from public.course_requirements where course_id = '${A}'`)).rows[0].n === 0, 'la transacción fallida no dejó requisitos a medias');

await save({ program_id: prog, code: 'SEM0', name: 'Seminario', credits: 0 }, []);
ok(true, 'curso de 0 créditos aceptado');

await db.exec(`insert into public.student_progress (student_id, course_id, status) values ('${ADMIN}', '${A}', 'approved')`);
await db.exec(`insert into public.student_progress (student_id, course_id, status) values ('${ADMIN}', '${C}', 'approved')`); // aprobación forzada: permitida
ok(true, 'aprobación forzada permitida (el control de advertencia es de la interfaz)');

await db.query(`select public.reorder_items('courses', $1::uuid[])`, [[B, A]]);
const order = (await db.query(`select code, sort_order from public.courses where id in ('${A}','${B}') order by sort_order`)).rows.map((r) => r.code);
ok(order.join() === 'MAT102,MAT101', 'reorder_items');

const imported = await db.query(`select public.import_courses($1, $2::jsonb) r`, [
  prog,
  JSON.stringify({
    courses: [
      { code: 'FIS101', name: 'Física', credits: 3, term_name: 'Ciclo 2', year_number: 1, sort_order: 10, requirements: { groups: [{ mode: 'all', codes: ['MAT101'] }], min_credits: null } },
      { code: 'MAT101', name: 'Matemática I (renombrada)', credits: 4, term_name: 'ciclo 1', sort_order: 10, requirements: null },
    ],
  }),
]);
ok(JSON.stringify(imported.rows[0].r) === '{"created": 1, "updated": 1}' || (imported.rows[0].r.created === 1 && imported.rows[0].r.updated === 1), 'import_courses crea y actualiza');
ok((await db.query(`select count(*)::int n from public.terms where program_id = '${prog}'`)).rows[0].n === 2, 'import crea solo el ciclo faltante (sin duplicar por mayúsculas)');
ok((await db.query(`select count(*)::int n from public.course_requirements where course_id = '${B}'`)).rows[0].n === 1, 'requisitos conservados cuando requirements = null');

await expectError(
  `select public.import_courses('${prog}', '{"courses":[{"code":"NEW1","name":"n","credits":1,"sort_order":1},{"code":"MAT101","name":"m","credits":4,"sort_order":1,"requirements":{"groups":[{"mode":"all","codes":["PRO300"]}],"min_credits":null}}]}'::jsonb)`,
  /circular/,
  'import con ciclo rechazado',
);
ok((await db.query(`select count(*)::int n from public.courses where code = 'NEW1'`)).rows[0].n === 0, 'import fallido no deja cursos parciales (todo o nada)');

// ───── Público (anon) ─────
await as('anon');
ok((await db.query(`select * from public.courses`)).rows.length === 0, 'anon no ve cursos de un programa no publicado');
await expectError(`insert into public.courses (program_id, code, name) values ('${prog}', 'HACK', 'x')`, /permission denied|row-level security/, 'anon no puede insertar');
await expectError(`select public.save_course('{"program_id":"${prog}","code":"HACK","name":"x","credits":1}'::jsonb, '[]'::jsonb)`, /permission denied/, 'anon no puede ejecutar save_course');

await as('authenticated', ADMIN);
await db.exec(`update public.programs set is_public = true where id = '${prog}'`);
await as('anon');
ok((await db.query(`select * from public.courses`)).rows.length === 5, 'anon ve el pensum publicado');
ok((await db.query(`select * from public.requirement_courses`)).rows.length > 0, 'anon ve los prerrequisitos publicados');
ok((await db.query(`select * from public.student_progress`)).rows.length === 0, 'anon NO ve el progreso si no se publica');
await expectError(`select * from public.profiles`, /permission denied/, 'anon no puede leer perfiles');

await as('authenticated', ADMIN);
await db.exec(`update public.programs set show_progress_public = true where id = '${prog}'`);
await as('anon');
ok((await db.query(`select * from public.student_progress`)).rows.length === 2, 'anon ve el progreso cuando se publica');

// ───── Identidad visual (0002) ─────
await as('authenticated', ADMIN);
await db.exec(`update public.programs set accent_color = 'rojoazul', logo_url = 'data:image/png;base64,iVBORw0KGgo=' where id = '${prog}'`);
ok(true, 'paleta rojoazul y logo PNG aceptados');
await expectError(`update public.programs set logo_url = 'https://ejemplo.test/logo.png' where id = '${prog}'`, /check/, 'logo externo (no data URL) rechazado');
await expectError(`update public.programs set logo_url = 'data:image/svg+xml;base64,PHN2Zz4=' where id = '${prog}'`, /check/, 'logo SVG rechazado (puede contener scripts)');
await expectError(`update public.programs set accent_color = 'verde' where id = '${prog}'`, /check/, 'paleta desconocida rechazada');
await as('anon');
ok((await db.query(`select logo_url from public.programs`)).rows[0]?.logo_url?.startsWith('data:image/png'), 'anon ve el logo del programa publicado');

// ───── Usuario autenticado sin rol admin ─────
await as('authenticated', VIEWER);
await expectError(`insert into public.terms (program_id, name) values ('${prog}', 'X')`, /row-level security/, 'viewer no puede crear ciclos');
const upd = await db.query(`update public.profiles set role = 'admin' where id = '${VIEWER}' returning id`);
ok(upd.rows.length === 0, 'viewer no puede auto-ascenderse a admin');
const del = await db.query(`delete from public.student_progress returning course_id`).catch((e) => ({ rows: [], e }));
ok(del.rows.length === 0, 'viewer no puede borrar progreso');
await expectError(`select public.save_course('{"program_id":"${prog}","code":"HACK","name":"x","credits":1}'::jsonb, '[]'::jsonb)`, /No autorizado/, 'viewer no puede ejecutar save_course');

// ───── Estudiantes (0003) ─────
// Simula un proyecto con la protección rota: RLS apagado en progreso y una regla extra que deja ver todo.
await db.exec(`reset role;
  alter table public.student_progress disable row level security;
  create policy fuga_total on public.programs for select using (true);`);
await as('anon');
ok((await db.query(`select * from public.student_progress`)).rows.length > 0, '(simulación) con RLS apagado, anon ve progreso');
await db.exec(`reset role;`);
await db.exec(readFileSync(new URL('../supabase/migrations/0003_students.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/0003_students.sql', import.meta.url), 'utf8'));
ok(true, '0003 aplicada (y re-ejecutable)');
ok(
  (await db.query(`select count(*)::int n from pg_policies where policyname = 'fuga_total'`)).rows[0].n === 0,
  '0003 elimina reglas extra no previstas',
);

const STU1 = '00000000-0000-0000-0000-0000000000c1';
const STU2 = '00000000-0000-0000-0000-0000000000c2';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values
  ('${STU1}', 'ana@example.test', '{"first_name":"Ana","last_name":"López","role":"admin"}'),
  ('${STU2}', 'luis@example.test', '{"first_name":"Luis","last_name":"Pérez"}')`);
const ana = (await db.query(`select role, first_name, last_name, email from public.profiles where id = '${STU1}'`)).rows[0];
ok(ana.first_name === 'Ana' && ana.last_name === 'López' && ana.email === 'ana@example.test', 'el registro guarda nombre, apellido y correo');
ok(ana.role === 'viewer', 'el rol enviado en el registro se ignora (sigue viewer)');

// Programa privado, sin progreso público.
await as('authenticated', ADMIN);
await db.exec(`update public.programs set is_public = false, show_progress_public = false where id = '${prog}'`);
const users = (await db.query(`select * from public.admin_list_users()`)).rows;
ok(users.length === 4 && users.some((u) => u.email === 'luis@example.test'), 'admin lista todos los usuarios registrados');
await db.exec(`select public.admin_update_student('${STU1}', 'Ana María', 'López', 'student');
               select public.admin_update_student('${STU2}', 'Luis', 'Pérez', 'student');`);
await expectError(`select public.admin_update_student('${STU1}', 'x', 'y', 'admin')`, /no permitido/, 'la app no puede otorgar rol admin');
await expectError(`select public.admin_update_student('${ADMIN}', 'x', 'y', 'viewer')`, /administrador/, 'la app no puede quitar el rol a un admin');
const copied = (await db.query(`select public.admin_copy_progress('${ADMIN}', '${STU1}') n`)).rows[0].n;
ok(copied === 2, 'admin copia el progreso a un estudiante');
await db.exec(`insert into public.student_progress (student_id, course_id, status)
  select '${STU2}', id, 'approved' from public.courses where code = 'SEM0'`);

// Estudiante 1
await as('authenticated', STU1);
ok((await db.query(`select * from public.courses`)).rows.length > 0, 'estudiante ve los cursos aunque el programa sea privado');
const mine = (await db.query(`select distinct student_id from public.student_progress`)).rows;
ok(mine.length === 1 && mine[0].student_id === STU1, 'estudiante ve SOLO su propio progreso');
ok((await db.query(`select * from public.profiles`)).rows.length === 1, 'estudiante solo ve su propio perfil');
await expectError(`insert into public.student_progress (student_id, course_id, status) select '${STU1}', id, 'approved' from public.courses limit 1`, /row-level security/, 'estudiante no puede marcarse cursos aprobados');
await expectError(`select * from public.admin_list_users()`, /No autorizado/, 'estudiante no puede listar usuarios');
await expectError(`select public.admin_update_student('${STU1}', 'A', 'B', 'student')`, /No autorizado/, 'estudiante no puede editar perfiles');
ok((await db.query(`update public.profiles set role = 'admin' where id = '${STU1}' returning id`)).rows.length === 0, 'estudiante no puede auto-ascenderse');

// Estudiante 2
await as('authenticated', STU2);
const his = (await db.query(`select distinct student_id from public.student_progress`)).rows;
ok(his.length === 1 && his[0].student_id === STU2, 'otro estudiante no ve el progreso ajeno');

// Visitante sin sesión
await as('anon');
ok((await db.query(`select * from public.programs`)).rows.length === 0, 'anon no ve el programa privado (regla extra eliminada)');
ok((await db.query(`select * from public.student_progress`)).rows.length === 0, 'anon no ve progreso (RLS reactivado)');
await expectError(`select * from public.admin_list_users()`, /permission denied/, 'anon no puede listar usuarios');

// Viewer (cuenta sin habilitar)
await as('authenticated', VIEWER);
ok((await db.query(`select * from public.courses`)).rows.length === 0, 'cuenta no habilitada no ve el pensum privado');

await as('authenticated', ADMIN);
await db.exec(`update public.programs set is_public = true where id = '${prog}'`);

// ───── Eliminación ─────
await as('authenticated', ADMIN);
await db.exec(`delete from public.courses where id = '${A}'`);
const left = (await db.query(`select count(*)::int n from public.requirement_courses where required_course_id = '${A}'`)).rows[0].n;
ok(left === 0, 'eliminar un curso lo quita de los requisitos de otros (cascade)');
ok((await db.query(`select count(*)::int n from public.student_progress where course_id = '${A}'`)).rows[0].n === 0, 'y elimina su progreso');
await db.exec(`delete from public.terms where id = '${t1}'`);
ok((await db.query(`select count(*)::int n from public.courses where term_id is null`)).rows[0].n >= 2, 'eliminar un ciclo deja sus cursos sin asignar');

console.log(failures ? `\n${failures} FALLO(S)` : '\nTodo correcto');
process.exit(failures ? 1 : 0);
