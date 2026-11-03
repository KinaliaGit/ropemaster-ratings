import { LEGAL, type LegalDoc } from "@/lib/legal";

const resp = `${LEGAL.entity}`;

export const termsEn: LegalDoc = {
  title: "Terms and Conditions", updated: "Version", draft: "Draft pending legal review",
  sections: [
    { h: "1. Acceptance", p: [`By creating an account or using Rope Master Ratings (the “Service”) you accept these Terms and Conditions and the Privacy Notice. If you don't agree, don't use the Service. The Service is operated by ${resp}.`] },
    { h: "2. What the Service is", p: ["Rope Master Ratings is a global registry of rodeo event participants (for now, roping): it gathers their rating and results history, publishes organizers' events, and lets you register and pay the entry fee.", "The Service is independent from the Rope Master software, which is governed by its own license agreement."] },
    { h: "3. Accounts", p: ["There are two account types: participant and organizer. You must provide truthful information, keep it up to date, and you are responsible for activity on your account.", "We verify your mobile number with a code. A number may only be used to claim profiles that truly belong to you.", "If you are under 18, you need the authorization of your parent or legal guardian to create an account and take part."] },
    { h: "4. Profiles created by organizers", p: ["An organizer may register a participant with their name and mobile number, and in doing so declares they have authorization to do so. If an organizer registered you, you can claim that profile, ask for it to be corrected, or ask for it to be deleted (see the Privacy Notice)."] },
    { h: "5. Rating and results", p: ["The rating (1 to 10, per discipline) is calculated automatically from results captured by organizers. It is informational and may be corrected if errors are found. We do not guarantee it reflects your actual level."] },
    { h: "6. Events, registrations and payments", p: ["Events are organized and published by organizers, who are responsible for their content, capacity, rules, prizes and delivery. We are not the organizers of the events.", "Entry fees are processed by Stripe. We do not store your card details. Cancellation and refund conditions are set by the event organizer, without prejudice to your consumer rights."] },
    { h: "7. Content you upload", p: ["You are responsible for the photos and other content you upload (for example your profile photo or event photos) and you declare you have the right to use them. You grant us a limited permission to display them within the Service. We may remove content that is unlawful, offensive or infringes third-party rights."] },
    { h: "8. Acceptable use", p: ["Do not use the Service to impersonate others, manipulate ratings or results, post unlawful content, attempt to access data that isn't yours, or interfere with its operation."] },
    { h: "9. Intellectual property", p: ["The Service, its design, trademarks and software belong to their owners and are protected by law. These terms do not transfer any rights over them to you."] },
    { h: "10. Liability", p: ["Taking part in rodeo events involves physical risks that you assume. The Service is provided “as is” and, to the extent permitted by law, we are not liable for damages arising from events, organizers' errors or interruptions of the Service."] },
    { h: "11. Suspension", p: ["We may suspend or close accounts that breach these terms. You may close your account at any time by writing to us."] },
    { h: "12. Changes", p: ["We may update these terms. We will publish the new version with its date and, for important changes, let you know."] },
    { h: "13. Governing law and contact", p: ["These terms are governed by the laws of the United Mexican States. Disputes with consumers may be resolved before PROFECO or the competent courts; in other cases, before the courts of Chihuahua City, Chihuahua.", `Controller's address: ${LEGAL.address}. Contact: ${LEGAL.email}.`] },
  ],
};

export const privacyEn: LegalDoc = {
  title: "Privacy Notice", updated: "Version", draft: "Draft pending legal review",
  sections: [
    { h: "1. Controller", p: [`${resp} is responsible for the processing of your personal data. Address: ${LEGAL.address}. Contact: ${LEGAL.email}.`] },
    { h: "2. Data we collect", p: ["Account: full name, mobile number and, for organizers, email address.", "Sports profile: rating per discipline, events and results (times and placings) and, if you add it, your profile photo.", "Registrations and payments: events you register for and payment status. Your card details are processed by Stripe and are not stored by us.", "Technical: one cookie required to keep you signed in.", "We do not collect sensitive personal data."] },
    { h: "3. What we use it for", p: ["Necessary purposes: creating and managing your account; verifying your mobile number with a code sent by SMS or WhatsApp; recognizing that you are the same person across events and linking your history and rating; enabling your registration and payment; displaying ratings and results; syncing events and registrants with the organizer's Rope Master app; and security and fraud prevention.", "We do not use your data for marketing without your additional consent."] },
    { h: "4. What is public and what isn't", p: ["Public: your name, rating, results history and your profile photo if you choose to add one.", "Visible only to organizers with an account: your mobile number. It is never shown on public pages."] },
    { h: "5. Your mobile number", p: ["We use it to verify your identity and as a key to recognize you across events. Organizers with an account can see it in the participant directory and in their Rope Master app in order to register you for their events, and must use it only to manage those events. We store it with security measures and do not sell it."] },
    { h: "6. If an organizer registered you", p: ["An organizer may have created your profile with your name and mobile number. You can claim it by verifying your number, ask for it to be corrected, or ask for it to be deleted by writing to " + LEGAL.email + "."] },
    { h: "7. Transfers and providers", p: ["We do not sell your data. We share it with organizers as described in section 5 and use providers that process it on our behalf: Stripe (payments), a messaging provider (verification codes) and an infrastructure and database provider. Some may store or process data outside Mexico."] },
    { h: "8. Your rights and consent", p: [`You may access, rectify, cancel or object to the processing of your data, revoke your consent and limit its use. Write to ${LEGAL.email} with your full name, the right you wish to exercise and your registered mobile number. We will respond within 20 days. If you believe your right was not honored, you may contact the Mexican Secretaría Anticorrupción y Buen Gobierno.`] },
    { h: "9. Retention", p: ["We keep your data while your account is active and for up to 3 years after you close it, unless the law requires a longer period."] },
    { h: "10. Cookies", p: ["We only use the cookie required to keep you signed in; we do not use advertising or analytics cookies. Stripe may use its own at checkout."] },
    { h: "11. Changes to this notice", p: ["We will publish any change on this page with its version and date."] },
  ],
};
