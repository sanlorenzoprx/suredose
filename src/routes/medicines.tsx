import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { formatTimeLabel, periodOfDay } from "@/lib/schedule";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/medicines")({ component: MedicinesPage });

function MedicinesPage() {
  const medicines = useAppStore((s) => s.medicines);
  const removeMedicine = useAppStore((s) => s.removeMedicine);
  const loadSamples = useAppStore((s) => s.loadSamples);

  return (
    <AppShell title="Your pills">
      <p className="mb-5 text-xl text-muted">
        Each pill has a saved photo and the times you take it.
      </p>

      {medicines.length === 0 ? (
        <div className="rounded-xl bg-paper p-5 shadow-card">
          <p className="text-2xl font-bold">No medicines yet</p>
          <p className="mt-2 text-xl text-muted">Add one from the bottle and a photo of the pill.</p>
          <Link to="/add" className="mt-5 block">
            <Button size="xl" className="w-full">
              <Plus className="size-7" />
              Add a medicine
            </Button>
          </Link>
          <Button size="xl" variant="secondary" className="mt-3" onClick={loadSamples}>
            Try a sample day
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {medicines.map((med) => (
            <li key={med.id} className="rounded-xl bg-paper p-4 shadow-card">
              <div className="flex gap-4">
                <img
                  src={med.pillImage}
                  alt={med.name}
                  className="size-24 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl font-bold leading-tight">{med.name}</h2>
                  <p className="text-xl text-muted">{med.strength}</p>
                  <p className="mt-2 text-lg">
                    {med.times
                      .map((t) => `${periodOfDay(t)} ${formatTimeLabel(t)}`)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              {med.instructions ? <p className="mt-3 text-xl">{med.instructions}</p> : null}
              <Button
                size="lg"
                variant="ghost"
                className="mt-3 w-full text-danger"
                onClick={() => {
                  if (window.confirm(`Remove ${med.name}?`)) removeMedicine(med.id);
                }}
              >
                <Trash2 className="size-5" />
                Remove {med.name}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {medicines.length > 0 ? (
        <Link to="/add" className="mt-5 block">
          <Button size="xl" className="w-full">
            <Plus className="size-7" />
            Add another medicine
          </Button>
        </Link>
      ) : null}
    </AppShell>
  );
}
