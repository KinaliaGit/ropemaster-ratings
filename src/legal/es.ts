import { LEGAL, type LegalDoc } from "@/lib/legal";

const resp = `${LEGAL.entity}`;

export const termsEs: LegalDoc = {
  title: "Términos y Condiciones", updated: "Versión", draft: "Borrador sujeto a revisión legal",
  sections: [
    { h: "1. Aceptación", p: [`Al crear una cuenta o usar Rope Master Ratings (el «Servicio») aceptas estos Términos y Condiciones y el Aviso de Privacidad. Si no estás de acuerdo, no uses el Servicio. El Servicio es operado por ${resp}.`] },
    { h: "2. Qué es el Servicio", p: ["Rope Master Ratings es un registro global de participantes de eventos de rodeo (por ahora, lazo): reúne su rating e historial de resultados, publica eventos de organizadores y permite inscribirse y pagar la inscripción.", "El Servicio es independiente del software Rope Master, que se rige por su propio contrato de licencia."] },
    { h: "3. Cuentas", p: ["Existen dos tipos de cuenta: participante y organizador. Debes dar datos verdaderos y mantenerlos actualizados, y eres responsable de la actividad de tu cuenta.", "Verificamos tu número de celular con un código. Un número solo puede usarse para reclamar perfiles que realmente te correspondan.", "Si eres menor de 18 años, necesitas la autorización de tu madre, padre o tutor para crear la cuenta y participar."] },
    { h: "4. Perfiles creados por organizadores", p: ["Un organizador puede registrar a un participante con su nombre y celular. Al hacerlo declara que cuenta con autorización para ello. Si un organizador te registró, puedes reclamar ese perfil, pedir que se corrija o que se elimine (consulta el Aviso de Privacidad)."] },
    { h: "5. Rating y resultados", p: ["El rating (de 1 a 10, por modalidad) se calcula automáticamente a partir de los resultados que capturan los organizadores. Es informativo y puede corregirse si se detectan errores. No garantizamos que refleje tu nivel real."] },
    { h: "6. Eventos, inscripciones y pagos", p: ["Los eventos son organizados y publicados por los organizadores, quienes son responsables de su contenido, cupo, reglas, premios y de su realización. No somos organizadores de los eventos.", "El pago de la inscripción se procesa con Stripe. No almacenamos los datos de tu tarjeta. Las condiciones de cancelación y reembolso las define el organizador del evento, sin perjuicio de tus derechos como consumidor."] },
    { h: "7. Contenido que subes", p: ["Eres responsable de las fotos y demás contenido que subas (por ejemplo, tu foto de perfil o las fotos de un evento) y declaras tener derecho a usarlas. Nos otorgas permiso limitado para mostrarlas dentro del Servicio. Podemos retirar contenido ilegal, ofensivo o que infrinja derechos de terceros."] },
    { h: "8. Uso aceptable", p: ["No uses el Servicio para suplantar a otra persona, manipular ratings o resultados, enviar contenido ilegal, intentar acceder a datos que no te corresponden ni interferir con su funcionamiento."] },
    { h: "9. Propiedad intelectual", p: ["El Servicio, su diseño, marcas y software son propiedad de sus titulares y están protegidos por la ley. Estos términos no te transfieren ningún derecho sobre ellos."] },
    { h: "10. Responsabilidad", p: ["Participar en eventos de rodeo implica riesgos físicos que asumes bajo tu responsabilidad. El Servicio se ofrece «tal cual», y en la medida permitida por la ley no somos responsables de daños derivados de los eventos, de errores de los organizadores ni de interrupciones del Servicio."] },
    { h: "11. Suspensión", p: ["Podemos suspender o cerrar cuentas que incumplan estos términos. Tú puedes cerrar tu cuenta en cualquier momento escribiéndonos."] },
    { h: "12. Cambios", p: ["Podemos actualizar estos términos. Publicaremos la nueva versión con su fecha y, si el cambio es importante, te lo avisaremos."] },
    { h: "13. Ley aplicable y contacto", p: ["Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Las controversias con consumidores pueden resolverse ante la PROFECO o los tribunales competentes; en los demás casos, ante los tribunales de la ciudad de Chihuahua, Chihuahua.", `Domicilio del responsable: ${LEGAL.address}. Contacto: ${LEGAL.email}.`] },
  ],
};

