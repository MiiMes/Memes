export const MEME_FONTS = [
  { value: 'Impact, "Arial Black", sans-serif', label: "Impact" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "monospace", label: "Monospace" },
];

export const MEME_FONT_FAMILIES = new Set(MEME_FONTS.map(({ value }) => value));
