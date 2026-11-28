import qrcode from "qrcode-generator";
import { POSTER, type PosterCell, type PosterModel, type PosterRow } from "@/lib/event-poster";

// Dibujo del póster (KIN-767) para `ImageResponse` (Satori): SOLO flexbox (nada de grid), y todo contenedor con varios hijos lleva display: flex.
// Las medidas son el boceto aprobado (540 x 675) al doble. Colores de la marca: tinta #141311 y naranja #f26b0f.

const INK = "#141311";
const PAPER = "#fbfaf7";
const ORANGE = "#f26b0f";
const SOFT = "#d8d3c7";
const MUTED = "#b4aea1";
const LINE = "rgba(251,250,247,0.22)";

export type PosterImageProps = {
  model: PosterModel;
  eventUrl: string;
  logoDataUri: string | null;
  brandLogoDataUri: string; // el logo de Rope Master
  labels: { organizer: string; signUp: string };
};

/** El QR como un solo trazo SVG (un cuadrito por módulo oscuro), con su margen blanco. Devuelve la imagen como data URI. */
export function qrDataUri(url: string): string {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  const size = n + quiet * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${PAPER}"/><path d="${d}" fill="${INK}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const SIZE_STRONG = { big: 44, normal: 30, small: 24 } as const;
const SIZE_MUTED = { big: 24, normal: 24, small: 24 } as const;

function Row({ row }: { row: PosterRow }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: row.size === "big" ? 6 : 2 }}>
      {row.strong ? <div style={{ display: "flex", fontSize: SIZE_STRONG[row.size], fontWeight: row.size === "big" ? 800 : 700, color: row.accent ? ORANGE : PAPER, lineHeight: 1.1 }}>{row.strong}</div> : null}
      {row.muted ? <div style={{ display: "flex", fontSize: row.strong ? SIZE_MUTED[row.size] : 24, color: SOFT, lineHeight: 1.2 }}>{row.muted}</div> : null}
    </div>
  );
}

function Cell({ cell, half }: { cell: PosterCell; half: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: half ? 458 : 944, borderTop: `2px solid ${LINE}`, paddingTop: 16 }}>
      <div style={{ display: "flex", fontSize: 19, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: MUTED }}>{cell.label}</div>
      {cell.rows.map((r, i) => <Row key={i} row={r} />)}
    </div>
  );
}

