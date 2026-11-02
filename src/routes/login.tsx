import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EmailPasswordForm } from "@/components/email-password-form";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();

  return (
    <AppShell title="Caregiver account" hideNav>
      <div className="flex flex-col gap-6">
        <p className="text-xl text-muted">
          Sign in with email to reconnect to a family member, or create an account to get started.
        </p>
        <EmailPasswordForm onAuthenticated={() => void navigate({ to: "/" })} />
        <Link to="/" className="flex min-h-12 items-center justify-center gap-2 text-lg font-bold text-muted underline">
          <ArrowLeft className="size-5" />
          Back to SureDose
        </Link>
      </div>
    </AppShell>
  );
}
