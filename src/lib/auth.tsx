import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { claimReferral, cleanRef } from "@/lib/referral.functions";

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, session: null, loading: true });
const REF_KEY = "ss_ref";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, session: null, loading: true });

  useEffect(() => {
    try {
      const ref = cleanRef(new URLSearchParams(window.location.search).get("ref"));
      if (ref) localStorage.setItem(REF_KEY, ref);
    } catch { /* ignore */ }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ user: session?.user ?? null, session, loading: false });
    });

    supabase.auth.getSession().then(({ data }) => {
      setState({ user: data.session?.user ?? null, session: data.session, loading: false });
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!state.user) return;
    let ref: string | null = null;
    try { ref = localStorage.getItem(REF_KEY); } catch { /* ignore */ }
    if (!ref) return;
    claimReferral({ data: { ref } })
      .then(() => { try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ } })
      .catch(() => {});
  }, [state.user?.id]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export async function signOut() {
  await supabase.auth.signOut();
}
