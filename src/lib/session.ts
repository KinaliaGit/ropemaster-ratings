import { cookies } from "next/headers";

export type Role = "participante" | "organizador";
export type Session = { role: Role; id: string; name: string };

export const SESSION_COOKIE = "rm_session";

// SESIÓN DE DEMOSTRACIÓN. NO es segura: la cookie no está firmada.
// Se reemplaza por Supabase Auth (getUser() en el servidor) al conectar la base de datos;
// el resto del código solo depende de getSession(), así que el cambio queda aquí.
const DEMO_USERS: Record<Role, Session> = {
  participante: { role: "participante", id: "r1", name: "Ana Estrada" },
  organizador: { role: "organizador", id: "Rodeo Norte", name: "Rodeo Norte" },
};

export function demoSession(role: Role): Session {
  return DEMO_USERS[role];
}

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (raw !== "participante" && raw !== "organizador") return null;
  return DEMO_USERS[raw];
}
