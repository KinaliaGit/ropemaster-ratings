import Link from "next/link";
import { Suspense } from "react";
import { login } from "@/lib/auth-actions";

async function Form({ searchParams }: { searchParams: PageProps<"/entrar">["searchParams"] }) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  const preferred = sp.role === "organizador" ? "organizador" : "participante";
  return (
    <>
      {next && <p className="mt-3 rounded-xl bg-brand-soft p-3 text-sm">Necesitas una cuenta para continuar.</p>}
      {/* TODO: reemplazar por Supabase Auth (OTP por celular para participantes, correo para organizadores). */}
      <div className="mt-6 space-y-3 card p-6">
        <p className="label text-muted">Modo demostración · aún sin autenticación real</p>
        {(["participante", "organizador"] as const).map((role) => (
          <form key={role} action={login}>
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="next" value={next} />
            <button className={`w-full rounded-full py-3 font-semibold ${role === preferred ? "bg-brand text-white hover:bg-brand-hot" : "bg-sand hover:bg-line"}`}>
              {role === "participante" ? "Entrar como participante" : "Entrar como organizador"}
            </button>
          </form>
        ))}
      </div>
    </>
  );
}

export default function Entrar(props: PageProps<"/entrar">) {
  return (
    <div className="mx-auto max-w-md px-5 py-14">
      <h1 className="text-3xl font-semibold">Iniciar sesión</h1>
      <Suspense fallback={null}><Form searchParams={props.searchParams} /></Suspense>
      <p className="mt-6 text-center text-sm text-muted">¿Primera vez? <Link href="/registro" className="font-semibold text-brand-hot underline">Crear cuenta</Link></p>
    </div>
  );
}
