// Banderas de funciones. Solo se leen en el servidor.

// Stripe (pagos en línea). Apagado por ahora: las inscripciones se pagan solo por transferencia o en efectivo.
// Se enciende con STRIPE_ENABLED=true; el backend (api/checkout, api/stripe, api/organizador/stripe) no depende de esta bandera.
export const STRIPE_ENABLED = process.env.STRIPE_ENABLED === "true";

// KIN-558: datos inventados para diseñar la pantalla en vivo; solo en desarrollo.
export const LIVE_DEMO = process.env.NODE_ENV !== "production";
// KIN-787: la pantalla en vivo ya recibe datos reales de la app. En producción se enciende con LIVE_ENABLED=true (mientras tanto no hay enlaces a ella);
// en desarrollo siempre está encendida. Sin datos reales de un evento, solo en desarrollo se ve la demostración.
export const LIVE_VIEW = LIVE_DEMO || process.env.LIVE_ENABLED === "true";
