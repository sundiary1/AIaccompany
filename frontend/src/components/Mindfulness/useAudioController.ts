import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { AudioController } from "./AudioController"
import type { MindfulnessTrack } from "./mindfulnessTracks"

export function useAudioController(tracks: readonly MindfulnessTrack[]) {
  const [controller] = useState(() => new AudioController())
  const audioRef = useRef<HTMLAudioElement>(null)
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  useEffect(() => {
    if (!audioRef.current) return
    controller.attach(audioRef.current)
    if (tracks[0] && !controller.getSnapshot().trackId)
      controller.select(tracks[0])
    return () => controller.detach()
  }, [controller, tracks])
  return { controller, state, audioRef }
}
