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
  },
  footer: { tagline: "Rope Master Ratings", product: "Rope Master", licenses: "Licenses", terms: "Terms", privacy: "Privacy" },
  disc: {
    lazo: { label: "Roping", person: "Roper", persons: "Ropers" },
    barriles: { label: "Barrel racing", person: "Barrel racer", persons: "Barrel racers" },
  },
  status: { open: "Registration open", full: "Full", finished: "Finished", draft: "Draft", published: "Published", paid: "Paid", pending: "Pending" },
  home: {
    empty: "There are no published events yet.",
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
    empty: "There are no participants with a rating in this discipline yet.", dq: "Disqualified",
    title: "Participants", subtitle: "Ropers and barrel racers with their rating and history. Public, no account needed.",
    search: "Search by name", noResults: "No results for", noRating: "No events in this discipline",
    verified: "Verified profile", unclaimed: "Unclaimed profile", rating: "Rating", eventsWord: "events", winsWord: "wins", resultsWord: "results",
    history: "Event history", noHistory: "No results recorded yet.", event: "Event", date: "Date", discipline: "Discipline", time: "Time", place: "Place",
    contactNote: "Contact details are not public. Not you, or something's wrong?", report: "Report", verifiedEvent: "Verified event",
    ratingsByMode: "Rating by discipline",
  },
  auth: {
    password: "Password", passwordHint: "At least 8 characters", signInBtn: "Sign in", participantAccess: "Participant access", errorRoleOrganizer: "That account isn't an organizer account. Choose \"Participant\" to sign in.", errorRoleParticipant: "That account isn't a participant account. Choose \"Organizer\" to sign in.", organizerAccess: "Organizer access", or: "or",
    errorInvalid: "Incorrect email or password.", errorExists: "An account with that email already exists.", errorPassword: "The password must be at least 8 characters.",
    errorGeneric: "Couldn't complete that. Please try again.", checkEmail: "We sent you an email to confirm your account. Open it and sign in again.",
    signInTitle: "Sign in", needAccount: "You need an account to continue.",
    asParticipant: "Sign in as participant", asOrganizer: "Sign in as organizer", firstTime: "First time?", createAccount: "Create account",
    participant: "Participant", organizer: "Organizer",
    participantBlurb: "Ropers, barrel racers and other participants: register for events, pay and check your history. If an organizer already added you with your email, you claim that profile here.",
    organizerBlurb: "Create and publish events, and receive registrations and payments from participants.",
    fullName: "Full name", email: "Email", create: "Create account",
  },
  account: {
    photo: { add: "Add photo", change: "Change photo", remove: "Remove", saving: "Saving…", tooBig: `The photo is larger than ${MAX_UPLOAD_MB} MB. Choose a lighter one.`, error: "Couldn't save the photo. Use a JPG, PNG or WebP image." },
    type: "Participant account", myRegistrations: "My registrations",
    noRegistrations: "You haven't registered for any event yet.", available: "Available events", noneAvailable: "No new events right now.",
    ranking: "Ranking", seeAll: "See all", publicProfile: "View my public profile and history", paid: "Paid", pending: "Payment pending",
  },
  org: {
    verify: { title: "Your account is pending verification.", text: "Meanwhile you can create and publish events. To see participants' emails and register them, an administrator must verify your account." },
    welcome: "Account created! You can now create your first event.", noEvents: "You have no events yet. Create the first one.", noParticipants: "No participants have registered yet.",
    accountType: "Organizer account", newEvent: "+ New event", events: "Events", enrolled: "Registered", collected: "Collected", myEvents: "My events", manage: "Manage",
    tabs: { admin: "Administration", summary: "Overview", participants: "Participants", app: "Local app" },
    tbl: { event: "Event", date: "Date", state: "Status", enrolled: "Registered" },
    stripe: { title: "Enable payments.", text: "Connect your Stripe account to receive registrations straight into your bank.", btn: "Connect Stripe", opening: "Opening…" },
    ev: {
      back: "My events", publicPage: "View public page", publish: "Publish", toDraft: "Move to draft", paid: "Paid", state: "Status · available in the app on sync",
      enrolledTitle: "Registered", participant: "Participant", phone: "Email", rating: "Rating", category: "Category", payment: "Payment", paidAmount: "Paid", pending: "Pending", noneEnrolled: "No one has registered yet.",
    },
    dir: { title: "Participants", blurb: "Global directory with contact details, visible to organizers only. Use it to register participants in your events.", name: "Name", email: "Email", rating: "Rating", events: "Events", wins: "Wins", profile: "Profile", verified: "Verified", unclaimed: "Unclaimed",
      addTitle: "Add participant", addBlurb: "Register them with their email so they appear in the directory and can claim their profile when they create their account.", addName: "Full name", addEmail: "Email", addEmailHint: "When the person creates their account with this email, they will claim their profile and history.",
      addConsent: "I have this person's permission to register their email.", addBtn: "Add", added: "Added:", duplicate: "That email is already registered to:",
      empty: "There are no participants in the directory yet.", errors: { unauthorized: "Only verified organizers can add participants.", invalid_name: "Enter the full name (2 to 80 characters).", invalid_email: "The email isn't valid.", consent: "You must confirm you have the person's permission.", failed: "Couldn't add them. Please try again." },
  },
    share: {
      title: "Share link", hint: "Anyone with this link can view the event and register. It opens in their language.", copy: "Copy link", copied: "Copied",
      whatsapp: "Share on WhatsApp", whatsappText: "Register for our event:", open: "Open",
      publishedTitle: "Your event is live!", publishedText: "It now appears on the website and your app will download it when it syncs. Share the link with your people:",
      draftTitle: "Saved as a draft", draftText: "It isn't visible to anyone yet. Publish it when it's ready and you'll have the link here.", draftLink: "The link will work once you publish the event.",
    },
    admin: {
      title: "Administration", blurb: "Approve the organizers who can see emails and register participants.", pending: "Pending verification", verifiedTitle: "Verified", none: "No organizers in this list.",
      name: "Name", email: "Email", since: "Signed up", verify: "Verify", revoke: "Revoke", audit: "History", auditNone: "No activity yet.", actionVerify: "verified", actionRevoke: "revoked", error: "Couldn't complete the change.",
    },
    form: {
      photosLater: "After creating the event you can add photos and choose the cover. ", 
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
      },
    },
  },
  uploader: { eventPhotos: "Event photos", add: "Add photos", hint: `JPG, PNG or WebP, up to ${MAX_UPLOAD_MB} MB each. The first one is the cover.`, cover: "Cover", makeCover: "Make cover", remove: "Delete", confirmRemove: "Delete this photo?", uploading: "Uploading…", empty: "No photos yet. The first one you upload will be the cover.", tooBig: `A photo is larger than ${MAX_UPLOAD_MB} MB and was not added.`, invalid: "One of the files isn't a valid image (JPG, PNG or WebP).", limit: "You reached the maximum of 20 photos.", failed: "Couldn't upload a photo. Please try again." },
  plural: {
    event: (n: number): string => (n === 1 ? "event" : "events"),
    win: (n: number): string => (n === 1 ? "win" : "wins"),
  },
};
