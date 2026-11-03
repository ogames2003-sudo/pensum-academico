-- ═══════════════════════════════════════════════════════════════════════════
-- Identidad visual del programa: logo propio y paleta de dos colores.
-- Ejecutar en Supabase → SQL Editor después de 0001_pensum.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- Logo como imagen incrustada (data URL PNG/JPEG/WebP, reducida en el navegador a ≤ 256 px).
-- Se guarda en la fila del programa para no depender de un bucket de Storage.
alter table public.programs
  add column if not exists logo_url text
  check (logo_url is null or (logo_url ~ '^data:image/(png|jpeg|webp);base64,' and length(logo_url) <= 400000));

-- Nueva paleta «rojo y azul institucional».
alter table public.programs drop constraint if exists programs_accent_color_check;
alter table public.programs add constraint programs_accent_color_check
  check (accent_color in ('azul', 'indigo', 'vino', 'pizarra', 'ambar', 'rojoazul'));
