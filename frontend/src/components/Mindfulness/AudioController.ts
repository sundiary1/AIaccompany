import type { MindfulnessTrack } from "./mindfulnessTracks"

export type AudioStatus =
  | "idle"
  | "loading"
  | "paused"
  | "playing"
  | "ended"
  | "error"
export interface AudioSnapshot {
  trackId: string | null
  status: AudioStatus
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  loop: boolean
  error: string | null
}

export const clampTime = (time: number, duration: number) =>
  Number.isFinite(time) && Number.isFinite(duration)
    ? Math.max(0, Math.min(time, Math.max(0, duration)))
    : 0

export function formatMediaTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--"
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

/** One media element, one source. No timers or synthetic playback progress. */
export class AudioController {
  private media: HTMLAudioElement | null = null
  private track: MindfulnessTrack | null = null
  private generation = 0
  private removeListeners: (() => void) | null = null
  private listeners = new Set<() => void>()
  private snapshot: AudioSnapshot = {
    trackId: null,
    status: "idle",
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 0.7,
    muted: false,
    loop: false,
    error: null,
  }

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(patch: Partial<AudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.listeners) listener()
  }
  attach(media: HTMLAudioElement) {
    this.detach()
    this.media = media
    media.volume = this.snapshot.volume
    media.muted = this.snapshot.muted
    media.loop = this.snapshot.loop
    const metadata = () =>
      this.update({
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        status: media.paused ? "paused" : "playing",
      })
    const time = () =>
      this.update({ currentTime: clampTime(media.currentTime, media.duration) })
    const events: Record<string, () => void> = {
      loadedmetadata: metadata,
      durationchange: () =>
        this.update({
          duration: Number.isFinite(media.duration) ? media.duration : 0,
        }),
      timeupdate: time,
      seeking: time,
      play: () => this.update({ playing: true }),
      playing: () =>
        this.update({ status: "playing", playing: true, error: null }),
      pause: () => {
        if (this.snapshot.status !== "error")
          this.update({
            status: media.ended ? "ended" : "paused",
            playing: false,
          })
      },
      waiting: () => this.update({ status: "loading" }),
      ended: () =>
        this.update({
          status: "ended",
          playing: false,
          currentTime: clampTime(media.currentTime, media.duration),
        }),
      error: () =>
        this.update({
          status: "error",
          playing: false,
          error: "音频加载失败，请检查文件或选择其他音频。",
        }),
      volumechange: () =>
        this.update({ volume: media.volume, muted: media.muted }),
    }
    for (const [event, handler] of Object.entries(events))
      media.addEventListener(event, handler)
    this.removeListeners = () => {
      for (const [event, handler] of Object.entries(events))
        media.removeEventListener(event, handler)
    }
    if (this.track) this.select(this.track)
  }
  detach() {
    this.generation++
    this.removeListeners?.()
    this.removeListeners = null
    if (this.media) {
      this.media.pause()
      this.media.removeAttribute("src")
      this.media.load()
    }
    this.media = null
  }
  select(track: MindfulnessTrack) {
    this.generation++
    this.track = track
    this.media?.pause()
    this.update({
      trackId: track.id,
      status: "loading",
      playing: false,
      currentTime: 0,
      duration: 0,
      error: null,
    })
    if (this.media) {
      this.media.src = track.src
      this.media.load()
    }
  }
  async play() {
    const media = this.media
    if (!media || !this.track) return
    const generation = this.generation
    if (media.ended) this.seek(0)
    if (this.snapshot.status === "error") media.load()
    this.update({ error: null })
    try {
      // Called directly by the user's click, including on iOS; never auto-play.
      await media.play()
    } catch (error) {
      if (generation !== this.generation) return
      const denied =
        error instanceof DOMException && error.name === "NotAllowedError"
      this.update({
        status: "error",
        playing: false,
        error: denied
          ? "浏览器暂未允许播放，请再次点击播放。"
          : "暂时无法播放这段音频，请重试或选择其他音频。",
      })
    }
  }
  pause() {
    this.generation++
    this.media?.pause()
    if (this.track && this.snapshot.status !== "error")
      this.update({ status: "paused", playing: false })
  }
  seek(time: number) {
    if (!this.media || !this.snapshot.duration) return
    const currentTime = clampTime(time, this.snapshot.duration)
    this.media.currentTime = currentTime
    this.update({
      currentTime,
      ...(this.snapshot.status === "ended" &&
      currentTime < this.snapshot.duration
        ? { status: "paused" as const }
        : {}),
    })
  }
  skip(seconds: number) {
    this.seek(this.snapshot.currentTime + seconds)
  }
  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return
    const value = Math.max(0, Math.min(1, volume))
    if (this.media) this.media.volume = value
    this.update({ volume: value })
  }
  setMuted(muted: boolean) {
    if (this.media) this.media.muted = muted
    this.update({ muted })
  }
  setLoop(loop: boolean) {
    if (this.media) this.media.loop = loop
    this.update({ loop })
  }
}
