import { type Material, MeshStandardMaterial } from "three"

// Display-only overrides for cloned island materials; GLBs and cat colors stay intact.
const PALETTES: Record<string, Record<string, string>> = {
  home: { water: "#65c1d0", grass: "#718a41", ground: "#e3c884" },
  sandplay: {
    Water: "#58b5ca",
    Green: "#88bd5c",
    Green2: "#488443",
    Ground: "#714334",
    "Ground.001": "#885943",
  },
}

export function applyIslandPalette(
  islandId: string,
  materials: Iterable<Material>,
) {
  const palette = PALETTES[islandId]
  if (!palette) return
  for (const material of materials) {
    if (!(material instanceof MeshStandardMaterial)) continue
    const color = palette[material.name]
    if (color) material.color.set(color)
  }
}
