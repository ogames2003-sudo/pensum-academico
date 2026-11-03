import { Link } from 'react-router';
import { Compass, Plug } from 'lucide-react';
import { EmptyState } from '../components/ui/States';

/** Sin variables de entorno no hay datos ni autenticación: se explica cómo configurarlas (sin modo simulado). */
export function SetupRequiredPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <EmptyState icon={Plug} title="Conecta tu proyecto de Supabase">
        <div className="space-y-3 text-left">
          <p>La aplicación necesita dos variables de entorno públicas para funcionar:</p>
          <pre className="overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
            VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=tu-clave-anon-publica
          </pre>
          <ol className="list-decimal space-y-1 pl-5">
            <li>En local: copia <code>.env.example</code> como <code>.env.local</code>, complétalo y reinicia <code>npm run dev</code>.</li>
            <li>En Netlify: Site configuration → Environment variables, y vuelve a desplegar.</li>
          </ol>
          <p>Usa solo la clave <strong>anon / publishable</strong>. Nunca la <code>service_role</code>. Consulta el README para los pasos completos.</p>
        </div>
      </EmptyState>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <EmptyState icon={Compass} title="Página no encontrada" action={<Link to="/" className="btn-primary">Ir al pensum</Link>}>
        La dirección no existe o fue movida.
      </EmptyState>
    </div>
  );
}
