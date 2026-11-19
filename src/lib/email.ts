import "server-only";

// Correo transaccional (KIN-657/660) por la API de Brevo, el mismo servicio que ya manda los correos de cuenta. Se configura con dos variables
// de SERVIDOR: BREVO_API_KEY (clave de la API v3, secreta) y MAIL_FROM_EMAIL (remitente verificado en Brevo; por defecto servicios@kinalia.com.mx).
// Sin clave no se manda nada y se avisa en el log: un correo que falla NUNCA debe tumbar la acción que lo pidió (sacar a alguien, borrar un evento).
export type Mail = { to: string; subject: string; text: string; html: string };

const API = "https://api.brevo.com/v3/smtp/email";

export async function sendEmail(mail: Mail): Promise<boolean> {
  const key = process.env.BREVO_API_KEY;
  if (!key) {
    console.warn("[email] BREVO_API_KEY no está configurada: no se mandó el correo", mail.subject);
    return false;
  }
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "Rope Master", email: process.env.MAIL_FROM_EMAIL || "servicios@kinalia.com.mx" },
        to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text, htmlContent: mail.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[email] Brevo respondió", res.status);
    return res.ok;
  } catch (e) {
    console.error("[email] no se pudo mandar el correo", e instanceof Error ? e.message : e);
    return false;
  }
}
