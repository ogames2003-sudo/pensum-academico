# Pensum académico — Sistema de control académico

Aplicación web para visualizar un pensum interactivo y administrar el progreso académico de un estudiante
(universidad, colegio o cualquier programa). Los cursos, créditos, ciclos y prerrequisitos se configuran
desde el panel administrativo: **no hay que editar código para agregar cursos**.

- **Verde** = curso aprobado · **Gris** = curso pendiente. Disponible/bloqueado se indica con ícono y etiqueta.
- Créditos, porcentajes y desbloqueos se calculan automáticamente.
- Vista pública de solo lectura (opcional) y panel `/admin` protegido con Supabase Auth.

**Stack:** React 19 + TypeScript + Vite · Tailwind CSS 4 · Lucide · React Router · Supabase (PostgreSQL + Auth + RLS) · Netlify.

---

## 1. Configuración de Supabase (una sola vez)

1. Crea un proyecto en <https://supabase.com> (plan gratuito).
2. **Crear las tablas:** abre *SQL Editor → New query*, pega el contenido completo de
   [`supabase/migrations/0001_pensum.sql`](supabase/migrations/0001_pensum.sql) y pulsa **Run**.
3. **Desactivar registros públicos:** *Authentication → Sign In / Providers → Email* → desactiva
   **Allow new users to sign up**. Así nadie puede crearse una cuenta por su cuenta.
4. **Crear el administrador:** *Authentication → Users → Add user → Create new user*.
   Usa tu correo y una contraseña segura y marca **Auto Confirm User**.
5. **Darle rol de administrador:** en *SQL Editor* ejecuta (cambiando el correo):

   ```sql
   insert into public.profiles (id, display_name, role)
   select id, email, 'admin' from auth.users where lower(email) = lower('TU-CORREO@ejemplo.com')
   on conflict (id) do update set role = 'admin';
   ```

6. **URLs de autenticación:** *Authentication → URL Configuration* → en **Site URL** pon la URL de
   Netlify (p. ej. `https://tu-sitio.netlify.app`) y agrega `http://localhost:5190` en **Redirect URLs**.
7. **Claves públicas:** *Project Settings → API* (o *API Keys*): copia la **Project URL** y la clave
   **anon / publishable**. ⚠️ Nunca uses la `service_role` / `secret` en esta aplicación.

> No compartas claves en chats ni las subas a Git. `.env.local` está en `.gitignore`.

## 2. Desarrollo local

Requisitos: Node 22+.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Edita `.env.local` con tu Project URL y tu clave anon, y luego:

```bash
npm run dev
```

Abre <http://localhost:5190>. Inicia sesión en <http://localhost:5190/admin>.

Sin las variables de entorno la app muestra una pantalla de configuración (no hay modo simulado).

## 3. Primer uso

1. Entra a `/admin` → te llevará a **Programa**: escribe el nombre, tipo de organización
   (semestres, ciclos, trimestres, grados…) y cuántos ciclos crear.
2. Agrega cursos en **Cursos**, o impórtalos en **Datos → Importar CSV**.
   - Para explorar, usa **Datos → Cargar demostración** (6 cursos ficticios marcados DEMO).
     Se eliminan con **Eliminar datos de demostración** sin afectar los cursos reales.
3. Marca aprobados desde **Resumen**, **Pensum** o **Cursos**. Se guarda al instante.
4. En **Programa** activa *Publicar el pensum* y, si quieres, *Mostrar también el progreso*.

## 4. Despliegue en Netlify

1. Sube este proyecto a un repositorio de GitHub.
2. Netlify → *Add new site → Import an existing project* → elige el repositorio.
   La configuración de build ya está en [`netlify.toml`](netlify.toml) (`npm run build` → `dist`).
3. *Site configuration → Environment variables*: agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   (opcional `VITE_PROGRAM_SLUG`). Vuelve a desplegar (*Deploys → Trigger deploy*).
4. Copia la URL final en Supabase → *Authentication → URL Configuration → Site URL* (paso 1.6).

## 5. Reglas académicas

| Concepto | Regla |
|---|---|
| Créditos obtenidos | Suma de créditos de cursos **aprobados** únicamente. Se admiten cursos de 0 créditos. |
| Porcentajes | Créditos obtenidos / totales y cursos aprobados / totales (1 decimal). |
| Disponibilidad | Un curso pendiente está **disponible** si cumple **todas** sus condiciones; si no, **bloqueado**. |
| Condiciones | *Aprobar todos estos cursos*, *aprobar al menos uno de estos* y *créditos acumulados mínimos*, combinables. |
| Ciclos | Se rechazan dependencias circulares en la interfaz, en la importación CSV y en la base de datos (trigger). |
| Aprobación forzada | Se permite aprobar un curso bloqueado tras una advertencia; no cambia el estado de otros cursos. |

## 6. CSV

Columnas: `codigo, nombre, creditos, ciclo, anio, area, orden, descripcion, prerrequisitos, creditos_minimos`
(obligatorias: `codigo, nombre, creditos`). Separador `,` o `;` (se detecta solo).

- `prerrequisitos`: códigos separados por `;`; varios grupos con `|`; prefijo `uno:` = basta con uno.
  Ejemplo: `MAT101;FIS101|uno:QUI101;BIO101`.
- Un código existente **actualiza** el curso; uno nuevo lo crea. Los ciclos inexistentes se crean.
- Si el archivo no trae columnas de prerrequisitos, se conservan los requisitos actuales.
- Se valida todo antes de importar (filas con errores, duplicados, referencias, ciclos) y la importación
  es **de todo o nada** (una sola transacción).

## 7. Exportar a PDF

Botón **Exportar PDF** → página de reporte → **Imprimir / Guardar como PDF** (diálogo del navegador,
destino «Guardar como PDF»). Texto seleccionable y sin dependencias extra.

## 8. Seguridad

- Autenticación real con Supabase Auth; el rol `admin` vive en `profiles` y solo un admin puede cambiarlo.
- **RLS** en todas las tablas: lectura pública solo si el programa está publicado; el progreso solo si
  además se habilita *mostrar progreso*. Toda escritura exige `is_admin()`.
- Las funciones `save_course`, `import_courses`, `reorder_items` y `replace_course_requirements`
  verifican el rol y no son ejecutables por usuarios anónimos.
- El frontend solo usa la clave pública (anon). Cabeceras de seguridad (CSP, etc.) en `netlify.toml`.

## 9. Pruebas

```bash
npm test
```

```bash
npm run test:sql
```

- `npm test`: motor académico (créditos, porcentajes, requisitos, créditos mínimos, ciclos, cambios
  de estado), validación de cursos, filtros y CSV (parseo, validación, ida y vuelta).
- `npm run test:sql`: aplica la migración en un PostgreSQL embebido (PGlite) y verifica RLS, permisos,
  ciclos, atomicidad de importación, cascadas y restricciones.

## 10. Estructura

```
src/
  types/            Tipos de dominio
  lib/engine/       Motor académico puro (créditos, requisitos, grafo/ciclos, estado)
  lib/              CSV, validación, agrupación/filtros, tema
  services/         Supabase: cliente, lecturas/escrituras, datos demo
  context/          Sesión (AuthContext) y datos + estado académico (PensumContext)
  hooks/            useApprovalToggle (aprobación con advertencia)
  components/       UI (modal, confirmación, avisos), pensum, admin, layouts
  pages/            Pública, reporte, login y páginas de /admin
supabase/migrations Esquema, RLS, triggers y funciones
scripts/            Prueba SQL con PGlite
```
