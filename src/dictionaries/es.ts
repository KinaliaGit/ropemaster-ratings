import { MAX_UPLOAD_MB } from "@/lib/limits";

// Textos en español. `en.ts` debe tener exactamente la misma forma (lo verifica TypeScript).
export const es = {
  meta: { title: "Rope Master Ratings", description: "El registro global de lazadores: rating, historial y resultados de cada evento." },
  common: { brand: "Rope Master", ratings: "Ratings", loading: "Cargando…", back: "Volver", of: "de" },
  nav: { myLazador: "Mi perfil de lazador", createLazador: "Crear mi perfil de lazador", events: "Eventos", participants: "Participantes", signIn: "Entrar", myPanel: "Mi panel", myAccount: "Mi cuenta", signOut: "Salir", publicSite: "Sitio público", language: "Idioma" },
  promo: {
    label: "Rope Master", title: "El software para organizar tu evento de lazo.",
    text: "Rope Master es la aplicación con la que se gestionan series y eventos de lazo: equipos, tiempos, jueces y resultados en un solo sistema, sincronizado en tiempo real.",
    points: [
      { title: "Todo en un solo lugar", text: "Series, eventos, equipos, captura de tiempos y resultados." },
      { title: "Funciona sin internet", text: "Trabaja sin señal y conecta varios dispositivos por red local." },
      { title: "Licencia a tu medida", text: "Un pase para un solo evento o una licencia anual para eventos ilimitados." },
    ],
    sync: "Lo que publicas aquí se sincroniza con tu app.", learn: "Conocer Rope Master", licenses: "Ver licencias",
  },
  legal: {
    terms: "Términos y Condiciones", privacy: "Aviso de Privacidad", acceptPrefix: "Acepto los", and: "y el", acceptError: "Debes aceptar los términos y el aviso de privacidad para crear tu cuenta.",
  },
  footer: { tagline: "Rope Master Ratings", product: "Rope Master", licenses: "Licencias", terms: "Términos", privacy: "Privacidad" },
  disc: {
    lazo: { label: "Lazo", person: "Lazador", persons: "Lazadores" },
    barriles: { label: "Barriles", person: "Barrilera", persons: "Barrileras" },
  },
  status: { open: "Inscripciones abiertas", full: "Cupo lleno", finished: "Finalizado", draft: "Borrador", published: "Publicado", paid: "Pagado", pending: "Pendiente" },
  home: {
    empty: "Aún no hay eventos publicados.",
    title: "Eventos", subtitle: "Encuentra tu próximo evento, inscríbete y sigue tu rating.",
    openEvents: "eventos abiertos", registered: "inscritos", participants: "participantes", upcoming: "Próximos", finished: "Finalizados",
  },
  event: {
    from: "Desde", 
    organizedBy: "Organiza", photos: "Fotos", noPhotos: "El organizador aún no ha subido fotos.", enrolled: "Inscritos", noEnrolled: "Aún no hay inscritos.",
    enrollment: "Inscripción", enroll: "Inscribirme", needAccount: "Necesitas una cuenta de participante.", eventFinished: "Evento finalizado", full: "Cupo lleno",
  },
  pay: {
    method: { efectivo: "Efectivo", transferencia: "Transferencia", stripe: "En línea" }, markPaid: "Marcar pagado:", undo: "Deshacer", error: "No se pudo cambiar el pago. Intenta de nuevo.",
    howTitle: "Cómo pagar", online: "Pagar en línea", onlineBusy: "Redirigiendo a Stripe…", onlineHint: "Con tarjeta, de forma segura con Stripe. Se marca pagado solo.",
    offlineHint: "O paga en efectivo o por transferencia y el organizador marcará tu pago como recibido.", noInstructions: "El organizador no dejó instrucciones de pago: contáctalo para pagar en efectivo o por transferencia.",
    returned: "¡Gracias! Estamos confirmando tu pago; en unos segundos aparecerá como pagado.", paidWith: "Pagado con", errors: { unauthenticated: "Inicia sesión para pagar.", invalid: "No encontramos esa inscripción.", already: "Esa inscripción ya está pagada.", noPayouts: "El organizador aún no activa los pagos en línea.", generic: "No se pudo iniciar el pago." },
  },
  enroll: {
    title: "Inscripción", category: "Categoría", discipline: "Modalidad", submit: "Inscribirme", pendingNote: "Tu lugar queda apartado como pendiente de pago. Después podrás pagar en línea o en efectivo/transferencia con el organizador. Puedes cancelarlo mientras no esté pagado.",
    errors: {
      forbidden: "Solo los participantes pueden inscribirse.", invalid_category: "Evento o categoría inválidos.", closed: "Las inscripciones están cerradas.", already: "Ya estás inscrito en esta categoría.",
      full: "El cupo está lleno.", paid: "Esa inscripción ya está pagada y no se puede cancelar aquí.", not_found: "No encontramos esa inscripción.", failed: "No se pudo completar. Intenta de nuevo.",
    },
  },
  people: {
    initialRating: "Rating inicial · aún sin eventos",
    empty: "Aún no hay participantes con rating en esta modalidad.", dq: "Descalificado",
    title: "Participantes", subtitle: "Lazadores y barrileras con su rating e historial. Público, sin necesidad de cuenta.",
    search: "Buscar por nombre", noResults: "Sin resultados para", noRating: "Sin eventos en esta modalidad",
    verified: "Perfil verificado", unclaimed: "Perfil sin reclamar", rating: "Rating", eventsWord: "eventos", winsWord: "victorias", resultsWord: "resultados",
    history: "Historial de eventos", noHistory: "Aún no hay resultados registrados.", event: "Evento", date: "Fecha", discipline: "Modalidad", time: "Tiempo", place: "Lugar",
    contactNote: "Los datos de contacto no son públicos. ¿No eres tú o es un error?", report: "Reportar", verifiedEvent: "Evento verificado",
    ratingsByMode: "Rating por modalidad",
  },
  auth: {
    errorUnconfirmed: "Primero confirma tu correo: te enviamos un enlace al registrarte.", errorConfirm: "El enlace de confirmación no es válido o ya venció. Entra con tu correo y contraseña o pide otro.", resend: "Reenviar correo de confirmación", resent: "Te lo enviamos de nuevo.",
    password: "Contraseña", passwordHint: "Mínimo 8 caracteres", signInBtn: "Entrar", participantAccess: "Acceso de participantes", errorRoleOrganizer: "Esa cuenta no es de organizador. Elige «Participante» para entrar.", errorRoleParticipant: "Esa cuenta no es de participante. Elige «Organizador» para entrar.", organizerAccess: "Acceso de organizadores", or: "o",
    errorInvalid: "Correo o contraseña incorrectos.", errorExists: "Ya existe una cuenta con ese correo.", errorPassword: "La contraseña debe tener al menos 8 caracteres.",
    errorGeneric: "No se pudo completar. Intenta de nuevo.", checkEmail: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y vuelve a entrar.",
    signInTitle: "Iniciar sesión", needAccount: "Necesitas una cuenta para continuar.",
    asParticipant: "Entrar como participante", asOrganizer: "Entrar como organizador", firstTime: "¿Primera vez?", createAccount: "Crear cuenta",
    participant: "Participante", organizer: "Organizador",
    participantBlurb: "Lazadores, barrileras y demás participantes: inscríbete a eventos, paga y consulta tu historial. Si un organizador ya te registró con tu correo, aquí reclamas ese perfil.",
    organizerBlurb: "Crea y publica eventos, y recibe las inscripciones y pagos de los participantes.",
    fullName: "Nombre completo", email: "Correo", create: "Crear cuenta",
  },
  account: {
    createTitle: "Crea tu perfil de lazador", createText: "Tu cuenta es de organizador. Si también compites, crea tu perfil de lazador: tendrás tu rating, tu historial y podrás inscribirte a eventos. Si otro organizador ya te registró con tu correo, reclamas ese perfil.", createBtn: "Crear mi perfil de lazador", profileCreated: "¡Listo! Tu perfil de lazador está creado.", typeOrganizer: "Organizador · perfil de lazador",
    photo: { add: "Agregar foto", change: "Cambiar foto", remove: "Quitar", saving: "Guardando…", tooBig: `La foto pesa más de ${MAX_UPLOAD_MB} MB. Elige una más ligera.`, error: "No se pudo guardar la foto. Usa una imagen JPG, PNG o WebP." },
    type: "Cuenta de participante", myRegistrations: "Mis inscripciones",
    noRegistrations: "Aún no te has inscrito a ningún evento.", available: "Eventos disponibles", noneAvailable: "No hay eventos nuevos por ahora.",
    enrolledOk: "¡Listo! Tu lugar quedó apartado. Abajo ves cómo pagar.", canceledOk: "Inscripción cancelada.", cancel: "Cancelar",
    ranking: "Ranking", seeAll: "Ver todos", publicProfile: "Ver mi perfil público e historial", paid: "Pagado", pending: "Pago pendiente",
  },
  org: {
    license: {
      noneTitle: "Tu cuenta está en revisión.", noneText: "Para crear eventos y ver participantes necesitas una licencia de Rope Master vigente o la aprobación de un administrador. Mientras tanto no puedes publicar nada.",
      expiredTitle: "Tu licencia venció.", expiredText: "Renuévala para volver a crear y publicar eventos. Venció el", validUntil: "Licencia vigente hasta el",
    },
    welcome: "¡Cuenta creada! Ya puedes crear tu primer evento.", noEvents: "Aún no tienes eventos. Crea el primero.", noParticipants: "Todavía no hay participantes registrados.",
    accountType: "Cuenta de organizador", newEvent: "+ Nuevo evento", events: "Eventos", enrolled: "Inscritos", collected: "Cobrado", myEvents: "Mis eventos", manage: "Gestionar",
    tabs: { appShort: "App", adminShort: "Admin", admin: "Administración", summary: "Resumen", participants: "Participantes", app: "App local" },
    tbl: { event: "Evento", date: "Fecha", state: "Estado", enrolled: "Inscritos" },
    stripe: { title: "Activa tus cobros.", text: "Conecta tu cuenta de Stripe para recibir las inscripciones directo en tu banco.", btn: "Conectar Stripe", opening: "Abriendo…" },
    ev: {
      back: "Mis eventos", publicPage: "Ver página pública", publish: "Publicar", toDraft: "Pasar a borrador", paid: "Pagados", state: "Estado · disponible en la app al sincronizar",
      enrolledTitle: "Inscritos", participant: "Participante", phone: "Correo", rating: "Rating", category: "Categoría", payment: "Pago", paidAmount: "Pagado", pending: "Pendiente", noneEnrolled: "Aún no hay inscritos.",
    },
    dir: { title: "Participantes", blurb: "Directorio global con datos de contacto, visible solo para organizadores. Úsalo para registrar participantes en tus eventos.", name: "Nombre", email: "Correo", rating: "Rating", events: "Eventos", wins: "Victorias", profile: "Perfil", verified: "Verificado", unclaimed: "Sin reclamar",
      addTitle: "Agregar participante", addBlurb: "Regístralo con su correo para que aparezca en el directorio y pueda reclamar su perfil al crear su cuenta.", addName: "Nombre completo", addEmail: "Correo", addEmailHint: "Cuando la persona cree su cuenta con este correo, reclamará su perfil e historial.",
      addConsent: "Tengo autorización de esta persona para registrar su correo.", addBtn: "Agregar", added: "Agregado:", duplicate: "Ese correo ya está registrado a nombre de:",
      empty: "Aún no hay participantes en el directorio.", errors: { unauthorized: "Solo organizadores verificados pueden agregar participantes.", invalid_name: "Escribe el nombre completo (entre 2 y 80 caracteres).", invalid_email: "El correo no es válido.", consent: "Debes confirmar que tienes autorización de la persona.", failed: "No se pudo agregar. Intenta de nuevo." },
  },
    share: {
      title: "Enlace para compartir", hint: "Cualquiera con este enlace puede ver el evento e inscribirse. Se abre en su idioma.", copy: "Copiar enlace", copied: "Copiado",
      whatsapp: "Compartir por WhatsApp", whatsappText: "Inscríbete a nuestro evento:", open: "Abrir",
      publishedTitle: "¡Tu evento está publicado!", publishedText: "Ya aparece en la web y tu app lo descargará al sincronizar. Comparte el enlace con tu gente:",
      draftTitle: "Guardado como borrador", draftText: "Todavía no es visible para nadie. Publícalo cuando esté listo y aquí tendrás el enlace.", draftLink: "El enlace funcionará cuando publiques el evento.",
    },
    admin: {
      license: "Licencia", noLicense: "Sin licencia", licenseNoExpiry: "Vigente, sin vencimiento", licenseUntil: "Vigente hasta", licenseExpired: "Vencida",
      title: "Administración", blurb: "Aprueba a los organizadores que pueden ver correos y registrar participantes.", pending: "Pendientes de verificación", verifiedTitle: "Verificados", none: "No hay organizadores en esta lista.",
      name: "Nombre", email: "Correo", since: "Registro", verify: "Verificar", revoke: "Revocar", audit: "Historial", auditNone: "Aún no hay movimientos.", actionVerify: "verificó a", actionRevoke: "revocó a", error: "No se pudo completar el cambio.",
    },
    form: {
      paymentInfo: "Instrucciones de pago (transferencia o efectivo)", paymentInfoHint: "Solo las ven quienes se inscriben a tu evento. Ej.: CLABE, banco y titular, o «paga en efectivo en la arena».", paymentInfoPlaceholder: "CLABE 0123 4567 8901 2345 67 · Banco · Titular",
      save: "Guardar cambios", editTitle: "Editar evento", editBlurb: "Los cambios se ven al momento en la página pública. Lo ya inscrito conserva el precio con el que se apartó.", saved: "Cambios guardados.", edit: "Editar",
      errors: { capacity: "El cupo no puede ser menor que los inscritos que ya hay.", catInUse: "No puedes quitar una categoría que ya tiene inscritos. Puedes renombrarla o cambiar su costo." },
      photosLater: "Después de crear el evento podrás agregar fotos y elegir la portada.", 
      error: "Revisa los campos: faltan datos o hay valores inválidos.", title: "Nuevo evento", blurb: "Al publicarlo aparece en la web y tu app Rope Master lo descarga al sincronizar.", name: "Nombre del evento", date: "Fecha", capacity: "Cupo", venue: "Sede", city: "Ciudad",
      disciplines: "Modalidades", categories: "Categorías y costo de inscripción", categoryName: "Nombre de la categoría", categoryNamePlaceholder: "Ej. Libre, Amateur", cost: "Costo de inscripción", costHint: "Lo que paga cada participante por esta categoría", addCategory: "+ Agregar categoría", description: "Descripción", cover: "Foto de portada", saveDraft: "Guardar borrador", publish: "Publicar",
    },
    app: {
      title: "Conecta tu app Rope Master", blurb: "Lo que publiques aquí llega solo a tu app: eventos y participantes se descargan cuando tienes internet y después los usas sin conexión.",
      steps: ["Genera tu código de conexión aquí abajo.", "En la app, pega el código en Ajustes → Cuenta web.", "Pulsa Sincronizar: tus eventos y participantes se descargan a la app."],
      code: {
        title: "Código de conexión", connected: "Conectada", notConnected: "Sin conectar", since: "Código creado el", none: "Aún no has generado un código.",
        generate: "Generar código", regenerate: "Generar uno nuevo", copy: "Copiar", copied: "Copiado", shownOnce: "Cópialo ahora: por seguridad no se vuelve a mostrar.",
        replaceNote: "Si generas uno nuevo, el anterior deja de funcionar y tendrás que pegar el nuevo en la app.", error: "No se pudo generar el código. Intenta de nuevo.",
        lastUsed: "Último uso", neverUsed: "Aún no se ha usado", revoke: "Revocar código",
        revokeConfirm: "Si lo revocas, la app conectada deja de funcionar al instante. ¿Revocar el código?", revokeError: "No se pudo revocar el código. Intenta de nuevo.",
      },
    },
  },
  uploader: { eventPhotos: "Fotos del evento", add: "Agregar fotos", hint: `JPG, PNG o WebP, hasta ${MAX_UPLOAD_MB} MB cada una. La primera es la portada.`, cover: "Portada", makeCover: "Hacer portada", remove: "Eliminar", confirmRemove: "¿Eliminar esta foto?", uploading: "Subiendo…", empty: "Aún no hay fotos. La primera que subas será la portada.", tooBig: `Alguna foto pesa más de ${MAX_UPLOAD_MB} MB y no se agregó.`, invalid: "Alguno de los archivos no es una imagen válida (JPG, PNG o WebP).", limit: "Llegaste al máximo de 20 fotos.", failed: "No se pudo subir alguna foto. Intenta de nuevo." },
  plural: {
    event: (n: number): string => (n === 1 ? "evento" : "eventos"),
    win: (n: number): string => (n === 1 ? "victoria" : "victorias"),
  },
};
export type Dict = typeof es;
