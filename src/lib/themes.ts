export type Theme = {
  id: string;
  name: string;
  background: string;
  accent: string;
  textColor: string;
  priceSparks: number;
};

export const THEMES: Theme[] = [
  {
    id: "classic",
    name: "Classic",
    background: "#111111",
    accent: "#DCEEB1",
    textColor: "#ffffff",
    priceSparks: 0,
  },
  {
    id: "lilac-bloom",
    name: "Lilac Bloom",
    background: "#C5B0F4",
    accent: "#F4ECD6",
    textColor: "#000000",
    priceSparks: 50,
  },
  {
    id: "citrus-lime",
    name: "Citrus Lime",
    background: "#DCEEB1",
    accent: "#F3C9B6",
    textColor: "#000000",
    priceSparks: 50,
  },
  {
    id: "cream-soda",
    name: "Cream Soda",
    background: "#F4ECD6",
    accent: "#EFD4D4",
    textColor: "#000000",
    priceSparks: 75,
  },
  {
    id: "blush-coral",
    name: "Blush Coral",
    background: "#EFD4D4",
    accent: "#C5B0F4",
    textColor: "#000000",
    priceSparks: 75,
  },
  {
    id: "sherbet",
    name: "Sherbet",
    background: "#F3C9B6",
    accent: "#DCEEB1",
    textColor: "#000000",
    priceSparks: 100,
  },
];

export function getTheme(themeId: string): Theme {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
}
