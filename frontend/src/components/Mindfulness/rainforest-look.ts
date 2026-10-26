import { type Material, MeshStandardMaterial } from "three"

const PALETTE: Record<string, string> = {
  "Green.009": "#99bd73",
  "Tanah.010": "#bb956e",
  "Coklat.002": "#b58b5d",
  "Coklat Pohon": "#aa8054",
  "Brown.005": "#b58c65",
  "Stone.004": "#aeb4a1",
  "Water.007": "#72ced9",
}

/** Display overrides apply to leased clones only; source GLB colors stay intact. */
export function applyRainforestLook(materials: Iterable<Material>) {
  for (const material of materials) {
    if (!(material instanceof MeshStandardMaterial)) continue
    const color = PALETTE[material.name]
    if (color) material.color.set(color)
    const water = material.name === "Water.007"
    material.roughness = water ? 0.08 : Math.max(material.roughness, 0.65)
    material.metalness = water ? 0.03 : 0
    material.envMapIntensity = water ? 1.1 : 0.55
  }
}
