// Foto de perfil o, si no hay, las iniciales. Las fotos ya se guardan reducidas (256 px), así que no pasan por el optimizador de imágenes
// (en el ranking serían miles de fotos distintas); solo cargan al acercarse.
export function Avatar({ name, initials, url, className = "size-10 text-sm" }: { name: string; initials: string; url?: string | null; className?: string }) {
  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-ink font-semibold text-white ${className}`}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={name} loading="lazy" decoding="async" className="size-full object-cover" />
        : <span aria-hidden>{initials}</span>}
    </div>
  );
}
