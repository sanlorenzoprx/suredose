import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { BackLink, Section } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <AppShell title="Privacy Policy" hideNav>
      <div className="flex flex-col gap-6 pb-4">
        <BackLink />

        <p className="text-lg text-muted">
          Last updated: this is a starting-point policy for the SureDose MVP. Replace this line
          with your real launch date, and have a lawyer review this page before you rely on it —
          see the note at the end.
        </p>

        <Section title="The short version">
          SureDose keeps your medicine list, photos, and schedule on your own phone. To check a
          new medicine, the app looks up its name, strength, and product code in public U.S.
          government drug lists — nothing about you is sent. Your personal information leaves your
          phone only if you choose to connect a family member. If you do, only what they need to
          see — the medicine names and times, and a photo each time you confirm a dose — is shared
          with them. We do not sell your data or show you ads.
        </Section>

        <Section title="Information stored only on your phone">
          Your medicine names, strengths, pill and bottle photos, schedule, dose history, and your
          own and your family member's names and phone number are stored in your phone's local
          storage. We do not receive or see this information unless you connect a family member
          (below).
        </Section>

        <Section title="Information shared if you connect a family member">
          <p>
            Connecting a family member is optional and creates a shared family code. If you use
            it, this leaves your phone and is stored on our server, reachable by anyone who has
            that code:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Your first name and your family member's first name and phone number</li>
            <li>Each medicine's name, strength, and scheduled times (not its photo)</li>
            <li>
              Each time a dose is confirmed or missed: the time, whether it was photo-checked, and
              the confirmation photo taken at that moment
            </li>
            <li>
              Technical identifiers needed to send a phone notification, if your family member
              turns on alerts
            </li>
          </ul>
          <p className="mt-2">
            Treat the family code like a shared link: anyone who has the exact code can see this
            information. You can permanently delete all of it at any time — see "Deleting your
            data" below.
          </p>
        </Section>

        <Section title="Checking your medicine against U.S. drug data">
          <p>
            When you add a medicine, the app sends the medicine name, strength, and the product
            code (NDC) printed on the bottle to our server. Our server looks them up in free public
            drug databases run by the U.S. government: the FDA's drug directory (openFDA) and the
            National Library of Medicine's DailyMed and RxNorm. This is how the app fills in the
            medicine for you and shows the maker's photo of the pill.
          </p>
          <p className="mt-2">
            Your name, your photos, your pharmacy, and your prescription number are never sent for
            this. Our server keeps a shared copy of the public drug facts and pill photos it looks
            up, so the next person with the same medicine gets an answer faster; that copy contains
            nothing about who asked.
          </p>
        </Section>

        <Section title="A third-party AI service reads your photos">
          Reading a prescription bottle and comparing a pill photo to your saved reference photo
          is done by sending that photo to a third-party AI service (currently Google's Gemini
          models on Google Cloud Vertex AI) for that one request. We don't control how that
          provider handles the request on their end beyond what they publish themselves.
        </Section>

        <Section title="Deleting your data">
          If you never connect a family member, none of your personal information is stored on
          our server, and uninstalling the app removes everything. (The public drug facts described
          above are not personal and are not linked to you.) If you have connected a family member, the patient's Family
          tab has a "Delete shared data" option that permanently deletes the family code and
          everything stored under it from our server, immediately, with no account or login
          needed. A family member can also disconnect their own phone at any time from their
          Family tab, which stops new alerts to that phone.
        </Section>

        <Section title="What we don't do">
          We don't sell your information, show ads, or use your data to train AI models. We don't
          knowingly collect information from children — this app is meant for adults managing
          their own medicine or a family member's.
        </Section>

        <Section title="Questions">
          <p>
            Contact: [add your support email here before publishing]. See also our{" "}
            <Link to="/terms" className="font-bold text-primary underline">
              Terms of Use
            </Link>
            , which includes an important note that this app is not medical advice.
          </p>
        </Section>

        <p className="text-lg text-muted">
          This page was drafted to accurately describe what the current app code actually does, so
          it doesn't promise more privacy than the app delivers or less than it does — but it is a
          draft, not legal advice. Have a lawyer review it, and update the contact details and
          "last updated" date, before you publish.
        </p>
      </div>
    </AppShell>
  );
}
