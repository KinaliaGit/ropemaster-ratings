import { Suspense } from "react";
import { GateSession } from "@/components/Gate";
import { OrgNav } from "@/components/OrgNav";
import { EventForm } from "@/components/EventForm";

export default function NuevoEvento() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-5 py-10 text-muted">Cargando…</p>}>
      <GateSession role="organizador" next="/organizador/eventos/nuevo">
        {() => (
          <>
            <OrgNav />
            <div className="mx-auto max-w-2xl px-5 py-10">
              <h1 className="font-display text-3xl font-extrabold">Nuevo evento</h1>
              <p className="mt-1 text-sm text-muted">Al publicarlo aparece en la web y tu app Rope Master lo descarga al sincronizar.</p>
              <EventForm />
            </div>
          </>
        )}
      </GateSession>
    </Suspense>
  );
}
