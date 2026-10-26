import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

const PERSISTENT_NAV_QUERY =
  "(max-width: 760px), (hover: none), (pointer: coarse)"
const IDLE_DELAY = 4000

function subscribeDevice(notify: () => void) {
  const query = window.matchMedia(PERSISTENT_NAV_QUERY)
  query.addEventListener("change", notify)
  return () => query.removeEventListener("change", notify)
}
const persistentNavigation = () =>
  window.matchMedia(PERSISTENT_NAV_QUERY).matches

/** Desktop chrome retreats without moving the workspace; touch chrome stays put. */
export function useNavigationVisibility(autoHide: boolean) {
  const panel = useRef<HTMLDivElement>(null)
  const persistent = useSyncExternalStore(
    subscribeDevice,
    persistentNavigation,
    () => true,
  )
  const [hidden, setHidden] = useState(false)
  const reveal = useCallback(() => setHidden(false), [])

  useEffect(() => {
    reveal()
    if (!autoHide || persistent || !panel.current) return
    const element = panel.current
    let timer: ReturnType<typeof setTimeout> | undefined
    let pointerInside = element.matches(":hover")
    let lastScroll = window.scrollY
    const clear = () => clearTimeout(timer)
    const pinned = () =>
      pointerInside ||
      element.contains(document.activeElement) ||
      Array.from(document.querySelectorAll('[role="dialog"]')).some(
        (dialog) => dialog.getClientRects().length > 0,
      )
    const arm = () => {
      clear()
      if (document.hidden) return
      timer = setTimeout(() => {
        if (pinned()) arm()
        else setHidden(true)
      }, IDLE_DELAY)
    }
    const enter = () => {
      pointerInside = true
      clear()
    }
    const leave = () => {
      pointerInside = false
      arm()
    }
    const focus = () => {
      reveal()
      clear()
    }
    const scroll = () => {
      const delta = window.scrollY - lastScroll
      if (Math.abs(delta) < 8) return
      lastScroll = window.scrollY
      if (delta < 0) {
        reveal()
        arm()
      } else if (!pinned()) {
        clear()
        setHidden(true)
      }
    }
    const pointer = (event: PointerEvent) => {
      if (event.clientY > 24) return
      reveal()
      arm()
    }
    const keyboard = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      reveal()
      arm()
    }
    const visibility = () => {
      if (document.hidden) clear()
      else {
        reveal()
        arm()
      }
    }
    element.addEventListener("pointerenter", enter)
    element.addEventListener("pointerleave", leave)
    element.addEventListener("focusin", focus)
    element.addEventListener("focusout", arm)
    window.addEventListener("pointermove", pointer, { passive: true })
    window.addEventListener("scroll", scroll, { passive: true })
    document.addEventListener("keydown", keyboard)
    document.addEventListener("visibilitychange", visibility)
    arm()
    return () => {
      clear()
      element.removeEventListener("pointerenter", enter)
      element.removeEventListener("pointerleave", leave)
      element.removeEventListener("focusin", focus)
      element.removeEventListener("focusout", arm)
      window.removeEventListener("pointermove", pointer)
      window.removeEventListener("scroll", scroll)
      document.removeEventListener("keydown", keyboard)
      document.removeEventListener("visibilitychange", visibility)
    }
  }, [autoHide, persistent, reveal])

  return { panel, hidden: autoHide && !persistent && hidden, reveal }
}
