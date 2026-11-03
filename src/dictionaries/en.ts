import type { Dict } from "./es";

export const en: Dict = {
  meta: { title: "Rope Master Ratings", description: "The global registry of ropers: rating, history and results from every event." },
  common: { brand: "Rope Master", ratings: "Ratings", loading: "Loading…", back: "Back", of: "of" },
  nav: { events: "Events", participants: "Participants", signIn: "Sign in", myPanel: "My dashboard", myAccount: "My account", signOut: "Sign out", publicSite: "Public site", language: "Language" },
  footer: { tagline: "Rope Master Ratings", product: "Rope Master" },
  disc: {
    lazo: { label: "Roping", person: "Roper", persons: "Ropers" },
    barriles: { label: "Barrel racing", person: "Barrel racer", persons: "Barrel racers" },
  },
  status: { open: "Registration open", full: "Full", finished: "Finished", draft: "Draft", published: "Published", paid: "Paid", pending: "Pending" },
  home: {
    title: "Events", subtitle: "Find your next event, register and follow your rating.",
    openEvents: "open events", registered: "registered", participants: "participants", upcoming: "Upcoming", finished: "Finished",
  },
  event: {
    organizedBy: "Hosted by", photos: "Photos", noPhotos: "The organizer hasn't uploaded photos yet.", enrolled: "Registered", noEnrolled: "No one has registered yet.",
    enrollment: "Registration", enroll: "Register", needAccount: "You need a participant account.", eventFinished: "Event finished", full: "Full",
  },
  enroll: {
    title: "Registration", category: "Category", discipline: "Discipline", pay: "Pay registration", paying: "Redirecting to Stripe…", secure: "Payment is processed securely by Stripe.",
    errors: {
      unauthenticated: "Sign in to register", forbidden: "Only participants can register", invalid: "Invalid event or category",
      closed: "Registration is closed", already: "You are already registered for this event", noPayouts: "The organizer hasn't enabled payments yet", generic: "Couldn't start the payment",
    },
  },
  people: {
    title: "Participants", subtitle: "Ropers and barrel racers with their rating and history. Public, no account needed.",
    search: "Search by name", noResults: "No results for", noRating: "No events in this discipline",
    verified: "Verified profile", unclaimed: "Unclaimed profile", rating: "Rating", eventsWord: "events", winsWord: "wins", resultsWord: "results",
    history: "Event history", noHistory: "No results recorded yet.", event: "Event", date: "Date", discipline: "Discipline", time: "Time", place: "Place",
    contactNote: "Contact details are not public. Not you, or something's wrong?", report: "Report", verifiedEvent: "Verified event",
    ratingsByMode: "Rating by discipline",
  },
  auth: {
    signInTitle: "Sign in", needAccount: "You need an account to continue.", demoMode: "Demo mode · no real authentication yet",
    asParticipant: "Sign in as participant", asOrganizer: "Sign in as organizer", firstTime: "First time?", createAccount: "Create account",
    participant: "Participant", organizer: "Organizer",
    participantBlurb: "Ropers, barrel racers and other participants: register for events, pay and check your history. If an organizer already added you with your phone number, you claim that profile here.",
    organizerBlurb: "Create and publish events, and receive registrations and payments from participants.",
    fullName: "Full name", phone: "Phone", email: "Email", sendCode: "Send code", create: "Create account", code: "6-digit code", verify: "Verify",
    demoNote: "Sample view: real sign-up connects to Supabase. Continue in demo mode.", continue: "Continue",
  },
  account: {
    type: "Participant account", phoneVerified: "phone verified", phoneUnverified: "phone not verified", myRegistrations: "My registrations",
    noRegistrations: "You haven't registered for any event yet.", available: "Available events", noneAvailable: "No new events right now.",
    ranking: "Ranking", seeAll: "See all", publicProfile: "View my public profile and history", paid: "Paid", pending: "Payment pending",
  },
  org: {
    accountType: "Organizer account", newEvent: "+ New event", events: "Events", enrolled: "Registered", collected: "Collected", myEvents: "My events", manage: "Manage",
    tabs: { summary: "Overview", participants: "Participants", app: "Local app" },
    tbl: { event: "Event", date: "Date", state: "Status", enrolled: "Registered" },
    stripe: { title: "Enable payments.", text: "Connect your Stripe account to receive registrations straight into your bank.", btn: "Connect Stripe", opening: "Opening…" },
    ev: {
      back: "My events", publicPage: "View public page", publish: "Publish", toDraft: "Move to draft", paid: "Paid", state: "Status · available in the app on sync",
      enrolledTitle: "Registered", participant: "Participant", phone: "Phone", rating: "Rating", category: "Category", payment: "Payment", paidAmount: "Paid", pending: "Pending", noneEnrolled: "No one has registered yet.",
    },
    dir: { title: "Participants", blurb: "Global directory with contact details, visible to organizers only. Use it to register participants in your events.", name: "Name", phone: "Phone", rating: "Rating", events: "Events", wins: "Wins", profile: "Profile", verified: "Verified", unclaimed: "Unclaimed" },
    form: {
      title: "New event", blurb: "Once published it appears on the website and your Rope Master app downloads it when it syncs.", name: "Event name", date: "Date", capacity: "Capacity", venue: "Venue", city: "City",
      disciplines: "Disciplines", categories: "Categories and registration fee (MXN)", addCategory: "+ Add category", description: "Description", cover: "Cover photo", saveDraft: "Save draft", publish: "Publish",
    },
    app: {
      title: "Connect with the Rope Master app", blurb: "Events you publish here and the participants in the directory are downloaded to your local app when you're online. Then you use them offline.",
      steps: ["Generate a connection token (below).", "In the app, open Settings → Web account and paste the token.", "Press Sync: your events and participants are downloaded."],
      token: "Connection token", tokenNote: "Generated once the database is connected.", endpoints: "Endpoints (used by the app)",
    },
  },
  uploader: { eventPhotos: "Event photos", add: "Add", hint: "JPG or PNG, up to 10 MB each.", cover: "Cover" },
  plural: {
    event: (n: number): string => (n === 1 ? "event" : "events"),
    win: (n: number): string => (n === 1 ? "win" : "wins"),
  },
};
