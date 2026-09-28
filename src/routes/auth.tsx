import { BrandLogo } from "@/components/BrandLogo";
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
import { lovable } from "@/integrations/lovable/index";

const searchSchema = z.object({
  mode: z.enum(["login", "signup", "reset"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in — StudyNova" },
      {
        name: "description",
        content: "Log in or create your StudyNova account to manage classes, syllabi, flashcards and deadlines.",
      },
      { property: "og:title", content: "Sign in — StudyNova" },
      { property: "og:description", content: "Log in or create your StudyNova student account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const [googleBusy, setGoogleBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

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
        toast.success("Account created. Welcome to StudyNova!");
        if (typeof window !== "undefined" && "gtag_report_conversion" in window) {
          (window as any).gtag_report_conversion();
        }
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

  async function onGoogle() {
    setGoogleBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("We couldn't sign you in with Google. Please try again.");
        return;
      }
      if (result.redirected) return;
      toast.success("Welcome to StudyNova!");
      navigate({ to: "/dashboard" });
    } catch {
      toast.error("We couldn't sign you in with Google. Please try again.");
    } finally {
      setGoogleBusy(false);
    }
  }


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandLogo />
          <span className="text-sm font-extrabold tracking-tight">StudyNova</span>
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

          {mode !== "reset" ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full gap-2"
                onClick={onGoogle}
                disabled={googleBusy || busy}
              >
                {googleBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.58-5.17 3.58-8.84Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.96-1.08 7.94-2.89l-3.88-3.02c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.96H1.29v3.13A12 12 0 0 0 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.59H1.29a12 12 0 0 0 0 10.82l3.99-3.13Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.23 0 12 0A12 12 0 0 0 1.29 6.59l3.99 3.13C6.22 6.87 8.87 4.75 12 4.75Z"
                    />
                  </svg>
                )}
                Continue with Google
              </Button>

              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}

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

            {mode === "signup" ? (
              <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  required
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary"
                />
                <span>
                  I agree to StudyNova's{" "}
                  <Link to="/terms" target="_blank" className="font-semibold text-primary">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link to="/privacy" target="_blank" className="font-semibold text-primary">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy || (mode === "signup" && !agreed)}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signup" ? "Create account" : mode === "login" ? "Log in" : "Send reset link"}
            </Button>
          </form>

          {mode !== "reset" ? (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              By continuing with Google you also agree to our{" "}
              <Link to="/terms" className="font-semibold text-primary">
                Terms
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="font-semibold text-primary">
                Privacy Policy
              </Link>
              .
            </p>
          ) : null}

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
