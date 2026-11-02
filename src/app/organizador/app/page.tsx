import { Suspense } from "react";
import { GateSession } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { siteUrl } from "@/lib/stripe";

export default function ConexionApp() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">Cargando…</p>}>
      <GateSession role="organizador" next="/organizador/app">
        {() => (
          <>
            <OrgNav />
            <div className="mx-auto max-w-3xl px-5 py-10">
              <h1 className="font-display text-3xl font-extrabold">Conexión con la app Rope Master</h1>
              <p className="mt-2 text-muted">Los eventos que publiques aquí y los participantes del directorio se descargan a tu app local cuando tienes internet. Después los usas sin conexión.</p>
              <ol className="mt-6 space-y-3 text-sm">
                {["Genera un token de conexión (abajo).", "En la app, abre Ajustes → Cuenta web y pega el token.", "Pulsa Sincronizar: se descargan tus eventos y los participantes."].map((t, i) => (
                  <li key={t} className="flex items-center gap-3 rounded-xl card p-4"><span className="grid size-7 place-items-center rounded-full bg-brand font-bold text-white">{i + 1}</span>{t}</li>
                ))}
              </ol>
              <div className="mt-6 card p-5">
                <p className="font-mono text-xs uppercase text-muted">Token de conexión</p>
                {/* TODO: generar un token por organizador (guardar solo su hash en api_tokens) y mostrarlo una sola vez. */}
                <p className="mt-2 rounded-lg bg-sand p-3 font-mono text-sm">Se genera al conectar la base de datos.</p>
                <p className="mt-4 font-mono text-xs uppercase text-muted">Endpoints (los usa la app)</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 font-mono text-xs text-cream">{`GET ${siteUrl}/api/app/eventos
GET ${siteUrl}/api/app/participantes
Authorization: Bearer <token>`}</pre>
              </div>
            </div>
          </>
        )}
      </GateSession>
    </Suspense>
  );
}
