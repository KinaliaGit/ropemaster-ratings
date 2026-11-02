import Link from "next/link";

export default function Entrar() {
  // TODO: Supabase Auth (OTP por teléfono para participantes, correo para organizadores).
  return (
    <div className="mx-auto max-w-md px-5 py-14">
      <h1 className="font-display text-3xl font-extrabold">Iniciar sesión</h1>
      <form className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">Correo o celular
          <input required className="mt-1 w-full rounded-xl border border-line bg-white px-4 py-3" />
        </label>
        <button type="button" className="w-full rounded-full bg-brand py-3 font-semibold text-ink hover:bg-brand-hot">Continuar</button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">¿Primera vez? <Link href="/registro" className="font-semibold text-brand-hot underline">Crear cuenta</Link></p>
    </div>
  );
}
