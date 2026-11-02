"use client";
import { useState } from "react";

const input = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-3";

export function EventForm() {
  const [cats, setCats] = useState([{ name: "Libre", fee: 800 }]);
  // TODO: guardar en Supabase (events + categories) como borrador o publicado.
  return (
    <form className="mt-6 space-y-5 card p-6" onSubmit={(e) => e.preventDefault()}>
        <label className="block text-sm font-semibold">Nombre del evento<input required className={input} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Fecha<input required type="date" className={input} /></label>
          <label className="block text-sm font-semibold">Cupo<input required type="number" min={1} defaultValue={100} className={input} /></label>
          <label className="block text-sm font-semibold">Sede<input required className={input} /></label>
          <label className="block text-sm font-semibold">Ciudad<input required className={input} /></label>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Disciplinas</legend>
          {["Lazo", "Barriles"].map((d) => <label key={d} className="mr-4 text-sm"><input type="checkbox" defaultChecked className="mr-1 accent-brand" />{d}</label>)}
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">Categorías y costo de inscripción (MXN)</legend>
          {cats.map((c, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <input value={c.name} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="flex-1 rounded-xl border border-line px-4 py-2" />
              <input type="number" value={c.fee} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, fee: Number(e.target.value) } : x))} className="w-28 rounded-xl border border-line px-4 py-2 font-mono" />
            </div>
          ))}
          <button type="button" onClick={() => setCats([...cats, { name: "", fee: 0 }])} className="mt-2 text-sm font-semibold text-brand-hot">+ Agregar categoría</button>
        </fieldset>
        <label className="block text-sm font-semibold">Descripción<textarea rows={4} className={input} /></label>
        <div className="flex gap-3">
          <button className="flex-1 rounded-full bg-sand py-3 font-semibold">Guardar borrador</button>
          <button className="flex-1 rounded-full bg-brand py-3 font-semibold text-white hover:bg-brand-hot">Publicar</button>
        </div>
    </form>
  );
}
