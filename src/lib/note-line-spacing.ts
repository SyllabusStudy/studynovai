import { Extension } from "@tiptap/core";

export const NoteLineSpacing = Extension.create({
  name: "noteLineSpacing",
  addGlobalAttributes() {
    return [{
      types: ["paragraph", "heading"],
      attributes: {
        lineSpacing: {
          default: null,
          parseHTML: element => ["1", "1.5", "2"].includes(element.style.lineHeight) ? element.style.lineHeight : null,
          renderHTML: attributes => ["1", "1.5", "2"].includes(String(attributes['lineSpacing']))
            ? { style: `line-height: ${attributes['lineSpacing']}` } : {},
        },
      },
    }];
  },
});