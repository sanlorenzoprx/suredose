import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PhotoCapture } from "@/components/photo-capture";
import { Button } from "@/components/ui/button";
import { comparePills } from "@/lib/ai";
import { stopDoseAlarm } from "@/lib/alerts";
import { toDataUrl } from "@/lib/image";
import { formatClock, formatTimeLabel, periodOfDay } from "@/lib/schedule";
import { buildTakenMessage, copyText, digitsOnly, smsHref } from "@/lib/sms";
import { useAppStore } from "@/lib/store";
import { useHydrated } from "@/lib/use-hydrated";
import type { Medicine, PillMatch } from "@/lib/types";

type Search = { medicineId: string; date: string; time: string };

export const Route = createFileRoute("/check")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    medicineId: String(s.medicineId ?? ""),
    date: String(s.date ?? ""),
    time: String(s.time ?? ""),
  }),
  component: CheckDose,
});

function CheckDose() {
  const ready = useHydrated();
  const { medicineId, date, time } = Route.useSearch();
  const medicine = useAppStore((s) => s.medicines.find((m) => m.id === medicineId));

  if (!ready) {
    return (
      <AppShell title="Pill check">
        <p className="text-xl text-muted">Loading…</p>
      </AppShell>
    );
  }

  if (!medicine) {
    return (
      <AppShell title="Pill check">
        <p className="text-xl">We could not find this medicine.</p>
        <GoHome />
      </AppShell>
    );
  }

  return <CheckReady medicine={medicine} date={date} time={time} />;
}

function GoHome() {
  const navigate = useNavigate();
  return (
    <Button size="xl" className="mt-4" onClick={() => navigate({ to: "/" })}>
      Go home
    </Button>
  );
}

