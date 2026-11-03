// Datos del responsable y versión de los documentos legales. Se muestran en las páginas de términos y privacidad
// y se guardan junto con la aceptación de cada persona.
export const LEGAL = {
  version: "2026-11-02",
  entity: "Rope Master Management (Kinalia)",
  email: "contacto@kinalia.com.mx",
  // Igual que en los documentos de Kinalia: pendiente de confirmar con abogado.
  address: "[domicilio — pendiente de confirmar con abogado]",
  // Muestra la etiqueta "Borrador" en los documentos. Quitar (false) cuando un abogado los apruebe.
  draft: true,
} as const;

export type LegalDoc = { title: string; updated: string; draft: string; sections: { h: string; p: string[] }[] };
