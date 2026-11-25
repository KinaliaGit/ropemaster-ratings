import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

// Página privada o de formulario: no debe aparecer en Google (KIN-617).
export const metadata: Metadata = NOINDEX;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
