import { useCallback, useEffect, useRef, useState } from "react"
import { ProjectError, type SandScene } from "./project-api"

const CHANNEL = "mind-island:sandplay-v15"
type Action = "scene:get" | "scene:load" | "scene:new" | "scene:legacy"
type Pending = {
  resolve: (scene: SandScene) => void
  reject: (error: Error) => void
  timer: number
}

export function useSandplayBridge() {
  const iframe = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [attempt, setAttempt] = useState(0)
  const [change, setChange] = useState(0)
  const pending = useRef(new Map<string, Pending>())
  const timer = useRef<number | undefined>(undefined)
  const rejectPending = useCallback(() => {
    for (const item of pending.current.values()) {
      window.clearTimeout(item.timer)
      item.reject(new ProjectError("沙盘连接已中断，未确认保存。", "bridge"))
    }
    pending.current.clear()
  }, [])
  const command = useCallback((action: string) => {
    iframe.current?.contentWindow?.postMessage(
      { channel: CHANNEL, version: 1, action },
      window.location.origin,
    )
  }, [])
  const startLoading = useCallback(() => {
    rejectPending()
    window.clearTimeout(timer.current)
    setStatus("loading")
    timer.current = window.setTimeout(() => setStatus("error"), 25000)
  }, [rejectPending])
  const sceneRequest = useCallback(
    (action: Action, scene?: SandScene) =>
      new Promise<SandScene>((resolve, reject) => {
        if (!iframe.current?.contentWindow) {
          reject(new ProjectError("沙盘尚未就绪，请稍后重试。", "bridge"))
          return
        }
        const requestId = crypto.randomUUID()
        const timeout = window.setTimeout(() => {
          pending.current.delete(requestId)
          reject(
            new ProjectError("沙盘通信超时，当前作品未确认保存。", "bridge"),
          )
        }, 5000)
        pending.current.set(requestId, { resolve, reject, timer: timeout })
        iframe.current.contentWindow.postMessage(
          { channel: CHANNEL, version: 1, action, requestId, scene },
          window.location.origin,
        )
      }),
    [],
  )

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== window.location.origin ||
        !iframe.current?.contentWindow ||
        event.source !== iframe.current.contentWindow ||
        !event.data ||
        typeof event.data !== "object"
      )
        return
      const data = event.data as Record<string, unknown>
      if (data.channel !== CHANNEL || data.version !== 1) return
      if (data.status === "ready" || data.status === "error") {
        window.clearTimeout(timer.current)
        setStatus(data.status)
        if (data.status === "error") rejectPending()
      }
      if (data.event === "scene:changed") setChange((value) => value + 1)
      if (data.event === "scene:result" && typeof data.requestId === "string") {
        const item = pending.current.get(data.requestId)
        if (!item) return
        pending.current.delete(data.requestId)
        window.clearTimeout(item.timer)
        if (data.ok === true && data.scene && typeof data.scene === "object")
          item.resolve(data.scene as SandScene)
        else
          item.reject(
            new ProjectError(
              data.code === "legacy_missing"
                ? "当前来源没有旧存档。其他浏览器、地址或端口的数据无法直接读取。"
                : "沙盘数据无效或无法加载，当前作品未保存。",
              "bridge",
            ),
          )
      }
    }
    window.addEventListener("message", onMessage)
    startLoading()
    command("status")
    return () => {
      window.clearTimeout(timer.current)
      window.removeEventListener("message", onMessage)
      rejectPending()
    }
  }, [command, rejectPending, startLoading])

  return {
    iframe,
    status,
    attempt,
    change,
    command,
    sceneRequest,
    retry: () => {
      startLoading()
      setAttempt((value) => value + 1)
    },
  }
}
