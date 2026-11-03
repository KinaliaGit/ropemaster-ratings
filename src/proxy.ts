import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (LOCALES.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`))) return;
  request.nextUrl.pathname = `/${pickLocale(request)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // No toca archivos internos, la API ni los archivos públicos (con extensión).
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
