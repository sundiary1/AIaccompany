/** Landing-only framing. The original GLB and archipelago remain untouched. */
export const LANDING_MODEL_PATH = "models/islands/home-island.glb"
export const LANDING_WATER_LEVEL = 0.916
export const LANDING_WATER_SIZE = 512

type Point = [number, number, number]
export type LandingView = {
  position: Point
  target: Point
  fov: number
}

// Both presets look from the south-east; portrait keeps the landmark above copy.
export function getLandingView(width: number, height: number): LandingView {
  if (width / height < 0.9) {
    return {
      position: [7.6, 7.1, 10.5],
      target: [0.2, -0.3, 0.1],
      fov: 42,
    }
  }
  return {
    position: [5.8, 5.3, 8.5],
    target: [-1.8, 0.9, 0.8],
    fov: 40,
  }
}
