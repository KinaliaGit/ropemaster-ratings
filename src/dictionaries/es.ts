import { MAX_UPLOAD_MB } from "@/lib/limits";

// Textos en español. `en.ts` debe tener exactamente la misma forma (lo verifica TypeScript).
export const es = {
  meta: { title: "Rope Master Ratings", description: "El registro global de lazadores: rating, historial y resultados de cada evento." },
  common: { brand: "Rope Master", ratings: "Ratings", loading: "Cargando…", back: "Volver", of: "de" },
  nav: { events: "Eventos", participants: "Participantes", signIn: "Entrar", myPanel: "Mi panel", myAccount: "Mi cuenta", signOut: "Salir", publicSite: "Sitio público", language: "Idioma" },
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
    organizedBy: "Organiza", photos: "Fotos", noPhotos: "El organizador aún no ha subido fotos.", enrolled: "Inscritos", noEnrolled: "Aún no hay inscritos.",
    enrollment: "Inscripción", enroll: "Inscribirme", needAccount: "Necesitas una cuenta de participante.", eventFinished: "Evento finalizado", full: "Cupo lleno",
  },
  enroll: {
    title: "Inscripción", category: "Categoría", discipline: "Modalidad", pay: "Pagar inscripción", paying: "Redirigiendo a Stripe…", secure: "El pago se procesa de forma segura con Stripe.",
    errors: {
      unauthenticated: "Inicia sesión para inscribirte", forbidden: "Solo los participantes pueden inscribirse", invalid: "Evento o categoría inválidos",
      closed: "Las inscripciones están cerradas", already: "Ya estás inscrito en este evento", noPayouts: "El organizador aún no activa sus cobros", generic: "No se pudo iniciar el pago",
    },
  },
  people: {
    empty: "Aún no hay participantes con rating en esta modalidad.", dq: "Descalificado",
    title: "Participantes", subtitle: "Lazadores y barrileras con su rating e historial. Público, sin necesidad de cuenta.",
    search: "Buscar por nombre", noResults: "Sin resultados para", noRating: "Sin eventos en esta modalidad",
    verified: "Perfil verificado", unclaimed: "Perfil sin reclamar", rating: "Rating", eventsWord: "eventos", winsWord: "victorias", resultsWord: "resultados",
    history: "Historial de eventos", noHistory: "Aún no hay resultados registrados.", event: "Evento", date: "Fecha", discipline: "Modalidad", time: "Tiempo", place: "Lugar",
    contactNote: "Los datos de contacto no son públicos. ¿No eres tú o es un error?", report: "Reportar", verifiedEvent: "Evento verificado",
    ratingsByMode: "Rating por modalidad",
  },
  auth: {
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
    photo: { add: "Agregar foto", change: "Cambiar foto", remove: "Quitar", saving: "Guardando…", tooBig: `La foto pesa más de ${MAX_UPLOAD_MB} MB. Elige una más ligera.`, error: "No se pudo guardar la foto. Usa una imagen JPG, PNG o WebP." },
    type: "Cuenta de participante", myRegistrations: "Mis inscripciones",
    noRegistrations: "Aún no te has inscrito a ningún evento.", available: "Eventos disponibles", noneAvailable: "No hay eventos nuevos por ahora.",
    ranking: "Ranking", seeAll: "Ver todos", publicProfile: "Ver mi perfil público e historial", paid: "Pagado", pending: "Pago pendiente",
  },
  org: {
    verify: { title: "Tu cuenta está pendiente de verificación.", text: "Mientras tanto puedes crear y publicar eventos. Para ver los correos de los participantes y registrarlos, un administrador debe verificar tu cuenta." },
    welcome: "¡Cuenta creada! Ya puedes crear tu primer evento.", noEvents: "Aún no tienes eventos. Crea el primero.", noParticipants: "Todavía no hay participantes registrados.",
    accountType: "Cuenta de organizador", newEvent: "+ Nuevo evento", events: "Eventos", enrolled: "Inscritos", collected: "Cobrado", myEvents: "Mis eventos", manage: "Gestionar",
    tabs: { admin: "Administración", summary: "Resumen", participants: "Participantes", app: "App local" },
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
      title: "Administración", blurb: "Aprueba a los organizadores que pueden ver correos y registrar participantes.", pending: "Pendientes de verificación", verifiedTitle: "Verificados", none: "No hay organizadores en esta lista.",
      name: "Nombre", email: "Correo", since: "Registro", verify: "Verificar", revoke: "Revocar", audit: "Historial", auditNone: "Aún no hay movimientos.", actionVerify: "verificó a", actionRevoke: "revocó a", error: "No se pudo completar el cambio.",
    },
    form: {
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
