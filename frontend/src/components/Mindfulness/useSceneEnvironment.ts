import { useSyncExternalStore } from "react"

function motionSubscribe(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)")
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}
function visibilitySubscribe(callback: () => void) {
  document.addEventListener("visibilitychange", callback)
  return () => document.removeEventListener("visibilitychange", callback)
}
export function useSceneEnvironment() {
  const reducedMotion = useSyncExternalStore(
    motionSubscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  )
  const visible = useSyncExternalStore(
    visibilitySubscribe,
    () => document.visibilityState === "visible",
    () => true,
  )
  // A small CPU budget selects fewer local spring updates, never a different model.
  const simplified =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency <= 4
  return { reducedMotion, visible, simplified }
}
