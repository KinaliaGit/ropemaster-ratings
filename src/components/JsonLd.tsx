import { jsonLdText } from "@/lib/seo";

// Datos estructurados para buscadores. Es un <script> normal (no ejecutable), no `next/script`.
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] | null }) {
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(data) }} />;
}
