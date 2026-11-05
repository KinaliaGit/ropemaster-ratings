import type { Dict } from "./es";
import { MAX_UPLOAD_MB } from "@/lib/limits";

export const en: Dict = {
  meta: { title: "Rope Master Ratings", description: "The global registry of ropers: rating, history and results from every event." },
  common: { brand: "Rope Master", ratings: "Ratings", loading: "Loading…", back: "Back", of: "of" },
  nav: { events: "Events", participants: "Participants", signIn: "Sign in", myPanel: "My dashboard", myAccount: "My account", signOut: "Sign out", publicSite: "Public site", language: "Language" },
  promo: {
    label: "Rope Master", title: "The software to run your roping event.",
    text: "Rope Master is the app used to manage roping series and events: teams, times, judges and results in one system, synced in real time.",
    points: [
      { title: "Everything in one place", text: "Series, events, teams, time capture and results." },
      { title: "Works offline", text: "Runs without a signal and connects several devices over a local network." },
      { title: "A license that fits", text: "A pass for a single event or an annual license for unlimited events." },
    ],
    sync: "What you publish here syncs with your app.", learn: "Discover Rope Master", licenses: "See licenses",
  },
  legal: {
    terms: "Terms and Conditions", privacy: "Privacy Notice", acceptPrefix: "I accept the", and: "and the", acceptError: "You must accept the terms and the privacy notice to create your account.",
    phoneNote: "Your mobile number is used to verify your identity and link your history across events. Only organizers can see it; it is never public.",
  },
  footer: { tagline: "Rope Master Ratings", product: "Rope Master", licenses: "Licenses", terms: "Terms", privacy: "Privacy" },
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
    photo: { add: "Add photo", change: "Change photo", remove: "Remove", saving: "Saving…", tooBig: `The photo is larger than ${MAX_UPLOAD_MB} MB. Choose a lighter one.`, error: "Couldn't save the photo. Use a JPG, PNG or WebP image." },
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
    share: {
      title: "Share link", hint: "Anyone with this link can view the event and register. It opens in their language.", copy: "Copy link", copied: "Copied",
      whatsapp: "Share on WhatsApp", whatsappText: "Register for our event:", open: "Open",
      publishedTitle: "Your event is live!", publishedText: "It now appears on the website and your app will download it when it syncs. Share the link with your people:",
      draftTitle: "Saved as a draft", draftText: "It isn't visible to anyone yet. Publish it when it's ready and you'll have the link here.", draftLink: "The link will work once you publish the event.",
    },
    form: {
      error: "Please check the fields: something is missing or invalid.", title: "New event", blurb: "Once published it appears on the website and your Rope Master app downloads it when it syncs.", name: "Event name", date: "Date", capacity: "Capacity", venue: "Venue", city: "City",
      disciplines: "Disciplines", categories: "Categories and registration fee", categoryName: "Category name", categoryNamePlaceholder: "E.g. Open, Amateur", cost: "Registration fee", costHint: "What each participant pays for this category", addCategory: "+ Add category", description: "Description", cover: "Cover photo", saveDraft: "Save draft", publish: "Publish",
    },
    app: {
      title: "Connect your Rope Master app", blurb: "What you publish here reaches your app by itself: events and participants download when you're online, then you use them offline.",
      steps: ["Generate your connection code below.", "In the app, paste the code in Settings → Web account.", "Press Sync: your events and participants download to the app."],
      code: {
        title: "Connection code", connected: "Connected", notConnected: "Not connected", since: "Code created on", none: "You haven't generated a code yet.",
        generate: "Generate code", regenerate: "Generate a new one", copy: "Copy", copied: "Copied", shownOnce: "Copy it now: for security it won't be shown again.",
        replaceNote: "If you generate a new one, the old one stops working and you'll need to paste the new one in the app.", error: "Couldn't generate the code. Try again.",
        lastUsed: "Last used", neverUsed: "Not used yet", revoke: "Revoke code",
        revokeConfirm: "If you revoke it, the connected app stops working immediately. Revoke the code?", revokeError: "Couldn't revoke the code. Try again.",
      },
    },
  },
  uploader: { eventPhotos: "Event photos", add: "Add", hint: `JPG or PNG, up to ${MAX_UPLOAD_MB} MB each.`, tooBig: `A photo is larger than ${MAX_UPLOAD_MB} MB and was not added.`, cover: "Cover" },
  plural: {
    event: (n: number): string => (n === 1 ? "event" : "events"),
    win: (n: number): string => (n === 1 ? "win" : "wins"),
  },
};
