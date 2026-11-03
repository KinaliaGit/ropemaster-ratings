import { getAvatar } from "@/lib/avatars";

// Sirve la foto de perfil (pública, igual que el perfil del participante).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = getAvatar(id);
  if (!a) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(a.bytes), {
    headers: {
      "Content-Type": a.mime,
      "Cache-Control": "public, max-age=31536000, immutable", // la URL lleva ?v=, así que al cambiar la foto cambia la URL
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
