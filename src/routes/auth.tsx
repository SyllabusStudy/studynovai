import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

const searchSchema = z.object({
  mode: z.enum(["login", "signup", "reset"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — StudyMate AI" },
      {
        name: "description",
        content: "Log in or create your StudyMate AI account to manage classes, syllabi, flashcards and deadlines.",
      },
      { property: "og:title", content: "Sign in — StudyMate AI" },
      { property: "og:description", content: "Log in or create your StudyMate AI student account." },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup" | "reset";

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>(search.mode ?? "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name || email.split("@")[0] },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          const signIn = await supabase.auth.signInWithPassword({ email, password });
          if (signIn.error) throw signIn.error;
        }
        toast.success("Account created. Welcome to StudyMate AI!");
        navigate({ to: "/dashboard" });

      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Check your inbox for a password reset link.");
        setMode("login");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(
        message.includes("Invalid login credentials")
          ? "That email and password combination doesn't match an account."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <span className="text-sm font-extrabold tracking-tight">StudyMate AI</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="surface-card w-full max-w-md animate-fade-up p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "signup" ? "Create your account" : mode === "login" ? "Welcome back" : "Reset your password"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Your classes, files and study history stay private to you."
              : mode === "login"
                ? "Pick up where you left off."
                : "We'll email you a secure link to set a new password."}
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode === "signup" ? (
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  autoComplete="name"
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                autoComplete="email"
              />
            </div>

            {mode !== "reset" ? (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                />
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signup" ? "Create account" : mode === "login" ? "Log in" : "Send reset link"}
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-sm">
            {mode === "login" ? (
              <>
                <p className="text-muted-foreground">
                  New here?{" "}
                  <button className="font-semibold text-primary" onClick={() => setMode("signup")}>
                    Create an account
                  </button>
                </p>
                <p className="text-muted-foreground">
                  Forgot your password?{" "}
                  <button className="font-semibold text-primary" onClick={() => setMode("reset")}>
                    Reset it
                  </button>
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Already have an account?{" "}
                <button className="font-semibold text-primary" onClick={() => setMode("login")}>
                  Log in
                </button>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
