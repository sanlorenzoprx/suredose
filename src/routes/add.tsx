import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PhotoCapture } from "@/components/photo-capture";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { readBottleLabel } from "@/lib/ai";
import { canonicalProductNdc, normName, normStrength } from "@/lib/drug-data";
import { verifyMedicine } from "@/lib/drug-verify";
import { shrinkDataUrl, toDataUrl } from "@/lib/image";
import { formatTimeLabel, periodPreset } from "@/lib/schedule";
import { useAppStore } from "@/lib/store";
import type { Medicine, MedicineCheck, VerifiedMedicine } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/add")({ component: AddMedicine });

const PERIODS = ["Morning", "Noon", "Evening", "Night"] as const;

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Adding a medicine, in four steps:
 *   1. Photo of the bottle → the AI reads name, strength, NDC and schedule.
 *   2. The app checks it against official U.S. drug data (drug-verify.ts)
 *      and asks one question: "Is this your medicine?" Nothing is typed
 *      unless the check fails.
 *   3. When to take it.
 *   4. The pill picture: the maker's official photo when the FDA label has
 *      one ("Does your pill look like this?"), otherwise the person's own.
 *
 * Scanning a bottle for a medicine already on the list updates it instead
 * of adding a duplicate — that's the refill path, where a pharmacy may
 * have switched makers and the pill may now look different.
 */