export function PosterImage({ model: m, eventUrl, logoDataUri, brandLogoDataUri, labels }: PosterImageProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", position: "relative", width: POSTER.width, height: POSTER.height, background: INK, color: PAPER, fontFamily: "Inter", padding: `56px ${POSTER.padX}px 0 ${POSTER.padX}px` }}>
      {/* Fondo: brillo cálido y el lazo (la marca) como gráfico central */}
      <div style={{ display: "flex", position: "absolute", left: 0, top: 0, width: POSTER.width, height: POSTER.height, backgroundImage: "radial-gradient(circle at 85% 12%, #3a2110 0%, rgba(20,19,17,0) 70%)" }} />
      <svg width={POSTER.width} height={POSTER.height} viewBox="0 0 1080 1350" style={{ position: "absolute", left: 0, top: 0 }}>
        <ellipse cx="880" cy="300" rx="420" ry="184" fill="none" stroke={ORANGE} strokeWidth="6" transform="rotate(-24 880 300)" />
        <ellipse cx="880" cy="300" rx="356" ry="140" fill="none" stroke={ORANGE} strokeOpacity="0.45" strokeWidth="3" transform="rotate(-24 880 300)" />
        <circle cx="498" cy="470" r="14" fill={INK} stroke={ORANGE} strokeWidth="6" />
        <path d="M498 470 C 400 550, 260 584, 80 536" fill="none" stroke={ORANGE} strokeWidth="6" strokeLinecap="round" />
      </svg>

      {/* El contenido va en un contenedor posicionado: así se pinta ENCIMA del fondo y del lazo (los elementos absolutos tapan a los que no lo son). */}
      <div style={{ display: "flex", flexDirection: "column", position: "relative", flex: 1 }}>
      {/* Cabecera: logo del organizador (si hay) y después el de Rope Master; a la derecha, la serie */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 92 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {logoDataUri ? (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 92, height: 92, borderRadius: 20, background: PAPER, padding: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Satori dibuja <img> con data URI; next/image no aplica aquí */}
                <img src={logoDataUri} width={76} height={76} alt="" style={{ objectFit: "contain" }} />
              </div>
              <div style={{ display: "flex", width: 2, height: 56, background: "rgba(251,250,247,0.3)" }} />
            </>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori dibuja <img> con data URI; next/image no aplica aquí */}
            <img src={brandLogoDataUri} width={64} height={64} alt="" style={{ borderRadius: 32 }} />
            <div style={{ display: "flex", fontSize: 22, fontWeight: 800, letterSpacing: 4 }}>ROPE MASTER</div>
          </div>
        </div>
        {m.series ? (
          <div style={{ display: "flex", fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: ORANGE, border: `2px solid ${ORANGE}`, borderRadius: 99, padding: "10px 22px", maxWidth: 400 }}>{m.series}</div>
        ) : null}
      </div>

      {/* Fecha: el día enorme, y a su lado mes, hora y arena */}
      <div style={{ display: "flex", alignItems: "stretch", gap: 32, marginTop: 44 }}>
        <div style={{ display: "flex", fontFamily: POSTER.nameFont, fontSize: 208, lineHeight: 0.9, color: ORANGE, paddingTop: 8 }}>{m.day}</div>
        <div style={{ display: "flex", width: 4, background: ORANGE, opacity: 0.55 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10, flex: 1 }}>
          {m.monthYear ? <div style={{ display: "flex", fontSize: 36, fontWeight: 800, letterSpacing: 2 }}>{m.monthYear}</div> : null}
          {m.whenLine ? <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: SOFT }}>{m.whenLine}</div> : null}
          {m.place ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <svg width="30" height="30" viewBox="0 0 24 24" style={{ marginTop: 3 }}><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke={ORANGE} strokeWidth="2.2" /><circle cx="12" cy="10" r="2.5" fill={ORANGE} /></svg>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 700, lineHeight: 1.2, maxHeight: 68, overflow: "hidden" }}>{m.place}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Nombre del evento */}
      <div style={{ display: "flex", marginTop: 34, fontFamily: POSTER.nameFont, fontSize: m.name.size, lineHeight: 1.02, letterSpacing: 0.5, color: PAPER }}>{m.name.text}</div>

      {/* Datos: celdas de dos en dos */}
      {m.cellRows.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 36 }}>
          {m.cellRows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 28 }}>
              {row.map((c) => <Cell key={c.key} cell={c} half />)}
            </div>
          ))}
        </div>
      ) : null}

      {m.closing ? (
        <div style={{ display: "flex", marginTop: 28 }}>
          <div style={{ display: "flex", background: ORANGE, color: INK, borderRadius: 8, padding: "12px 22px", fontSize: 23, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>{m.closing}</div>
        </div>
      ) : null}

      {m.description ? <div style={{ display: "flex", marginTop: 24, fontSize: 24, lineHeight: 1.35, color: SOFT, maxHeight: 66, overflow: "hidden" }}>{m.description}</div> : null}

      {/* Pie: organizador y QR al evento */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, marginTop: "auto", paddingTop: 24, paddingBottom: 44, borderTop: `2px solid ${LINE}` }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 19, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: MUTED }}>{labels.organizer}</div>
          <div style={{ display: "flex", marginTop: 4, fontSize: 32, fontWeight: 800, lineHeight: 1.15 }}>{m.organizer}</div>
          <div style={{ display: "flex", marginTop: 4, fontSize: 22, color: SOFT }}>{labels.signUp}</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori dibuja <img> con data URI; next/image no aplica aquí */}
        <img src={qrDataUri(eventUrl)} width={150} height={150} alt="" style={{ borderRadius: 8 }} />
      </div>
      </div>
      <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, height: 12, background: ORANGE }} />
    </div>
  );
}
