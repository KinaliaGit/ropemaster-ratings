// Banderas de funciones. Solo se leen en el servidor.

// Stripe (pagos en línea). Apagado por ahora: las inscripciones se pagan solo por transferencia o en efectivo.
// Se enciende con STRIPE_ENABLED=true; el backend (api/checkout, api/stripe, api/organizador/stripe) no depende de esta bandera.
export const STRIPE_ENABLED = process.env.STRIPE_ENABLED === "true";

// KIN-558: la pantalla en vivo aún no recibe datos reales (KIN-782/786/787); solo se ve en desarrollo, con datos inventados.
export const LIVE_DEMO = process.env.NODE_ENV !== "production";
