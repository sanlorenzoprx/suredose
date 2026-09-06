import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-lg font-bold transition-transform duration-150 ease-out active:not-disabled:scale-[0.96] disabled:opacity-50 disabled:pointer-events-none select-none text-center",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-card hover:bg-primary-hover",
        secondary: "bg-paper text-ink shadow-card hover:bg-bg-warm",
        danger: "bg-danger text-danger-fg shadow-card",
        success: "bg-success text-success-fg shadow-card",
        ghost: "bg-transparent text-ink hover:bg-bg-warm",
        due: "bg-due text-due-fg shadow-card alert-pulse",
      },
      size: {
        md: "min-h-14 px-5 text-xl",
        lg: "min-h-16 px-6 text-xl",
        xl: "min-h-20 w-full px-6 text-2xl",
        icon: "size-14",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "lg",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
