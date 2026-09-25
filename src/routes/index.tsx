import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bell, Check, Clock, Heart, Pill, Plus, RefreshCw, Volume2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  requestNotifyPermission,
  showDoseNotification,
  startDoseAlarm,
  stopDoseAlarm,
} from "@/lib/alerts";
import { getHousehold } from "@/lib/care";
import { enableCaregiverAlerts } from "@/lib/push-client";
import {
  buildDaySlots,
  currentDose,
  dueQueue,
  formatClock,
  formatTimeLabel,
  nextUpcoming,
  periodOfDay,
} from "@/lib/schedule";
import { useAppStore } from "@/lib/store";
import { useCareActivity } from "@/lib/use-care-activity";
import { useNow } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const now = useNow();
  const navigate = useNavigate();
  const settings = useAppStore((s) => s.settings);
  const medicines = useAppStore((s) => s.medicines);
  const events = useAppStore((s) => s.events);
  const alarmMutedUntil = useAppStore((s) => s.alarmMutedUntil);
  const muteAlarm = useAppStore((s) => s.muteAlarm);
  const loadSamples = useAppStore((s) => s.loadSamples);

  const slots = buildDaySlots(medicines, events, now);
  const due = currentDose(slots);
  const dueList = dueQueue(slots);
  const next = nextUpcoming(slots);
  const takenCount = slots.filter((s) => s.status === "taken").length;
  const alarmLive = Boolean(due) && Date.now() >= alarmMutedUntil;
  const isCaregiver = settings.onboardingDone && settings.role === "caregiver";

  useEffect(() => {
    if (isCaregiver || !due || !alarmLive || !settings.onboardingDone) {
      stopDoseAlarm();
      return;
    }
    const name = [due.medicine.name, due.medicine.strength].filter(Boolean).join(" ");
    const phrase = `It is time to take your ${name}.`;
    startDoseAlarm({
      soundOn: settings.soundOn,
      vibrateOn: settings.vibrateOn,
      speakOn: settings.speakOn,
      phrase,
    });
    showDoseNotification("Time for your pill", phrase);
    return () => stopDoseAlarm();
  }, [
    isCaregiver,
    due?.medicine.id,
    due?.time,
    alarmLive,
    settings.soundOn,
    settings.vibrateOn,
    settings.speakOn,
    settings.onboardingDone,
  ]);

  if (!settings.onboardingDone) {
    return (
      <AppShell title="Welcome" hideNav>
        <Onboarding />
      </AppShell>
    );
  }

  if (isCaregiver) {
    return (
      <AppShell>
        <CaregiverHome />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-lg font-bold text-muted">
            {settings.patientName ? `Hello, ${settings.patientName}` : "Hello"}
          </p>
          <p className="mt-1 text-5xl font-bold tabular-nums leading-none">{formatClock(now)}</p>
        </div>

        {due ? (
          <section className="rounded-xl bg-due p-5 text-due-fg shadow-card alert-pulse">
            <p className="flex items-center gap-2 text-lg font-bold uppercase tracking-wide">
              <Bell className="size-5" />
              Time for your pill
            </p>
            <div className="mt-4 flex items-center gap-4">
              <PillThumb src={due.medicine.pillImage} alt={due.medicine.name} official={due.medicine.pillImageSource === "official"} />
              <div>
                <h2 className="text-3xl font-bold leading-tight">{due.medicine.name}</h2>
                <p className="text-xl opacity-90">{due.medicine.strength}</p>
                <p className="mt-1 text-lg opacity-80">
                  {periodOfDay(due.time)} · {formatTimeLabel(due.time)}
                </p>
              </div>
            </div>
            {due.medicine.instructions ? (
              <p className="mt-4 text-xl leading-snug">{due.medicine.instructions}</p>
            ) : null}
            {dueList.length > 1 ? (
              <p className="mt-3 text-lg opacity-80">Then {dueList.length - 1} more after this one.</p>
            ) : null}
            <div className="mt-5 flex flex-col gap-3">
              <Button
                size="xl"
                variant="success"
                onClick={() =>
                  navigate({
                    to: "/check",
                    search: { medicineId: due.medicine.id, date: due.date, time: due.time, practice: false },
                  })
                }
              >
                I have this pill
              </Button>
              <Button size="xl" variant="secondary" onClick={() => muteAlarm(10 * 60 * 1000)}>
                Remind me in 10 minutes
              </Button>
            </div>
          </section>
        ) : next ? (
          <section className="rounded-xl bg-paper p-5 shadow-card">
            <p className="flex items-center gap-2 text-lg font-bold text-muted">
              <Clock className="size-5" />
              Next pill
            </p>
            <div className="mt-4 flex items-center gap-4">
              <PillThumb src={next.medicine.pillImage} alt={next.medicine.name} official={next.medicine.pillImageSource === "official"} />
              <div>
                <h2 className="text-3xl font-bold leading-tight">{next.medicine.name}</h2>
                <p className="text-xl text-muted">{next.medicine.strength}</p>
                <p className="mt-1 text-2xl font-bold">
                  {periodOfDay(next.time)} · {formatTimeLabel(next.time)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xl text-muted">
              We will ring, speak, and vibrate when it is time.
            </p>
            <Button
              size="xl"
              className="mt-5"
              onClick={() =>
                navigate({
                  to: "/check",
                  search: { medicineId: next.medicine.id, date: next.date, time: next.time, practice: true },
                })
              }
            >
              Practice taking this pill
            </Button>
          </section>
        ) : medicines.length === 0 ? (
          <EmptyMedicines onSample={loadSamples} />
        ) : (
          <section className="rounded-xl bg-success p-5 text-success-fg shadow-card">
            <p className="flex items-center gap-2 text-lg font-bold uppercase tracking-wide">
              <Check className="size-5" />
              All done for today
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight">
              You took every pill on today's list.
            </h2>
            <p className="mt-2 text-xl opacity-90">Your family can rest easy.</p>
          </section>
        )}

        {medicines.length > 0 ? (
          <section>
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-2xl font-bold">Today</h2>
              <p className="text-lg font-bold text-muted tabular-nums">
                {takenCount} of {slots.length} taken
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {slots.map((slot) => (
                <li
                  key={`${slot.medicine.id}-${slot.time}`}
                  className="flex items-center gap-4 rounded-lg bg-paper p-3 shadow-card"
                >
                  <PillThumb src={slot.medicine.pillImage} alt="" size="sm" official={slot.medicine.pillImageSource === "official"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-bold">{slot.medicine.name}</p>
                    <p className="text-lg text-muted">
                      {formatTimeLabel(slot.time)} · {slot.medicine.strength}
                    </p>
                  </div>
                  <StatusChip status={slot.status} />
                </li>
              ))}
            </ul>
            <Link to="/add" className="mt-4 block">
              <Button size="xl" variant="secondary" className="w-full">
                <Plus className="size-7" />
                Add a medicine
              </Button>
            </Link>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function StatusChip({ status }: { status: "upcoming" | "due" | "taken" | "missed" }) {
  const map = {
    upcoming: { label: "Later", className: "bg-bg-warm text-ink" },
    due: { label: "Now", className: "bg-due text-due-fg" },
    taken: { label: "Taken", className: "bg-success text-success-fg" },
    missed: { label: "Missed", className: "bg-danger text-danger-fg" },
  } as const;
  const item = map[status];
  return (
    <span className={cn("rounded-sm px-3 py-2 text-base font-bold", item.className)}>
      {item.label}
    </span>
  );
}

function PillThumb({
  src,
  alt,
  size = "md",
  official = false,
}: {
  src: string;
  alt: string;
  size?: "sm" | "md";
  /** Maker's photos show front and back side by side, so fit rather than crop. */
  official?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-md bg-bg-warm",
        size === "sm" ? "size-16" : "size-24",
      )}
    >
      {src ? (
        <img src={src} alt={alt} className={official ? "size-full object-contain" : "size-full object-cover"} />
      ) : (
        <div className="flex size-full items-center justify-center text-muted">
          <Pill className="size-8" />
        </div>
      )}
    </div>
  );
}

function EmptyMedicines({ onSample }: { onSample: () => void }) {
  return (
    <section className="rounded-xl bg-paper p-5 shadow-card">
      <Pill className="size-10 text-primary" />
      <h2 className="mt-3 text-3xl font-bold leading-tight">Add your first medicine</h2>
      <p className="mt-3 text-xl text-muted">
        Take a picture of the bottle. Then take a picture of the pill. We will set the times
        and remember what it looks like.
      </p>
      <Link to="/add" className="mt-5 block">
        <Button size="xl" className="w-full">
          <Plus className="size-7" />
          Add a medicine
        </Button>
      </Link>
      <Button size="xl" variant="secondary" className="mt-3" onClick={onSample}>
        Try a sample day
      </Button>
    </section>
  );
}

function Onboarding() {
  const [step, setStep] = useState<"choose" | "patient" | "caregiver">("choose");

  if (step === "choose") {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-2xl leading-snug text-muted">Whose phone is this?</p>
        <Button size="xl" onClick={() => setStep("patient")}>
          <Pill className="size-7" />
          I take medicine
        </Button>
        <Button size="xl" variant="secondary" onClick={() => setStep("caregiver")}>
          <Heart className="size-7" />
          I'm helping a family member
        </Button>
        <Link
          to="/privacy"
          className="mt-2 text-center text-lg font-bold text-muted underline"
        >
          Privacy Policy
        </Link>
      </div>
    );
  }

  if (step === "caregiver") {
    return <CaregiverJoin onBack={() => setStep("choose")} />;
  }

  return <PatientOnboarding onBack={() => setStep("choose")} />;
}

function PatientOnboarding({ onBack }: { onBack: () => void }) {
  const setSettings = useAppStore((s) => s.setSettings);
  const loadSamples = useAppStore((s) => s.loadSamples);
  const settings = useAppStore((s) => s.settings);

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setSettings({ role: "patient", onboardingDone: true });
        void requestNotifyPermission();
      }}
    >
      <p className="text-2xl leading-snug text-muted">
        This app helps you take the right pill at the right time. Then it texts someone you love.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="patient">Your first name</Label>
        <Input
          id="patient"
          autoComplete="given-name"
          value={settings.patientName}
          onChange={(e) => setSettings({ patientName: e.target.value })}
          placeholder="For example, Margaret"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="caregiver">Family member's first name</Label>
        <Input
          id="caregiver"
          value={settings.caregiverName}
          onChange={(e) => setSettings({ caregiverName: e.target.value })}
          placeholder="For example, Alex"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Their phone number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={settings.caregiverPhone}
          onChange={(e) => setSettings({ caregiverPhone: e.target.value })}
          placeholder="555-010-1234"
        />
        <p className="text-lg text-muted">We will open a text to this number after you take a pill.</p>
      </div>

      <div className="rounded-lg bg-paper p-4 shadow-card">
        <p className="flex items-center gap-2 text-xl font-bold">
          <Volume2 className="size-6" />
          Alerts stay on
        </p>
        <p className="mt-2 text-lg text-muted">
          When it is time, the phone will speak the medicine name, play a chime, and vibrate.
        </p>
      </div>

      <Button type="submit" size="xl">
        I am ready
      </Button>
      <Button
        type="button"
        size="xl"
        variant="secondary"
        onClick={() => {
          loadSamples();
          void requestNotifyPermission();
        }}
      >
        Show me a sample day
      </Button>
      <Button type="button" size="xl" variant="secondary" onClick={onBack}>
        Back
      </Button>
    </form>
  );
}

