import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { correctionKind, createCorrectionPlugin, findCorrectionRanges, noteCorrectionsKey } from "./note-corrections";
const schema = new Schema({ nodes: { doc: { content: "paragraph+" }, paragraph: { content: "text*", group: "block" }, text: { group: "inline" } }, marks: { bold: {} } });
const doc = schema.node("doc", null, [schema.node("paragraph", null, [schema.text("The "), schema.text("wrng", [schema.mark("bold")]), schema.text(" words make cloudy sense.")])]);
const suggestions = [{ original: "wrng", suggestion: "wrong", reason: "spelling: typo", kind: "spelling" as const }, { original: "make cloudy sense", suggestion: "are unclear", reason: "wording: unclear", kind: "wording" as const }] as const;
describe("Notes corrections", () => {
  it("separates spelling from unclear wording", () => {
    expect(correctionKind(suggestions[0])).toBe("spelling");
    expect(correctionKind(suggestions[1])).toBe("wording");
    expect(correctionKind({ original: "are", suggestion: "is", reason: "grammar: agreement" })).toBe("wording");
  });
  it("finds phrases across formatting", () => {
    expect(findCorrectionRanges(doc, "The wrng words")).toEqual([{ from: 1, to: 15 }]);
  });
  it("annotations never change saved notes and rejecting removes them", () => {
    let state = EditorState.create({ schema, doc, plugins: [createCorrectionPlugin()] });
    state = state.apply(state.tr.setMeta(noteCorrectionsKey, suggestions));
    expect(state.doc.toJSON()).toEqual(doc.toJSON());
    expect(noteCorrectionsKey.getState(state)?.find()).toHaveLength(2);
    state = state.apply(state.tr.setMeta(noteCorrectionsKey, suggestions.map(s => ({ ...s, state: "rejected" }))));
    expect(noteCorrectionsKey.getState(state)?.find()).toHaveLength(0);
    expect(state.doc.toJSON()).toEqual(doc.toJSON());
  });
  it("removes changed issues while mapping untouched issues", () => {
    let state = EditorState.create({ schema, doc, plugins: [createCorrectionPlugin()] });
    state = state.apply(state.tr.setMeta(noteCorrectionsKey, suggestions));
    state = state.apply(state.tr.insertText("wrong", 5, 9));
    const remaining = noteCorrectionsKey.getState(state)?.find() ?? [];
    expect(remaining).toHaveLength(1);
    const first = remaining[0];
    expect(first && state.doc.textBetween(first.from, first.to)).toBe("make cloudy sense");
  });
});
