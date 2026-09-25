import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { BackLink, Section } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  return (
    <AppShell title="Terms of Use" hideNav>
      <div className="flex flex-col gap-6 pb-4">
        <BackLink />

        <section className="rounded-xl bg-danger p-5 text-danger-fg shadow-card">
          <h2 className="text-2xl font-bold">This is not medical advice</h2>
          <p className="mt-2 text-xl leading-relaxed">
            SureDose is a reminder and organization tool. The photo check is a second look, not a
            medical judgment — it can be wrong. Always look at your pills yourself. If anything
            looks different, or you are not sure, stop and call your pharmacist or doctor before
            taking it. If someone is having a medical emergency, call emergency services right
            away instead of using this app.
          </p>
        </section>

        <Section title="What this app is for">
          SureDose helps you keep track of when to take medicine you and your doctor have already
          decided on, and lets a family member optionally see that it was taken. It does not
          prescribe, diagnose, or recommend any medicine, dose, or treatment.
        </Section>

        <Section title="Use at your own risk">
          The photo-matching feature uses AI, which can make mistakes — it may say a pill matches
          when it shouldn't, or the reverse. Reminders depend on your phone staying on, charged,
          and connected, and on notification permission being granted. We do our best to make
          these reliable, but we can't guarantee they will never fail, and you are responsible for
          your own medicine decisions.
        </Section>

        <Section title="Connecting a family member">
          If you create or join a family code, you're agreeing that whoever holds that code can
          see the shared information described in our{" "}
          <Link to="/privacy" className="font-bold text-primary underline">
            Privacy Policy
          </Link>
          . Only share the code with someone you trust.
        </Section>

        <Section title="Who this is for">
          This app is meant for adults managing their own medicine, or a family member helping
          them. It is not intended for use by children.
        </Section>

        <Section title="Changes">
          We may update these terms as the app changes. We'll update the date at the top of this
          page when we do.
        </Section>

        <Section title="Questions">
          Contact: [add your support email here before publishing].
        </Section>

        <p className="text-lg text-muted">
          This page is a starting-point draft written to match what the app actually does, not
          professionally reviewed legal text. Have a lawyer review it before you publish,
          especially the medical-advice and liability sections.
        </p>
      </div>
    </AppShell>
  );
}