function CheckReady({
  medicine,
  date,
  time,
}: {
  medicine: Medicine;
  date: string;
  time: string;
}) {
  const navigate = useNavigate();
  const settings = useAppStore((s) => s.settings);
  const markTaken = useAppStore((s) => s.markTaken);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PillMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smsNote, setSmsNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const message = useMemo(
    () =>
      buildTakenMessage({
        patientName: settings.patientName,
        caregiverName: settings.caregiverName,
        medicineName: medicine.name,
        strength: medicine.strength,
        timeLabel: formatClock(new Date()),
      }),
    [medicine, settings],
  );

  async function runCheck(photo: string) {
    setCandidate(photo);
    setChecking(true);
    setError(null);
    setResult(null);
    stopDoseAlarm();
    try {
      const reference = await toDataUrl(medicine.pillImage);
      if (reference === photo) {
        setResult({
          match: true,
          confidence: 1,
          reason: "This is the same photo we saved for this pill.",
        });
        return;
      }
      const res = await comparePills({
        data: { reference, candidate: photo, name: `${medicine.name} ${medicine.strength}` },
      });
      if (res.ok) setResult(res.result);
      else setError(res.error);
    } catch {
      setError("Could not check this photo. Look at both pictures carefully.");
    } finally {
      setChecking(false);
    }
  }

  async function confirmTaken(verified: boolean) {
    const phone = digitsOnly(settings.caregiverPhone);
    const copied = phone ? await copyText(message) : false;
    markTaken({
      medicineId: medicine.id,
      date,
      time,
      verified,
      checkImage: candidate ?? undefined,
      notified: false,
    });
    if (!phone) setSmsNote("No family number is saved. You can add one under Family.");
    else if (copied) setSmsNote("Message copied. Tap the button below, then tap Send.");
    else setSmsNote("Tap the button below to text your family.");
    setDone(true);
  }

  const matchOk = Boolean(result?.match && result.confidence >= 0.55);
  const matchBad = Boolean(result && (!result.match || result.confidence < 0.45));

  return (
    <AppShell title="Check this pill">
      <div className="flex flex-col gap-5">
        <section className="rounded-xl bg-paper p-4 shadow-card">
          <p className="text-lg font-bold text-muted">
            {periodOfDay(time)} · {formatTimeLabel(time)}
          </p>
          <h2 className="mt-1 text-3xl font-bold leading-tight">{medicine.name}</h2>
          <p className="text-xl text-muted">{medicine.strength}</p>
          {medicine.instructions ? <p className="mt-2 text-xl">{medicine.instructions}</p> : null}
          <div className="mt-4">
            <p className="mb-2 text-lg font-bold">This is what it looks like</p>
            <img
              src={medicine.pillImage}
              alt={`Saved photo of ${medicine.name}`}
              className="aspect-square w-full rounded-lg object-cover"
            />
          </div>
        </section>

        {checking ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Loader2 className="size-12 animate-spin text-primary" />
            <p className="text-2xl font-bold">Checking your pill…</p>
            <p className="text-xl text-muted">Hold still. This takes a few seconds.</p>
            {candidate ? (
              <img src={candidate} alt="Pill you photographed" className="h-40 rounded-lg object-cover" />
            ) : null}
          </div>
        ) : matchOk && result ? (
          <section className="rounded-xl bg-success p-5 text-success-fg shadow-card">
            <p className="flex items-center gap-2 text-lg font-bold uppercase tracking-wide">
              <Check className="size-6" />
              Right pill
            </p>
            <h3 className="mt-3 text-3xl font-bold leading-tight">This is the right pill. You can take it.</h3>
            <p className="mt-3 text-xl opacity-90">{result.reason}</p>
            {done ? (
              <div className="mt-5 flex flex-col gap-3">
                <p className="text-2xl font-bold">You took it. Well done.</p>
                {smsNote ? <p className="text-lg">{smsNote}</p> : null}
                {digitsOnly(settings.caregiverPhone) ? (
                  <a
                    href={smsHref(settings.caregiverPhone, message)}
                    className="inline-flex min-h-20 items-center justify-center rounded-lg bg-paper px-6 text-2xl font-bold text-ink shadow-card"
                  >
                    Text {settings.caregiverName || "my family"}
                  </a>
                ) : null}
                <Button size="xl" variant="secondary" onClick={() => navigate({ to: "/" })}>
                  Back home
                </Button>
              </div>
            ) : (
              <>
                <Button size="xl" variant="secondary" className="mt-5" onClick={() => void confirmTaken(true)}>
                  I took this pill
                </Button>
                <p className="mt-3 text-lg opacity-80">
                  Next we will help you text {settings.caregiverName || "your family"}.
                </p>
              </>
            )}
          </section>
        ) : matchBad && result ? (
          <section className="rounded-xl bg-danger p-5 text-danger-fg shadow-card">
            <p className="flex items-center gap-2 text-lg font-bold uppercase tracking-wide">
              <ShieldAlert className="size-6" />
              Stop
            </p>
            <h3 className="mt-3 text-3xl font-bold leading-tight">This is not the right pill. Put it back.</h3>
            <p className="mt-3 text-xl">{result.reason}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <figure>
                <img src={medicine.pillImage} alt="Saved pill" className="aspect-square w-full rounded-md object-cover" />
                <figcaption className="mt-2 text-center text-lg">Saved</figcaption>
              </figure>
              <figure>
                <img src={candidate ?? ""} alt="This pill" className="aspect-square w-full rounded-md object-cover" />
                <figcaption className="mt-2 text-center text-lg">This one</figcaption>
              </figure>
            </div>
            <Button
              size="xl"
              variant="secondary"
              className="mt-5"
              onClick={() => {
                setResult(null);
                setCandidate(null);
              }}
            >
              Try a different pill
            </Button>
          </section>
        ) : (
          <>
            {error ? (
              <p className="flex items-start gap-2 text-xl font-bold text-danger">
                <TriangleAlert className="mt-1 size-6 shrink-0" />
                {error}
              </p>
            ) : null}
            <PhotoCapture
              title="Picture of the pill in your hand"
              hint="Hold one pill so we can see the color and shape."
              preview={candidate}
              onCapture={(img) => void runCheck(img)}
              extraAction={
                <Button
                  size="xl"
                  variant="secondary"
                  onClick={() => void toDataUrl(medicine.pillImage).then((d) => runCheck(d))}
                >
                  Use the saved picture (practice)
                </Button>
              }
            />
            {result && !matchOk && !matchBad ? (
              <section className="rounded-lg bg-paper p-4 shadow-card">
                <p className="text-xl font-bold">We are not sure.</p>
                <p className="mt-2 text-xl text-muted">{result.reason}</p>
                <p className="mt-3 text-xl">Look at both photos. Only take it if they match.</p>
                <Button size="xl" className="mt-4" onClick={() => void confirmTaken(false)}>
                  They match. I took this pill
                </Button>
                <Button
                  size="xl"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => {
                    setResult(null);
                    setCandidate(null);
                  }}
                >
                  They do not match
                </Button>
              </section>
            ) : null}
          </>
        )}
      </div>
    </AppShell>
  );
}
