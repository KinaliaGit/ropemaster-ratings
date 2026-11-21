import { redirect } from "next/navigation";
import { resolveLang } from "@/lib/i18n";

// Los eventos solo se crean dentro de una serie (KIN-659): esta ruta ya no tiene formulario y lleva a crear la serie primero.
export default async function NuevoEvento(props: PageProps<"/[lang]/organizador/eventos/nuevo">) {
  const lang = await resolveLang(props.params);
  redirect(`/${lang}/organizador/series/nueva?primero=1`);
}
