import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PhotoCapture } from "@/components/photo-capture";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { readBottleLabel } from "@/lib/ai";
import { toDataUrl } from "@/lib/image";
import { formatTimeLabel, periodPreset } from "@/lib/schedule";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/add")({ component: AddMedicine });

const PERIODS = ["Morning", "Noon", "Evening", "Night"] as const;

function AddMedicine() {
  const navigate = useNavigate();
  const addMedicine = useAppStore((s) => s.addMedicine);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [bottleImage, setBottleImage] = useState<string | null>(null);
  const [pillImage, setPillImage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [strength, setStrength] = useState("");
  const [instructions, setInstructions] = useState("");
  const [times, setTimes] = useState<string[]>(["08:00"]);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  async function onBottle(dataUrl: string) {
    setBottleImage(dataUrl);
    setReading(true);
    setReadError(null);
    try {
      const result = await readBottleLabel({ data: { image: dataUrl } });
      if (result.ok) {
        if (result.bottle.name) setName(result.bottle.name);
        if (result.bottle.strength) setStrength(result.bottle.strength);
        if (result.bottle.instructions) setInstructions(result.bottle.instructions);
        if (result.bottle.times.length) setTimes(result.bottle.times);
        setStep(2);
      } else {
        setReadError(result.error);
        setStep(2);
      }
    } catch {
      setReadError("Could not read the bottle. Type the name below.");
      setStep(2);
    } finally {
      setReading(false);
    }
  }

  function togglePeriod(period: (typeof PERIODS)[number]) {
    const t = periodPreset(period);
    setTimes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort()));
  }

  function save() {
    if (!name.trim() || !pillImage || times.length === 0) return;
    addMedicine({
      name: name.trim(),
      strength: strength.trim(),
      instructions: instructions.trim(),
      bottleImage: bottleImage ?? "",
      pillImage,
      times,
    });
    navigate({ to: "/" });
  }

  return (
    <AppShell title="Add a medicine">
      <p className="mb-5 text-lg font-bold text-muted">Step {step} of 3</p>

      {step === 1 ? (
        reading ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <Loader2 className="size-12 animate-spin text-primary" />
            <p className="text-2xl font-bold">Reading the bottle…</p>
            <p className="text-xl text-muted">This takes a few seconds.</p>
          </div>
        ) : (
          <PhotoCapture
            title="Picture of the bottle"
            hint="Hold the bottle so the label is clear. We will read the name and how often to take it."
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
        <div className="flex flex-col gap-5">
          <h2 className="text-3xl font-bold leading-tight">Check this is right</h2>
          {readError ? <p className="text-xl font-bold text-danger">{readError}</p> : null}
          {bottleImage ? (
            <img
              src={bottleImage}
              alt="Prescription bottle"
              className="h-40 w-full rounded-lg object-cover"
            />
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Medicine name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name on the bottle" />
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="how">How to take it</Label>
            <Input
              id="how"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="For example, take with food"
            />
          </div>

          <div>
            <p className="mb-3 text-lg font-bold">When do you take it?</p>
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
          </div>

          <Button size="xl" disabled={!name.trim() || times.length === 0} onClick={() => setStep(3)}>
            Next: picture of the pill
          </Button>
          <Button size="xl" variant="secondary" onClick={() => setStep(1)}>
            <ArrowLeft className="size-6" />
            Back
          </Button>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-5">
          <PhotoCapture
            title="Picture of the pill"
            hint="Put one pill on a dark table. We save this so we can check it later."
            preview={pillImage}
            onCapture={setPillImage}
            extraAction={
              <SamplePillPicker
                onPick={async (src) => {
                  const data = await toDataUrl(src);
                  setPillImage(data);
                }}
              />
            }
          />
          {pillImage ? (
            <Button size="xl" onClick={save}>
              <Check className="size-7" />
              Save this medicine
            </Button>
          ) : null}
          <Button size="xl" variant="secondary" onClick={() => setStep(2)}>
            <ArrowLeft className="size-6" />
            Back
          </Button>
        </div>
      ) : null}
    </AppShell>
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
