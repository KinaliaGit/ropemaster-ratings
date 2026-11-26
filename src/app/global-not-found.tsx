import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NotFound from "./[lang]/not-found";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = { title: "404 · Rope Master Ratings" };

// KIN-624: 404 de las direcciones que no corresponden a ninguna ruta. Como el layout raíz vive en `[lang]`, Next mostraría su página genérica
// en inglés; esta usa el mismo contenido amable (en los dos idiomas) que `[lang]/not-found`.
export default function GlobalNotFound() {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">
        <main>
          <NotFound />
        </main>
      </body>
    </html>
  );
}
