// Textos en español. `en.ts` debe tener exactamente la misma forma (lo verifica TypeScript).
export const es = {
  meta: { title: "Rope Master Ratings", description: "El registro global de lazadores: rating, historial y resultados de cada evento." },
  common: { brand: "Rope Master", ratings: "Ratings", loading: "Cargando…", back: "Volver", of: "de" },
  nav: { events: "Eventos", participants: "Participantes", signIn: "Entrar", myPanel: "Mi panel", myAccount: "Mi cuenta", signOut: "Salir", publicSite: "Sitio público", language: "Idioma" },
  footer: { tagline: "Rope Master Ratings", product: "Rope Master" },
  disc: {
    lazo: { label: "Lazo", person: "Lazador", persons: "Lazadores" },
    barriles: { label: "Barriles", person: "Barrilera", persons: "Barrileras" },
  },
  status: { open: "Inscripciones abiertas", full: "Cupo lleno", finished: "Finalizado", draft: "Borrador", published: "Publicado", paid: "Pagado", pending: "Pendiente" },
  home: {
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
    title: "Participantes", subtitle: "Lazadores y barrileras con su rating e historial. Público, sin necesidad de cuenta.",
    search: "Buscar por nombre", noResults: "Sin resultados para", noRating: "Sin eventos en esta modalidad",
    verified: "Perfil verificado", unclaimed: "Perfil sin reclamar", rating: "Rating", eventsWord: "eventos", winsWord: "victorias", resultsWord: "resultados",
    history: "Historial de eventos", noHistory: "Aún no hay resultados registrados.", event: "Evento", date: "Fecha", discipline: "Modalidad", time: "Tiempo", place: "Lugar",
    contactNote: "Los datos de contacto no son públicos. ¿No eres tú o es un error?", report: "Reportar", verifiedEvent: "Evento verificado",
    ratingsByMode: "Rating por modalidad",
  },
  auth: {
    signInTitle: "Iniciar sesión", needAccount: "Necesitas una cuenta para continuar.", demoMode: "Modo demostración · aún sin autenticación real",
    asParticipant: "Entrar como participante", asOrganizer: "Entrar como organizador", firstTime: "¿Primera vez?", createAccount: "Crear cuenta",
    participant: "Participante", organizer: "Organizador",
    participantBlurb: "Lazadores, barrileras y demás participantes: inscríbete a eventos, paga y consulta tu historial. Si un organizador ya te registró con tu celular, aquí reclamas ese perfil.",
    organizerBlurb: "Crea y publica eventos, y recibe las inscripciones y pagos de los participantes.",
    fullName: "Nombre completo", phone: "Celular", email: "Correo", sendCode: "Enviar código", create: "Crear cuenta", code: "Código de 6 dígitos", verify: "Verificar",
    demoNote: "Vista de ejemplo: el registro real se conecta con Supabase. Continúa en modo demostración.", continue: "Continuar",
  },
  account: {
    type: "Cuenta de participante", phoneVerified: "celular verificado", phoneUnverified: "celular sin verificar", myRegistrations: "Mis inscripciones",
    noRegistrations: "Aún no te has inscrito a ningún evento.", available: "Eventos disponibles", noneAvailable: "No hay eventos nuevos por ahora.",
    ranking: "Ranking", seeAll: "Ver todos", publicProfile: "Ver mi perfil público e historial", paid: "Pagado", pending: "Pago pendiente",
  },
  org: {
    accountType: "Cuenta de organizador", newEvent: "+ Nuevo evento", events: "Eventos", enrolled: "Inscritos", collected: "Cobrado", myEvents: "Mis eventos", manage: "Gestionar",
    tabs: { summary: "Resumen", participants: "Participantes", app: "App local" },
    tbl: { event: "Evento", date: "Fecha", state: "Estado", enrolled: "Inscritos" },
    stripe: { title: "Activa tus cobros.", text: "Conecta tu cuenta de Stripe para recibir las inscripciones directo en tu banco.", btn: "Conectar Stripe", opening: "Abriendo…" },
    ev: {
      back: "Mis eventos", publicPage: "Ver página pública", publish: "Publicar", toDraft: "Pasar a borrador", paid: "Pagados", state: "Estado · disponible en la app al sincronizar",
      enrolledTitle: "Inscritos", participant: "Participante", phone: "Celular", rating: "Rating", category: "Categoría", payment: "Pago", paidAmount: "Pagado", pending: "Pendiente", noneEnrolled: "Aún no hay inscritos.",
    },
    dir: { title: "Participantes", blurb: "Directorio global con datos de contacto, visible solo para organizadores. Úsalo para registrar participantes en tus eventos.", name: "Nombre", phone: "Celular", rating: "Rating", events: "Eventos", wins: "Victorias", profile: "Perfil", verified: "Verificado", unclaimed: "Sin reclamar" },
    form: {
      title: "Nuevo evento", blurb: "Al publicarlo aparece en la web y tu app Rope Master lo descarga al sincronizar.", name: "Nombre del evento", date: "Fecha", capacity: "Cupo", venue: "Sede", city: "Ciudad",
      disciplines: "Modalidades", categories: "Categorías y costo de inscripción (MXN)", addCategory: "+ Agregar categoría", description: "Descripción", cover: "Foto de portada", saveDraft: "Guardar borrador", publish: "Publicar",
    },
    app: {
      title: "Conexión con la app Rope Master", blurb: "Los eventos que publiques aquí y los participantes del directorio se descargan a tu app local cuando tienes internet. Después los usas sin conexión.",
      steps: ["Genera un token de conexión (abajo).", "En la app, abre Ajustes → Cuenta web y pega el token.", "Pulsa Sincronizar: se descargan tus eventos y los participantes."],
      token: "Token de conexión", tokenNote: "Se genera al conectar la base de datos.", endpoints: "Endpoints (los usa la app)",
    },
  },
  uploader: { eventPhotos: "Fotos del evento", add: "Agregar", hint: "JPG o PNG, hasta 10 MB cada una.", cover: "Portada" },
  plural: {
    event: (n: number): string => (n === 1 ? "evento" : "eventos"),
    win: (n: number): string => (n === 1 ? "victoria" : "victorias"),
  },
};
export type Dict = typeof es;
