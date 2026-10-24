import { useCallback, useEffect, useRef, useState } from "react"
import {
  getMemorySettings,
  getMemoryStatus,
  type MemorySettings,
  type MemoryStatus,
} from "./memory-api"

/** Only runs in an open NORMAL chat; never fetches memory during temporary chat. */
export function useMemoryStatus(active: boolean, generating: boolean) {
  const [settings, setSettings] = useState<MemorySettings | null>(null)
  const [status, setStatus] = useState<MemoryStatus | null>(null)
  const [notice, setNotice] = useState("")
  const refreshCurrent = useRef<() => void>(() => {})
  const lastSeen = useRef<string | null>(null)
  const generatingNow = useRef(generating)
  generatingNow.current = generating
  const refresh = useCallback(() => refreshCurrent.current(), [])
  useEffect(() => {
    if (!active) {
      setSettings(null)
      setStatus(null)
      setNotice("")
      return
    }
    const controller = new AbortController()
    let busy = false
    let automatic = false
    const read = async () => {
      if (busy || controller.signal.aborted) return
      busy = true
      try {
        const [nextSettings, nextStatus] = await Promise.all([
          getMemorySettings(controller.signal),
          getMemoryStatus(controller.signal),
        ])
        if (controller.signal.aborted) return
        setSettings(nextSettings)
        setStatus(nextStatus)
        automatic = Boolean(nextSettings.auto_extract)
        const change = nextStatus.jobs.find(
          (job) =>
            job.status === "completed" &&
            (job.added_count || job.updated_count || job.review_count),
        )
        if (change?.finished_at) {
          if (
            lastSeen.current &&
            Date.parse(change.finished_at) > Date.parse(lastSeen.current)
          )
            setNotice(
              change.review_count ? "有一件事需要你核对" : "小屿记住了一件事",
            )
          lastSeen.current = change.finished_at
        } else if (!lastSeen.current)
          lastSeen.current = new Date().toISOString()
      } catch {
        /* The mailbox shows actionable errors; chat stays usable. */
      } finally {
        busy = false
      }
    }
    refreshCurrent.current = () => {
      void read()
    }
    void read()
    const interval = window.setInterval(() => {
      if (automatic && !document.hidden && !generatingNow.current) void read()
    }, 3000)
    return () => {
      controller.abort()
      clearInterval(interval)
      refreshCurrent.current = () => {}
    }
  }, [active])
  return { settings, status, notice, refresh, dismiss: () => setNotice("") }
}
