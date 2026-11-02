import { useState, type FormEvent } from "react";
import { authClient, authEnabled } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function EmailPasswordForm({
  initialName = "",
  onBack,
  onAuthenticated,
}: {
  initialName?: string;
  onBack?: () => void;
  onAuthenticated?: (name?: string) => void;
}) {
  const [mode, setMode] = useState<"register" | "signin">("register");
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authEnabled) {
      setError("Caregiver accounts are not enabled in this app session. Please refresh and try again.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result =
        mode === "register"
          ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
          : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message || "We could not sign you in. Check your details and try again.");
        return;
      }
      await authClient.getSession();
      onAuthenticated?.(mode === "register" ? name.trim() : undefined);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not sign you in. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <p className="text-xl leading-snug text-muted">
        {mode === "register"
          ? "Create an account to keep your family connection when you switch phones."
          : "Sign in to restore the family connection saved to your account."}
      </p>

      {mode === "register" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="caregiver-account-name">Your first name</Label>
          <Input
            id="caregiver-account-name"
            autoComplete="given-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="caregiver-account-email">Email</Label>
        <Input
          id="caregiver-account-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          maxLength={254}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="caregiver-account-password">Password</Label>
        <Input
          id="caregiver-account-password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          maxLength={128}
        />
        {mode === "register" ? (
          <p className="text-base text-muted">Use at least 8 characters.</p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-lg font-bold text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="xl" disabled={busy}>
        {busy
          ? mode === "register"
            ? "Creating account…"
            : "Signing in…"
          : mode === "register"
            ? "Create caregiver account"
            : "Sign in"}
      </Button>

      <button
        type="button"
        className="min-h-12 text-lg font-bold text-primary underline"
        disabled={busy}
        onClick={() => {
          setMode((current) => (current === "register" ? "signin" : "register"));
          setError("");
        }}
      >
        {mode === "register" ? "Already have an account? Sign in" : "New here? Create an account"}
      </button>

      {onBack ? (
        <Button type="button" size="xl" variant="secondary" disabled={busy} onClick={onBack}>
          Back
        </Button>
      ) : null}
    </form>
  );
}
