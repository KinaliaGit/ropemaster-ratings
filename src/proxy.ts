import { NextResponse, type NextRequest } from "next/server";
import { refreshSession } from "@/lib/supabase/proxy";

const LOCALES = ["es", "en"];

// Elige el idioma por el encabezado Accept-Language del navegador (español por defecto).
function pickLocale(request: NextRequest) {
  const header = request.headers.get("accept-language") ?? "";
  for (const part of header.split(",")) {
    const code = part.trim().split(";")[0].slice(0, 2).toLowerCase();
    if (LOCALES.includes(code)) return code;
  }
  return "es";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // La API no lleva idioma: solo se renueva la sesión.
  if (pathname.startsWith("/api") || pathname.startsWith("/auth")) return refreshSession(request);
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return refreshSession(request);
  request.nextUrl.pathname = `/${pickLocale(request)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // No toca archivos internos ni archivos públicos (con extensión).
  matcher: ["/((?!_next|.*\\..*).*)"],
};
