import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Heart, ShieldAlert, Trash2, Volume2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { requestNotifyPermission } from "@/lib/alerts";
import { createHousehold, deleteHousehold } from "@/lib/care";
import { disableCaregiverAlerts } from "@/lib/push-client";
import { buildDaySlots, formatClock, formatTimeLabel } from "@/lib/schedule";
import { buildTakenMessage, copyText, digitsOnly, formatPhoneDisplay, smsHref } from "@/lib/sms";
import { useAppStore } from "@/lib/store";
import { useHydrated, useNow } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/family")({ component: FamilyPage });

function FamilyPage() {
  const ready = useHydrated();
  const settings = useAppStore((s) => s.settings);

  if (!ready) {
    return (
      <AppShell title="Family">
        <p className="text-xl text-muted">Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="Family">
      {settings.role === "caregiver" ? <CaregiverFamilyPage /> : <PatientFamilyPage />}
    </AppShell>
  );
}

function CaregiverFamilyPage() {
  const settings = useAppStore((s) => s.settings);
  const leaveHousehold = useAppStore((s) => s.leaveHousehold);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl bg-paper p-5 shadow-card">
        <p className="flex items-center gap-2 text-lg font-bold text-muted">
          <Heart className="size-5" />
          Connected to
        </p>
        <h2 className="mt-2 text-3xl font-bold leading-tight">{settings.patientName}</h2>
        <p className="mt-2 text-lg text-muted">Family code: {settings.householdCode}</p>
      </section>

      <section className="rounded-xl bg-paper p-5 shadow-card">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldAlert className="size-6" />
          Stop getting alerts
        </h2>
        <p className="mt-2 text-xl text-muted">
          This disconnects this phone from {settings.patientName}'s family code and turns off
          alerts here.
        </p>
        {confirming ? (
          <div className="mt-4 flex flex-col gap-3">
            <Button
              size="xl"
              variant="danger"
              disabled={disconnecting}
              onClick={async () => {
                setDisconnecting(true);
                await disableCaregiverAlerts().catch(() => undefined);
                leaveHousehold();
              }}
            >
              {disconnecting ? "Disconnecting…" : "Yes, disconnect this phone"}
            </Button>
            <Button size="xl" variant="secondary" onClick={() => setConfirming(false)}>
              Never mind
            </Button>
          </div>
        ) : (
          <Button size="xl" variant="secondary" className="mt-4 w-full" onClick={() => setConfirming(true)}>
            Disconnect this phone
          </Button>
        )}
      </section>

      <LegalFooterLinks />
    </div>
  );
}

function PatientFamilyPage() {
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

  const takenCount = slots.filter((s) => s.status === "taken").length;
  const allTaken = slots.length > 0 && takenCount === slots.length;

  return (
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

      <ConnectFamilySection />

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

      <LegalFooterLinks />
    </div>
  );
}

function ConnectFamilySection() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const medicines = useAppStore((s) => s.medicines);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const inviteMessage = `Hi ${settings.caregiverName || "there"}, it's ${settings.patientName || "me"}. Open SureDose and enter this family code to get updates when I take my medicine: ${settings.householdCode}`;

  return (
    <section className="rounded-xl bg-paper p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-2xl font-bold">
        <Heart className="size-6" />
        Connect a family member
      </h2>
      {settings.householdCode ? (
        <>
          <p className="mt-2 text-xl text-muted">
            Share this code so a family member's phone can see when you take your medicine, with
            a photo, and get alerted if a dose is missed.
          </p>
          <p className="mt-4 rounded-md bg-bg p-4 text-center text-4xl font-bold tracking-[0.2em]">
            {settings.householdCode}
          </p>
          {digitsOnly(settings.caregiverPhone) ? (
            <a
              href={smsHref(settings.caregiverPhone, inviteMessage)}
              className="mt-4 inline-flex min-h-20 w-full items-center justify-center rounded-lg bg-primary px-6 text-2xl font-bold text-primary-fg shadow-card"
            >
              Text this code to {settings.caregiverName || "family"}
            </a>
          ) : (
            <p className="mt-4 text-lg text-muted">
              Add a phone number above to text this code, or read it to them out loud.
            </p>
          )}

          <div className="mt-6 border-t border-line pt-4">
            {confirmingDelete ? (
              <div className="flex flex-col gap-3">
                <p className="text-lg font-bold text-danger">
                  This permanently deletes the family code and everything shared under it — there
                  is no undo.
                </p>
                <Button
                  size="lg"
                  variant="danger"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await deleteHousehold({ data: { code: settings.householdCode } });
                      setSettings({ householdCode: "" });
                    } finally {
                      setDeleting(false);
                      setConfirmingDelete(false);
                    }
                  }}
                >
                  <Trash2 className="size-5" />
                  {deleting ? "Deleting…" : "Yes, delete everything shared"}
                </Button>
                <Button size="lg" variant="secondary" onClick={() => setConfirmingDelete(false)}>
                  Never mind
                </Button>
              </div>
            ) : (
              <Button
                size="lg"
                variant="ghost"
                className="w-full text-danger"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="size-5" />
                Delete shared data
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-xl text-muted">
            Get a code to share with one family member. Once they enter it, they can see when you
            take your medicine, with a photo, and get an alert if a dose is missed.
          </p>
          {error ? <p className="mt-2 text-lg font-bold text-danger">{error}</p> : null}
          <Button
            size="xl"
            className="mt-4 w-full"
            disabled={creating}
            onClick={async () => {
              setCreating(true);
              setError("");
              try {
                const res = await createHousehold({
                  data: {
                    patientName: settings.patientName,
                    caregiverName: settings.caregiverName,
                    caregiverPhone: settings.caregiverPhone,
                  },
                });
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setSettings({ householdCode: res.code });
                const { syncMedicines } = await import("@/lib/care");
                void syncMedicines({
                  data: {
                    code: res.code,
                    medicines: medicines.map((m) => ({
                      id: m.id,
                      name: m.name,
                      strength: m.strength,
                      times: m.times,
                    })),
                  },
                }).catch(() => undefined);
              } catch {
                setError("Could not create a code. Check your connection and try again.");
              } finally {
                setCreating(false);
              }
            }}
          >
            {creating ? "Creating…" : "Create a family code"}
          </Button>
        </>
      )}
    </section>
  );
}

function LegalFooterLinks() {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-2 text-lg font-bold text-muted underline">
      <Link to="/help">Help</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/terms">Terms</Link>
    </div>
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
