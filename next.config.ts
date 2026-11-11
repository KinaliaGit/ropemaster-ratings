import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // En desarrollo, Next bloquea los archivos de la app si abres el sitio desde otra dirección que localhost
  // (por ejemplo la IP de tu red, para verlo desde el celular). Sin esto la página se ve pero los botones no responden.
  // Solo aplica a `npm run dev`; no afecta a producción.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "*.local"],
  cacheComponents: true,
  // Las fotos de eventos viven en Supabase Storage (bucket público): se sirven por el optimizador de imágenes de Next, que las entrega
  // al tamaño que se ven y en un formato más ligero. Solo se aceptan las de Storage, no cualquier dirección.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? [{ protocol: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).protocol.replace(":", "") as "http" | "https", hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname, pathname: "/storage/v1/object/public/**" }]
        : []),
    ],
  },
  // Las fotos llegan reducidas (<1.5 MB) por una acción del servidor; el límite por defecto es 1 MB.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  partialPrefetching: true,
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
