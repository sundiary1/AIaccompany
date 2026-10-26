export const JELLY_CONFIG = {
  stiffness: 105,
  damping: 7.8,
  pressIntensity: 0.11,
  wobbleAmplitude: 0.055,
  settleThreshold: 0.00015,
  hoverResponse: 0.018,
  maxDisplacement: 0.16,
  maxVelocity: 1.8,
} as const

export type Spring = { value: number; velocity: number }
export const spring = (): Spring => ({ value: 0, velocity: 0 })

/** Bounded fixed substeps keep touch impulses stable across different frame rates. */
export function advanceSpring(state: Spring, target: number, delta: number) {
  let remaining = Math.min(Math.max(delta, 0), 0.08)
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 240)
    state.velocity +=
      (-JELLY_CONFIG.stiffness * (state.value - target) -
        JELLY_CONFIG.damping * state.velocity) *
      dt
    state.velocity = Math.max(
      -JELLY_CONFIG.maxVelocity,
      Math.min(JELLY_CONFIG.maxVelocity, state.velocity),
    )
    state.value += state.velocity * dt
    state.value = Math.max(
      -JELLY_CONFIG.maxDisplacement,
      Math.min(JELLY_CONFIG.maxDisplacement, state.value),
    )
    remaining -= dt
  }
  if (
    Math.abs(state.value - target) + Math.abs(state.velocity) <
    JELLY_CONFIG.settleThreshold
  ) {
    state.value = target
    state.velocity = 0
  }
  return state.value !== target || state.velocity !== 0
}

export function pressSpring(state: Spring, weight = 1) {
  state.value = Math.max(
    -JELLY_CONFIG.maxDisplacement,
    state.value - JELLY_CONFIG.pressIntensity * weight,
  )
  state.velocity = Math.max(
    -JELLY_CONFIG.maxVelocity,
    state.velocity - 0.65 * weight,
  )
}
