import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // En desarrollo, Next bloquea los archivos de la app si abres el sitio desde otra dirección que localhost
  // (por ejemplo la IP de tu red, para verlo desde el celular). Sin esto la página se ve pero los botones no responden.
  // Solo aplica a `npm run dev`; no afecta a producción.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*", "*.local"],
  cacheComponents: true,
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
