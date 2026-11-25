import type { MetadataRoute } from "next";
import { absUrl } from "@/lib/seo";

// Solo se bloquean la API y las rutas de autenticación. Las páginas privadas (panel, cuenta) se dejan rastreables a propósito
// para que Google lea su `noindex`: si estuvieran bloqueadas aquí, no vería esa etiqueta.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: absUrl("/sitemap.xml"),
  };
}
