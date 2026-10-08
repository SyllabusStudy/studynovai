import Image from "@tiptap/extension-image";

export type NoteImageAlign = "left" | "center" | "right";

/** Image with persisted width (%) and alignment, shared by private and shared Notes. */
export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = parseInt(el.getAttribute("data-width") ?? "", 10);
          return Number.isFinite(w) ? w : null;
        },
        renderHTML: () => ({}),
      },
      align: {
        default: "left",
        parseHTML: (el) => el.getAttribute("data-align") ?? "left",
        renderHTML: () => ({}),
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const width = node.attrs["width"] as number | null;
    const align = (node.attrs["align"] as NoteImageAlign) ?? "left";
    const margin = align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0 auto 0 0";
    return ["img", {
      ...HTMLAttributes,
      "data-width": width ?? undefined,
      "data-align": align,
      style: `display:block;margin:${margin};${width ? `width:${width}%;` : ""}`,
    }];
  },
}).configure({ allowBase64: true });

/** Reads image files (paste/drop/picker) as data URLs, rejecting unsupported or huge files. */
export function readNoteImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error("Use a PNG, JPG, WebP or GIF image."));
    if (file.size > 2 * 1024 * 1024) return reject(new Error("Images must be 2 MB or smaller."));
    const r = new FileReader();
    r.onload = () => (typeof r.result === "string" ? resolve(r.result) : reject(new Error("This image couldn't be opened.")));
    r.onerror = () => reject(new Error("This image couldn't be opened."));
    r.readAsDataURL(file);
  });
}
