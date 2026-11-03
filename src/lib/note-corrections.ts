import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
export type NoteCorrection = { original: string; suggestion: string; reason: string; kind?: "spelling" | "wording"; state?: "accepted" | "rejected" };
export function correctionKind(s: NoteCorrection): "spelling" | "wording" {
  return s.kind === "spelling" || (!s.kind && /^spelling\b/i.test(s.reason)) ? "spelling" : "wording";
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whole-word, whitespace-tolerant matcher so "teh" never matches inside "tehran" and partial words are never underlined. */
function correctionPattern(original: string, flags: string) {
  const parts = original.trim().split(/\s+/).filter(Boolean).map(escapeRe);
  if (!parts.length) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}'’])${parts.join("\\s+")}(?![\\p{L}\\p{N}'’])`, flags);
}
export function findCorrectionRanges(doc: PMNode, original: string) {
  const ranges: { from: number; to: number }[] = [];
  if (!original || !original.trim()) return ranges;
  const exact = correctionPattern(original, "gu");
  if (!exact) return ranges;
  const scan = (re: RegExp) => doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, "", "\ufffc");
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (!m[0].length) { re.lastIndex++; continue; }
      ranges.push({ from: pos + 1 + m.index, to: pos + 1 + m.index + m[0].length });
    }
    return false;
  });
  scan(exact);
  if (!ranges.length) scan(correctionPattern(original, "giu")!);
  return ranges;
}
/** Apply each suggestion once per range, never re-matching text produced by an earlier fix (prevents doubled words). */
export function planCorrectionReplacements(doc: PMNode, items: { original: string; suggestion: string }[]) {
  const plan: { from: number; to: number; index: number }[] = [];
  items.forEach((s, index) => {
    if (!s.original?.trim() || s.original.trim() === s.suggestion.trim()) return;
    findCorrectionRanges(doc, s.original).forEach(r => {
      if (plan.some(p => p.from < r.to && r.from < p.to)) return;
      plan.push({ ...r, index });
    });
  });
  return plan.sort((a, b) => b.from - a.from);
}
export const noteCorrectionsKey = new PluginKey<DecorationSet>("noteCorrections");
export function correctionAtPosition(state: import("@tiptap/pm/state").EditorState, pos: number) {
  return noteCorrectionsKey.getState(state)?.find().find(d => d.from <= pos && pos <= d.to);
}
export function createCorrectionPlugin() {
  return new Plugin<DecorationSet>({
    key: noteCorrectionsKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, previous) {
        const suggestions = tr.getMeta(noteCorrectionsKey) as NoteCorrection[] | undefined;
        if (suggestions) {
          const decorations: Decoration[] = [];
          suggestions.forEach((s, index) => {
            if (s.state) return;
            findCorrectionRanges(tr.doc, s.original).forEach(({ from, to }) => {
              if (decorations.some(d => d.from < to && from < d.to)) return;
              decorations.push(Decoration.inline(from, to, { class: `note-correction note-correction-${correctionKind(s)}`, "data-note-correction": String(index), title: `${correctionKind(s) === "spelling" ? "Spelling" : "Unclear wording"}: ${s.suggestion}` }, { original: tr.doc.textBetween(from, to, "", "\ufffc"), index }));
            });
          });
          return DecorationSet.create(tr.doc, decorations);
        }
        if (!tr.docChanged) return previous;
        const mapped = previous.map(tr.mapping, tr.doc);
        return mapped.remove(mapped.find().filter(d => tr.doc.textBetween(d.from, d.to, "", "\ufffc") !== d.spec.original));
      },
    },
    props: {
      decorations: state => noteCorrectionsKey.getState(state),
      handleClick(view, pos, event) {
        const target = event.target instanceof Element ? event.target.closest("[data-note-correction]") : null;
        if (!target) return false;
        const range = correctionAtPosition(view.state, pos);
        if (!range) return false;
        view.dom.dispatchEvent(new CustomEvent("note-correction-select", { detail: { index: range.spec.index, from: range.from, to: range.to, anchor: target } }));
        return true;
      },
    },
  });
}
export const NoteCorrections = Extension.create({ name: "noteCorrections", addProseMirrorPlugins: () => [createCorrectionPlugin()] });

/** Normalized key so a rejected fix stays rejected even if the AI rewords its reason. */
export const rejectKey = (original: string) => original.trim().replace(/\s+/g, " ").toLowerCase();
export function dropRejected<T extends { original: string }>(items: T[], rejected: Set<string>): T[] {
  return items.filter((s) => !rejected.has(rejectKey(s.original)));
}
