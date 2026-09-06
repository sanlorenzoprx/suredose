import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex min-h-16 w-full rounded-md bg-paper px-4 text-xl text-ink shadow-card",
        "placeholder:text-muted",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("block text-lg font-bold text-ink", className)}
      {...props}
    />
  );
}
