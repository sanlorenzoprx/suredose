import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function BackLink({ to = "/family" }: { to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 text-xl font-bold text-primary">
      <ArrowLeft className="size-6" />
      Back
    </Link>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl bg-paper p-5 shadow-card">
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-xl leading-relaxed text-ink">{children}</div>
    </section>
  );
}
