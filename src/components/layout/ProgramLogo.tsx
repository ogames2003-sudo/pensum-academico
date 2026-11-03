import { GraduationCap } from 'lucide-react';

/** Logo del programa; sin logo configurado, el birrete sobre el color principal. */
export function ProgramLogo({ logoUrl, name, size = 'md' }: { logoUrl: string | null | undefined; name?: string; size?: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'size-12' : 'size-9';
  if (logoUrl) {
    return <img src={logoUrl} alt={name ? `Logo de ${name}` : 'Logo'} className={`${box} shrink-0 rounded-full object-contain`} />;
  }
  return (
    <span className={`${box} grid shrink-0 place-items-center rounded-xl bg-brand-600 text-white`} aria-hidden>
      <GraduationCap className={size === 'lg' ? 'size-6' : 'size-5'} />
    </span>
  );
}
