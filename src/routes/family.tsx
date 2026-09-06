import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bell, Heart, Volume2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { requestNotifyPermission } from "@/lib/alerts";
import { buildDaySlots, formatClock, formatTimeLabel } from "@/lib/schedule";
import { buildTakenMessage, copyText, digitsOnly, formatPhoneDisplay, smsHref } from "@/lib/sms";
import { useAppStore } from "@/lib/store";
import { useHydrated, useNow } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/family")({ component: FamilyPage });

function FamilyPage() {
  const ready = useHydrated();
  const now = useNow(30_000);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const medicines = useAppStore((s) => s.medicines);
  const events = useAppStore((s) => s.events);
  const slots = buildDaySlots(medicines, events, now);
  const takenToday = events
    .filter((e) => e.status === "taken")
    .sort((a, b) => (b.takenAt ?? 0) - (a.takenAt ?? 0))
    .slice(0, 8);

  if (!ready) {
    return (
      <AppShell title="Family">
        <p className="text-xl text-muted">Loading…</p>
      </AppShell>
    );
  }

  const takenCount = slots.filter((s) => s.status === "taken").length;
  const allTaken = slots.length > 0 && takenCount === slots.length;

  return (
    <AppShell title="Family">
      <div className="flex flex-col gap-6">
        <section className="rounded-xl bg-paper p-5 shadow-card">
          <p className="flex items-center gap-2 text-lg font-bold text-muted">
            <Heart className="size-5" />
            Today for {settings.patientName || "you"}
          </p>
          <h2 className="mt-2 text-3xl font-bold leading-tight">
            {allTaken
              ? "Every pill is taken."
              : takenCount === 0
                ? "No pills taken yet today."
                : `${takenCount} of ${slots.length} pills taken.`}
          </h2>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Who gets the text</h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="patient">Your first name</Label>
            <Input
              id="patient"
              value={settings.patientName}
              onChange={(e) => setSettings({ patientName: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="caregiver">Family member's name</Label>
            <Input
              id="caregiver"
              value={settings.caregiverName}
              onChange={(e) => setSettings({ caregiverName: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Their phone number</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              value={settings.caregiverPhone}
              onChange={(e) => setSettings({ caregiverPhone: e.target.value })}
            />
          </div>
          <p className="text-lg text-muted">
            After a correct pill is taken, your phone opens a text that is already written. Tap Send.
            {settings.caregiverPhone
              ? ` Texts go to ${formatPhoneDisplay(settings.caregiverPhone)}.`
              : ""}
          </p>
        </section>

        <section className="rounded-xl bg-paper p-5 shadow-card">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <Bell className="size-6" />
            Alerts
          </h2>
          <ToggleRow
            label="Play a loud chime"
            on={settings.soundOn}
            onChange={(soundOn) => setSettings({ soundOn })}
          />
          <ToggleRow
            label="Vibrate the phone"
            on={settings.vibrateOn}
            onChange={(vibrateOn) => setSettings({ vibrateOn })}
          />
          <ToggleRow
            label="Speak the medicine name"
            on={settings.speakOn}
            onChange={(speakOn) => setSettings({ speakOn })}
          />
          <Button
            size="lg"
            variant="secondary"
            className="mt-4 w-full"
            onClick={() => void requestNotifyPermission()}
          >
            <Volume2 className="size-6" />
            Allow phone alerts
          </Button>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-bold">Taken recently</h2>
          {takenToday.length === 0 ? (
            <p className="text-xl text-muted">Nothing taken yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {takenToday.map((e) => {
                const med = medicines.find((m) => m.id === e.medicineId);
                return (
                  <li key={e.id} className="rounded-lg bg-paper p-4 shadow-card">
                    <p className="text-xl font-bold">{med?.name ?? "Medicine"}</p>
                    <p className="text-lg text-muted">
                      {e.takenAt ? formatClock(new Date(e.takenAt)) : formatTimeLabel(e.time)}
                      {e.verified ? " · Checked with photo" : " · Marked taken"}
                      {e.notified ? " · Family texted" : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <TestTextButton />
      </div>
    </AppShell>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="mt-3 flex min-h-16 w-full items-center justify-between gap-4 rounded-md bg-bg px-4 text-left text-xl font-bold"
    >
      {label}
      <span
        aria-hidden="true"
        className={cn(
          "relative h-10 w-16 shrink-0 rounded-full",
          on ? "bg-primary" : "bg-line",
        )}
      >
        <span
          className={cn(
            "absolute top-1 left-1 size-8 rounded-full bg-paper shadow-card transition-transform duration-150 ease-out",
            on ? "translate-x-6" : "translate-x-0",
          )}
        />
      </span>
      <span className="sr-only">{on ? "On" : "Off"}</span>
    </button>
  );
}

function TestTextButton() {
  const settings = useAppStore((s) => s.settings);
  const medicines = useAppStore((s) => s.medicines);
  const [note, setNote] = useState<string | null>(null);

  const sample = medicines[0];
  const body = buildTakenMessage({
    patientName: settings.patientName || "Margaret",
    caregiverName: settings.caregiverName,
    medicineName: sample?.name ?? "Lisinopril",
    strength: sample?.strength ?? "10 mg",
    timeLabel: formatClock(new Date()),
  });

  return (
    <section className="rounded-xl bg-paper p-5 shadow-card">
      <h2 className="text-2xl font-bold">Send a test text</h2>
      <p className="mt-2 text-xl text-muted">See the exact message your family will get.</p>
      <p className="mt-4 rounded-md bg-bg p-4 text-xl leading-snug">{body}</p>
      {digitsOnly(settings.caregiverPhone) ? (
        <a
          href={smsHref(settings.caregiverPhone, body)}
          className="mt-4 inline-flex min-h-20 w-full items-center justify-center rounded-lg bg-primary px-6 text-2xl font-bold text-primary-fg shadow-card"
          onClick={() => void copyText(body).then((ok) => setNote(ok ? "Message copied. Tap Send on the next screen." : "Tap Send on the next screen."))}
        >
          Send test text
        </a>
      ) : (
        <Button size="xl" className="mt-4" onClick={() => setNote("Add a phone number first.")}>
          Send test text
        </Button>
      )}
      {note ? <p className="mt-3 text-lg font-bold">{note}</p> : null}
    </section>
  );
}