function CaregiverJoin({ onBack }: { onBack: () => void }) {
  const setSettings = useAppStore((s) => s.setSettings);
  const settings = useAppStore((s) => s.settings);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "error">("idle");
  const [error, setError] = useState("");

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const trimmed = code.trim();
        if (!trimmed) return;
        setStatus("checking");
        setError("");
        try {
          const res = await getHousehold({ data: { code: trimmed } });
          if (!res.ok) {
            setStatus("error");
            setError(res.error);
            return;
          }
          setSettings({
            role: "caregiver",
            householdCode: trimmed.toUpperCase(),
            patientName: res.patientName,
            onboardingDone: true,
          });
        } catch {
          setStatus("error");
          setError("Something went wrong. Check your connection and try again.");
        }
      }}
    >
      <p className="text-2xl leading-snug text-muted">
        Enter the family code from your family member's phone. You will see when they take their
        medicine, with a photo, and get an alert if a dose is missed.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="your-name">Your first name</Label>
        <Input
          id="your-name"
          autoComplete="given-name"
          value={settings.caregiverName}
          onChange={(e) => setSettings({ caregiverName: e.target.value })}
          placeholder="For example, Alex"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="code">Family code</Label>
        <Input
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="For example, K3F7QM"
          autoCapitalize="characters"
        />
        {status === "error" ? <p className="text-lg font-bold text-danger">{error}</p> : null}
      </div>

      <Button type="submit" size="xl" disabled={status === "checking" || !code.trim()}>
        {status === "checking" ? "Checking…" : "Connect"}
      </Button>
      <Button type="button" size="xl" variant="secondary" onClick={onBack}>
        Back
      </Button>
    </form>
  );
}

