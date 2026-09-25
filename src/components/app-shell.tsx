import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Heart, Home, Pill } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCareSync } from "@/lib/care-sync";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/medicines", label: "Pills", icon: Pill },
  { to: "/family", label: "Family", icon: Heart },
] as const;

export function AppShell({
  children,
  title,
  hideNav = false,
}: {
  children: ReactNode;
  title?: string;
  hideNav?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useCareSync();


  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm">
        <p className="text-sm font-bold tracking-[0.18em] text-primary uppercase">SureDose</p>
        {title ? <h1 className="mt-1 text-3xl font-bold leading-tight">{title}</h1> : null}
      </header>
      <main className={cn("flex-1 px-5 py-5", hideNav ? "pb-8" : "pb-32")}>{children}</main>
      {hideNav ? null : (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur-sm"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <ul className="mx-auto grid max-w-lg grid-cols-3">
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center gap-1 text-lg font-bold",
                      active ? "text-primary" : "text-muted",
                    )}
                  >
                    <Icon className="size-7" strokeWidth={active ? 2.4 : 2} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