export const privacyEs: LegalDoc = {
  title: "Aviso de Privacidad", updated: "Versión", draft: "Borrador sujeto a revisión legal",
  sections: [
    { h: "1. Responsable", p: [`${resp} es responsable del tratamiento de tus datos personales. Domicilio: ${LEGAL.address}. Contacto: ${LEGAL.email}.`] },
    { h: "2. Datos que recabamos", p: ["Cuenta: nombre completo, número de celular y, en organizadores, correo electrónico.", "Perfil deportivo: rating por modalidad, eventos y resultados (tiempos y lugares) y, si la agregas, tu foto de perfil.", "Inscripciones y pagos: eventos a los que te inscribes y el estado del pago. Los datos de tu tarjeta los procesa Stripe y no los almacenamos.", "Técnicos: una cookie necesaria para mantener tu sesión.", "No recabamos datos personales sensibles."] },
    { h: "3. Para qué los usamos", p: ["Finalidades necesarias: crear y administrar tu cuenta; verificar tu número de celular con un código enviado por SMS o WhatsApp; reconocer que eres la misma persona en distintos eventos y vincular tu historial y rating; permitir tu inscripción y pago; mostrar el rating y los resultados; sincronizar eventos e inscritos con la app Rope Master del organizador; y la seguridad y prevención de fraude.", "No usamos tus datos para mercadotecnia sin tu consentimiento adicional."] },
    { h: "4. Qué es público y qué no", p: ["Es público: tu nombre, rating, historial de resultados y tu foto de perfil si decides agregarla.", "Solo lo ven organizadores con cuenta: tu número de celular. Nunca se muestra en páginas públicas."] },
    { h: "5. Tu número de celular", p: ["Lo usamos para verificar tu identidad y como llave para reconocerte entre eventos. Los organizadores con cuenta pueden consultarlo en el directorio de participantes y en su app Rope Master para registrarte en sus eventos, y deben usarlo únicamente para gestionarlos. Lo almacenamos con medidas de seguridad y no lo vendemos."] },
    { h: "6. Si un organizador te registró", p: ["Un organizador pudo crear tu perfil con tu nombre y celular. Puedes reclamarlo verificando tu celular, pedir que se corrija o solicitar que se elimine escribiendo a " + LEGAL.email + "."] },
    { h: "7. Transferencias y proveedores", p: ["No vendemos tus datos. Los compartimos con los organizadores en los términos de la sección 5 y usamos proveedores que los tratan por nuestra cuenta: Stripe (pagos), un proveedor de mensajería (códigos de verificación) y un proveedor de infraestructura y base de datos. Algunos pueden almacenar o procesar datos fuera de México."] },
    { h: "8. Derechos ARCO y revocación", p: [`Puedes acceder, rectificar, cancelar u oponerte al tratamiento de tus datos, revocar tu consentimiento y limitar su uso. Escribe a ${LEGAL.email} indicando tu nombre completo, el derecho que ejercerás y tu celular registrado. Responderemos en un máximo de 20 días. Si consideras que tu derecho no fue atendido, puedes acudir a la Secretaría Anticorrupción y Buen Gobierno.`] },
    { h: "9. Conservación", p: ["Conservamos tus datos mientras tu cuenta esté activa y hasta 3 años después de que la cierres, salvo que la ley exija un plazo mayor."] },
    { h: "10. Cookies", p: ["Usamos solo la cookie necesaria para mantener tu sesión; no usamos cookies de publicidad ni de análisis. Stripe puede usar las suyas al momento de pagar."] },
    { h: "11. Cambios a este aviso", p: ["Publicaremos cualquier cambio en esta página con su versión y fecha."] },
  ],
};