function CaregiverHome() {
  const settings = useAppStore((s) => s.settings);
  const { data, error, loading, reload } = useCareActivity(20);
  const [alertStatus, setAlertStatus] = useState<"idle" | "working" | "on" | "error">("idle");
  const [alertError, setAlertError] = useState("");

  const todaySlots = (data?.medicines ?? []).flatMap((m) => m.times.map((t) => `${m.id}|${t}`));
  const today = new Date().toISOString().slice(0, 10);
  const takenToday = (data?.activity ?? []).filter((a) => a.date === today && a.status === "taken").length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-lg font-bold text-muted">Alerts for</p>
        <h1 className="text-4xl font-bold leading-tight">{data?.patientName ?? settings.patientName}</h1>
      </div>

      {loading ? (
        <p className="text-xl text-muted">Loading…</p>
      ) : error ? (
        <section className="rounded-xl bg-danger p-5 text-danger-fg shadow-card">
          <p className="text-xl font-bold">{error}</p>
        </section>
      ) : (
        <>
          {todaySlots.length > 0 ? (
            <section className="rounded-xl bg-paper p-5 shadow-card">
              <p className="text-lg font-bold text-muted">Today</p>
              <p className="mt-1 text-3xl font-bold">
                {takenToday} of {todaySlots.length} taken
              </p>
            </section>
          ) : null}

          <section className="rounded-lg bg-paper p-4 shadow-card">
            <p className="flex items-center gap-2 text-xl font-bold">
              <Bell className="size-6" />
              Alerts on this phone
            </p>
            <p className="mt-2 text-lg text-muted">
              Turn this on to get a notification here when a dose is taken or missed, even with the
              app closed.
            </p>
            {alertStatus === "error" ? (
              <p className="mt-2 text-lg font-bold text-danger">{alertError}</p>
            ) : null}
            <Button
              size="xl"
              className="mt-4 w-full"
              disabled={alertStatus === "working" || alertStatus === "on"}
              onClick={async () => {
                setAlertStatus("working");
                const res = await enableCaregiverAlerts(settings.householdCode);
                if (res.ok) {
                  setAlertStatus("on");
                } else {
                  setAlertStatus("error");
                  setAlertError(res.error ?? "Could not turn on alerts.");
                }
              }}
            >
              {alertStatus === "on" ? "Alerts are on" : "Turn on alerts"}
            </Button>
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Activity</h2>
              <button
                type="button"
                onClick={() => void reload()}
                className="flex items-center gap-2 text-lg font-bold text-primary"
              >
                <RefreshCw className="size-5" />
                Refresh
              </button>
            </div>
            {(data?.activity.length ?? 0) === 0 ? (
              <p className="text-xl text-muted">Nothing yet today.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data?.activity.map((item) => (
                  <li key={item.id} className="flex items-center gap-4 rounded-lg bg-paper p-3 shadow-card">
                    <div className="size-16 shrink-0 overflow-hidden rounded-md bg-bg-warm">
                      {item.checkImage ? (
                        <img src={item.checkImage} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted">
                          <Pill className="size-7" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xl font-bold">{item.medicineName}</p>
                      <p className="text-lg text-muted">
                        {formatTimeLabel(item.time)} · {item.strength}
                      </p>
                    </div>
                    <StatusChip status={item.status === "skipped" ? "missed" : item.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
