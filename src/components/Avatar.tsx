// Foto de perfil o, si no hay, las iniciales.
export function Avatar({ name, initials, url, className = "size-10 text-sm" }: { name: string; initials: string; url?: string | null; className?: string }) {
  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-sand font-semibold ${className}`}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={name} className="size-full object-cover" />
        : <span aria-hidden>{initials}</span>}
    </div>
  );
}
