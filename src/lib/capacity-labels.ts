// Los textos del cupo que comparten el formulario de eventos y el de series (KIN-798): se toman del diccionario del formulario de eventos y se pasan como texto plano a los componentes de cliente.
import type { CapacityLabels } from "@/components/capacity-fields";

export function pickCapacityLabels(f: CapacityLabels): CapacityLabels {
  return {
    capLimit: f.capLimit, capLimitHint: f.capLimitHint, capTotal: f.capTotal, capEach: f.capEach, capHeaders: f.capHeaders, capHeelers: f.capHeelers,
    capModeTotal: f.capModeTotal, capModeEach: f.capModeEach, capModePer: f.capModePer, capSummary: f.capSummary,
    chipCap: f.chipCap, chipCapEach: f.chipCapEach, chipCapSides: f.chipCapSides, chipCapNone: f.chipCapNone,
  };
}
