import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { BackLink, Section } from "@/components/legal-page";

export const Route = createFileRoute("/help")({ component: HelpPage });

function HelpPage() {
  return (
    <AppShell title="Help" hideNav>
      <div className="flex flex-col gap-6 pb-4">
        <BackLink />

        <Section title="How reminders work">
          <p>
            When it's time for a dose, the phone plays a chime, speaks the medicine name out
            loud, and vibrates, until you open the reminder. You can turn any of these on or off
            from the Family tab.
          </p>
        </Section>

        <Section title="The photo doesn't match — what do I do?">
          <p>
            Stop. Do not take the pill. Put it back, and check with your pharmacist or the person
            who fills your medicine before taking anything that doesn't look right. The app will
            show you both photos side by side so you can compare them yourself — trust what you
            see over what the app guesses if they disagree.
          </p>
        </Section>

        <Section title="Connecting a family member">
          <p>
            From the Family tab, tap "Create a family code" and share the code with one family
            member — by text, or just read it out loud. On their own phone, they choose "I'm
            helping a family member" and type in the code. After that, their phone shows when you
            take your medicine, with a photo, and gets an alert if a dose is missed by more than
            two hours.
          </p>
        </Section>

        <Section title="Turning off alerts, or disconnecting">
          <p>
            A family member can turn off phone alerts or fully disconnect their phone from the
            Family tab on their own device — this doesn't affect your phone. You can permanently
            delete everything that's been shared from your own Family tab at any time; see our{" "}
            <Link to="/privacy" className="font-bold text-primary underline">
              Privacy Policy
            </Link>{" "}
            for what that removes.
          </p>
        </Section>

        <Section title="The camera or a notification isn't working">
          <p>
            Camera problems are usually a phone permission — check your phone's Settings app for
            SureDose's camera permission. Missing chimes or notifications are usually a
            notification permission — the Family tab has an "Allow phone alerts" button that asks
            again if you said no by mistake.
          </p>
        </Section>

        <Section title="Still stuck">
          <p>Contact: [add your support email or phone number here before publishing].</p>
        </Section>
      </div>
    </AppShell>
  );
}
