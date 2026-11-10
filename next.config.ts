import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // En desarrollo, Next bloquea los archivos de la app si abres el sitio desde otra dirección que localhost
  // (por ejemplo la IP de tu red, para verlo desde el celular). Sin esto la página se ve pero los botones no responden.
  // Solo aplica a `npm run dev`; no afecta a producción.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "*.local"],
  cacheComponents: true,
  // Las fotos llegan reducidas (<1.5 MB) por una acción del servidor; el límite por defecto es 1 MB.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  partialPrefetching: true,
  // Quita la cabecera «X-Powered-By: Next.js» (no regalar qué tecnología usamos).
  poweredByHeader: false,
  // Cabeceras de seguridad en TODAS las rutas.
  //  - frame-ancestors / X-Frame-Options: nadie puede meter la web en un iframe ajeno (clickjacking).
  //  - nosniff: el navegador no «adivina» tipos de archivo (importante con fotos subidas por usuarios).
  //  - form-action 'self': un formulario de la web solo se puede enviar a la propia web. object-src 'none' y base-uri 'self' cierran vías clásicas de inyección.
  //  - Permissions-Policy: la web no usa cámara, micrófono ni ubicación; así ningún script puede pedirlos.
  // Aún NO hay una CSP completa para scripts: Next usa scripts en línea y hace falta un nonce por petición (queda como mejora, ver docs/LANZAMIENTO.md).
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
