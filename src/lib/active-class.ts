import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useClasses, useProfile } from "@/lib/data";

const LS_KEY = "studynova-active-class";

/** The class the student is currently working on — follows them across study tools. */
export function useActiveClass() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useProfile(user?.id);
  const { data: classes = [] } = useClasses(user?.id);
  const [local, setLocal] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLocal(window.localStorage.getItem(LS_KEY));
    } catch {
      /* ignore */
    }
  }, []);

  const rawId = (profile as { active_class_id?: string | null } | null | undefined)?.active_class_id ?? local;
  const activeClass = classes.find((c) => c.id === rawId) ?? null;

  const setActiveClassId = useCallback(
    async (id: string | null) => {
      if (!user) return;
      if (id === (activeClass?.id ?? null)) return;
      setLocal(id);
      try {
        if (id) window.localStorage.setItem(LS_KEY, id);
        else window.localStorage.removeItem(LS_KEY);
      } catch {
        /* ignore */
      }
      qc.setQueryData(["profile", user.id], (p: Record<string, unknown> | null | undefined) =>
        p ? { ...p, active_class_id: id } : p,
      );
      await supabase.from("profiles").update({ active_class_id: id }).eq("id", user.id);
    },
    [user, qc, activeClass?.id],
  );

  return { activeClass, activeClassId: activeClass?.id ?? null, classes, setActiveClassId };
}

/**
 * Sync a page's local class picker with the active class.
 * Starts from the URL/active class, and saves explicit changes back.
 */
export function useClassPicker(empty: string, initial?: string | null) {
  const { activeClassId, setActiveClassId } = useActiveClass();
  const [classId, setLocal] = useState<string>(initial || empty);
  const [touched, setTouched] = useState(!!initial);

  useEffect(() => {
    if (initial) void setActiveClassId(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  useEffect(() => {
    if (!touched && activeClassId && classId === empty) setLocal(activeClassId);
  }, [activeClassId, touched, classId, empty]);

  const setClassId = useCallback(
    (v: string) => {
      setTouched(true);
      setLocal(v);
      if (v && v !== empty && v !== "none" && v !== "all") void setActiveClassId(v);
    },
    [empty, setActiveClassId],
  );
  return [classId, setClassId] as const;
}