function AddMedicine() {
  const navigate = useNavigate();
  const medicines = useAppStore((s) => s.medicines);
  const addMedicine = useAppStore((s) => s.addMedicine);
  const updateMedicine = useAppStore((s) => s.updateMedicine);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [bottleImage, setBottleImage] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [strength, setStrength] = useState("");
  const [ndc, setNdc] = useState("");
  const [labelDescription, setLabelDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [times, setTimes] = useState<string[]>(["08:00"]);

  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<MedicineCheck | null>(null);
  const [editing, setEditing] = useState(false);
  /** What the person confirmed in step 2 (null = continued without a check). */
  const [confirmed, setConfirmed] = useState<VerifiedMedicine | null>(null);

  const [pillImage, setPillImage] = useState<string | null>(null);
  const [officialRejected, setOfficialRejected] = useState(false);
  const [saving, setSaving] = useState(false);

  const verified = check?.status === "verified" ? check.medicine : null;

  // Same medicine already on the list? Then this bottle is a refill.
  const existing: Medicine | undefined = useMemo(() => {
    const rxcui = (confirmed ?? verified)?.rxcui;
    return medicines.find(
      (m) =>
        (rxcui && m.rxcui === rxcui) ||
        (name.trim() &&
          normName(m.name) === normName(name) &&
          normStrength(m.strength) === normStrength(strength)),
    );
  }, [medicines, confirmed, verified, name, strength]);

  const current = confirmed ?? verified;
  const makerChanged = Boolean(
    existing &&
      current?.ndc &&
      existing.ndc &&
      canonicalProductNdc(existing.ndc) !== canonicalProductNdc(current.ndc),
  );

  async function runCheck(n: string, s: string, code: string) {
    setChecking(true);
    setCheck(null);
    try {
      const res = await verifyMedicine({ data: { name: n, strength: s, ndc: code } });
      setCheck(res);
      if (res.status === "verified") {
        setName(res.medicine.name);
        setStrength(res.medicine.strength);
        setEditing(false);
      } else {
        setEditing(true);
      }
    } catch {
      setCheck({ status: "unavailable", message: "We can't reach the U.S. drug list right now." });
      setEditing(true);
    } finally {
      setChecking(false);
    }
  }

  async function onBottle(dataUrl: string) {
    setBottleImage(dataUrl);
    setReading(true);
    setReadError(null);
    setCheck(null);
    let n = "";
    let s = "";
    let code = "";
    try {
      const result = await readBottleLabel({ data: { image: dataUrl } });
      if (result.ok) {
        n = result.bottle.name;
        s = result.bottle.strength;
        code = result.bottle.ndc;
        setName(n);
        setStrength(s);
        setNdc(code);
        setLabelDescription(result.bottle.pillDescription);
        if (result.bottle.instructions) setInstructions(result.bottle.instructions);
        if (result.bottle.times.length) setTimes(result.bottle.times);
      } else {
        setReadError(result.error);
      }
    } catch {
      setReadError("Could not read the bottle. Type the name below.");
    } finally {
      setReading(false);
    }
    setStep(2);
    if (n) await runCheck(n, s, code);
    else setEditing(true);
  }

  function acceptMedicine(med: VerifiedMedicine | null) {
    setConfirmed(med);
    setOfficialRejected(false);
    setPillImage(null);
    if (existing) {
      // Keep the schedule the person already set up for this medicine.
      setTimes(existing.times);
      if (existing.instructions) setInstructions(existing.instructions);
    }
    setStep(3);
  }

  function togglePeriod(period: (typeof PERIODS)[number]) {
    const t = periodPreset(period);
    setTimes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort()));
  }

  const officialImage = !officialRejected ? (confirmed?.officialImage ?? null) : null;
  // If the pill didn't match the official photo, the official description
  // would make every future pill check fail — fall back to the label's.
  const appearance = capitalize(
    (!officialRejected && confirmed?.appearance) || labelDescription || "",
  );

  async function save(image: string, source: "official" | "own") {
    if (!name.trim() || times.length === 0 || saving) return;
    setSaving(true);
    try {
      const pill = source === "official" ? await shrinkDataUrl(image) : image;
      const fields = {
        name: name.trim(),
        strength: strength.trim(),
        instructions: instructions.trim(),
        // On a refill scanned without a new bottle photo, keep the old one.
        bottleImage: bottleImage ?? existing?.bottleImage ?? "",
        pillImage: pill,
        times,
        verifiedBy: confirmed?.by ?? ("none" as const),
        // Explicitly cleared (not just omitted) so a refill checked by name
        // doesn't keep the previous bottle's maker and product code.
        ndc: confirmed?.ndc || undefined,
        rxcui: confirmed?.rxcui || undefined,
        labeler: confirmed?.labeler || undefined,
        form: confirmed?.form || undefined,
        appearance: appearance || undefined,
        pillImageSource: source,
      };
      if (existing) updateMedicine(existing.id, fields);
      else addMedicine(fields);
      navigate({ to: "/" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="Add a medicine">
      <p className="mb-5 text-lg font-bold text-muted">Step {step} of 4</p>

      {step === 1 ? (
        reading ? (
          <Waiting title="Reading the bottle…" />
        ) : (
          <PhotoCapture
            title="Picture of the bottle"
            hint="Hold the bottle so the label is clear. We will read the name and check it for you."
            preview={bottleImage}
            onCapture={(img) => void onBottle(img)}
            extraAction={
              <>
                <SampleBottlePicker onPick={(src) => void toDataUrl(src).then((d) => onBottle(d))} />
                <Button
                  size="xl"
                  variant="ghost"
                  onClick={() => {
                    setBottleImage(null);
                    setCheck(null);
                    setEditing(true);
                    setStep(2);
                  }}
                >
                  Skip — I will type it
                </Button>
              </>
            }
          />
        )
      ) : null}

      {step === 2 ? (
        checking ? (
          <Waiting title="Checking with the U.S. drug list…" />
        ) : (
          <div className="flex flex-col gap-5">
            {verified && !editing ? (
              <>
                <section className="rounded-xl bg-paper p-5 shadow-card">
                  <p className="flex items-center gap-2 text-lg font-bold text-success">
                    <ShieldCheck className="size-7 shrink-0" />
                    Checked with the U.S. drug list
                  </p>
                  <h2 className="mt-3 text-3xl font-bold leading-tight">{verified.name}</h2>
                  <p className="mt-1 text-2xl">
                    {[verified.strength, verified.form].filter(Boolean).join(" · ")}
                  </p>
                  {verified.labeler ? (
                    <p className="mt-2 text-lg text-muted">Made by {verified.labeler}</p>
                  ) : null}
                  {check?.status === "verified" && check.note ? (
                    <p className="mt-3 text-lg text-muted">{check.note}</p>
                  ) : null}
                </section>

                {existing ? <RefillNotice name={existing.name} makerChanged={makerChanged} /> : null}

                <h3 className="text-2xl font-bold leading-tight">Is this the medicine on your bottle?</h3>
                <Button size="xl" onClick={() => acceptMedicine(verified)}>
                  <Check className="size-7" />
                  Yes, this is my medicine
                </Button>
                <Button size="xl" variant="secondary" onClick={() => setEditing(true)}>
                  No, change it
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-bold leading-tight">Type what the bottle says</h2>
                {readError ? <p className="text-xl font-bold text-danger">{readError}</p> : null}
                {check && check.status !== "verified" ? (
                  <p className="flex items-start gap-2 rounded-lg bg-bg-warm p-4 text-xl font-bold">
                    <TriangleAlert className="mt-1 size-6 shrink-0" />
                    {check.message}
                  </p>
                ) : null}
                {bottleImage ? (
                  <img
                    src={bottleImage}
                    alt="Prescription bottle"
                    className="h-40 w-full rounded-lg object-cover"
                  />
                ) : null}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Medicine name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Name on the bottle"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="strength">Strength</Label>
                  <Input
                    id="strength"
                    value={strength}
                    onChange={(e) => setStrength(e.target.value)}
                    placeholder="For example, 10 mg"
                  />
                </div>
                <Button
                  size="xl"
                  disabled={!name.trim()}
                  onClick={() => void runCheck(name.trim(), strength.trim(), ndc)}
                >
                  <ShieldCheck className="size-7" />
                  Check this medicine
                </Button>
                {check && check.status !== "verified" ? (
                  <div className="rounded-lg bg-paper p-4 shadow-card">
                    <p className="text-lg text-muted">
                      Only if you are sure the name and strength match your bottle. Ask your
                      pharmacist to check it.
                    </p>
                    <Button
                      size="xl"
                      variant="ghost"
                      className="mt-2"
                      disabled={!name.trim()}
                      onClick={() => acceptMedicine(null)}
                    >
                      Continue without checking
                    </Button>
                  </div>
                ) : null}
              </>
            )}
            <Button size="xl" variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft className="size-6" />
              Back
            </Button>
          </div>
        )
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-5">
          <h2 className="text-3xl font-bold leading-tight">When do you take {name}?</h2>
          {existing ? (
            <p className="text-xl text-muted">These are the times you already use for this medicine.</p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="how">How to take it</Label>
            <Input
              id="how"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="For example, take with food"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PERIODS.map((period) => {
              const t = periodPreset(period);
              const on = times.includes(t);
              return (
                <button
                  key={period}
                  type="button"
                  onClick={() => togglePeriod(period)}
                  className={cn(
                    "min-h-20 rounded-lg px-3 text-xl font-bold shadow-card",
                    on ? "bg-primary text-primary-fg" : "bg-paper text-ink",
                  )}
                >
                  {period}
                  <span className="mt-1 block text-lg font-bold opacity-80">{formatTimeLabel(t)}</span>
                </button>
              );
            })}
          </div>
          <Button size="xl" disabled={times.length === 0} onClick={() => setStep(4)}>
            Next: the pill
          </Button>
          <Button size="xl" variant="secondary" onClick={() => setStep(2)}>
            <ArrowLeft className="size-6" />
            Back
          </Button>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="flex flex-col gap-5">
          {officialImage ? (
            <>
              <h2 className="text-3xl font-bold leading-tight">Does your pill look like this?</h2>
              <img
                src={officialImage}
                alt={`Official photo of ${name} ${strength}`}
                className="aspect-square w-full rounded-lg bg-paper object-contain p-2 shadow-card"
              />
              <p className="text-xl">
                This is the maker's photo of {name} {strength}
                {confirmed?.labeler ? ` from ${confirmed.labeler}` : ""}.
              </p>
              {appearance ? (
                <p className="rounded-lg bg-paper p-4 text-xl font-bold shadow-card">Look for: {appearance}</p>
              ) : null}
              <p className="text-xl text-muted">Take one pill out of your bottle and compare.</p>
              <Button size="xl" disabled={saving} onClick={() => void save(officialImage, "official")}>
                {saving ? <Loader2 className="size-7 animate-spin" /> : <Check className="size-7" />}
                Yes, my pill looks like this
              </Button>
              <Button size="xl" variant="secondary" onClick={() => setOfficialRejected(true)}>
                No, it looks different
              </Button>
            </>
          ) : (
            <>
              {officialRejected ? (
                <section className="rounded-xl bg-danger p-5 text-danger-fg shadow-card">
                  <p className="flex items-center gap-2 text-lg font-bold uppercase tracking-wide">
                    <ShieldAlert className="size-6" />
                    Check with your pharmacy
                  </p>
                  <p className="mt-3 text-xl">
                    Do not take this medicine until you call your pharmacy. Tell them the pill does not
                    look like the picture for this bottle.
                  </p>
                  <p className="mt-3 text-lg">You can still save it with a picture of your own pill.</p>
                </section>
              ) : null}
              {appearance ? (
                <p className="rounded-lg bg-paper p-4 text-xl shadow-card">
                  <span className="font-bold">Your pill should look like:</span> {appearance}
                </p>
              ) : null}
              <PhotoCapture
                title="Picture of the pill"
                hint="Put one pill on a dark table. We save this so we can check it later."
                preview={pillImage}
                onCapture={setPillImage}
                extraAction={<SamplePillPicker onPick={(src) => void toDataUrl(src).then(setPillImage)} />}
              />
              {pillImage ? (
                <Button size="xl" disabled={saving} onClick={() => void save(pillImage, "own")}>
                  <Check className="size-7" />
                  {existing ? `Update ${existing.name}` : "Save this medicine"}
                </Button>
              ) : null}
            </>
          )}
          <Button size="xl" variant="secondary" onClick={() => setStep(3)}>
            <ArrowLeft className="size-6" />
            Back
          </Button>
        </div>
      ) : null}
    </AppShell>
  );
}

function Waiting({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <Loader2 className="size-12 animate-spin text-primary" />
      <p className="text-2xl font-bold">{title}</p>
      <p className="text-xl text-muted">This takes a few seconds.</p>
    </div>
  );
}

function RefillNotice({ name, makerChanged }: { name: string; makerChanged: boolean }) {
  return (
    <section className="rounded-xl bg-bg-warm p-5">
      <p className="text-xl font-bold">You already have {name} on your list.</p>
      <p className="mt-2 text-xl">
        {makerChanged
          ? "This bottle is from a different maker, so your pills may look different now. We will update the picture you see at pill time."
          : "We will update it with this bottle instead of adding it twice."}
      </p>
    </section>
  );
}

function SampleBottlePicker({ onPick }: { onPick: (src: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick("/samples/bottle-lisinopril.jpg")}
      className="overflow-hidden rounded-lg bg-paper text-left shadow-card"
    >
      <img
        src="/samples/bottle-lisinopril.jpg"
        alt="Sample prescription bottle"
        className="h-32 w-full object-cover"
      />
      <span className="block px-4 py-3 text-xl font-bold">Use a sample bottle</span>
    </button>
  );
}

function SamplePillPicker({ onPick }: { onPick: (src: string) => void }) {
  const samples = [
    { src: "/samples/white-tablet.jpg", label: "White round pill" },
    { src: "/samples/blue-capsule.jpg", label: "Blue and white capsule" },
    { src: "/samples/peach-tablet.jpg", label: "Peach oval pill" },
  ];
  return (
    <div className="rounded-lg bg-paper p-4 shadow-card">
      <p className="mb-3 text-lg font-bold">Or use a practice photo</p>
      <div className="grid grid-cols-3 gap-3">
        {samples.map((s) => (
          <button
            key={s.src}
            type="button"
            onClick={() => onPick(s.src)}
            className="overflow-hidden rounded-md"
          >
            <img src={s.src} alt={s.label} className="aspect-square w-full object-cover" />
            <span className="sr-only">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
