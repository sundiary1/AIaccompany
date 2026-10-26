import { useBlocker } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  type CreateProject,
  type Project,
  type ProjectDetail,
  ProjectError,
  projectsAPI,
} from "./project-api"
import type { useSandplayBridge } from "./useSandplayBridge"

type Bridge = ReturnType<typeof useSandplayBridge>
const text = (error: unknown) =>
  error instanceof Error ? error.message : "作品操作未成功，请重试。"

/** One writer per mounted page, acknowledged baselines and revision CAS on server. */
export function useSandplayProjects(bridge: Bridge) {
  const { sceneRequest, status, change } = bridge
  const [current, setCurrent] = useState<Project | null>(null)
  const [items, setItems] = useState<Project[]>([])
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [error, setError] = useState("")
  const [listError, setListError] = useState("")
  const [saveState, setSaveState] = useState("示例预览 · 尚未保存为作品")
  const [discardPrompt, setDiscardPrompt] = useState<string | null>(null)
  const discardResolver = useRef<((discard: boolean) => void) | null>(null)
  const confirmDiscard = useCallback((message: string) => {
    if (discardResolver.current) return Promise.resolve(false)
    setDiscardPrompt(message)
    return new Promise<boolean>((resolve) => {
      discardResolver.current = resolve
    })
  }, [])
  const resolveDiscard = useCallback((discard: boolean) => {
    const resolve = discardResolver.current
    discardResolver.current = null
    setDiscardPrompt(null)
    resolve?.(discard)
  }, [])
  const currentRef = useRef<Project | null>(null)
  const baseline = useRef("")
  const lock = useRef(false)
  const pendingCreate = useRef<CreateProject | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      discardResolver.current?.(false)
      discardResolver.current = null
    }
  }, [])
  const select = useCallback((project: Project | null) => {
    currentRef.current = project
    setCurrent(project)
  }, [])

  const refresh = useCallback(async () => {
    try {
      // Pages are bounded; list metadata never downloads every scene.
      const all: Project[] = []
      for (let offset = 0; ; offset += 100) {
        const rows = await projectsAPI.list(offset)
        all.push(...rows)
        if (rows.length < 100 || offset >= 9900) break
      }
      if (mounted.current) {
        setItems(all)
        setListError("")
      }
    } catch (reason) {
      if (mounted.current) setListError(text(reason))
    }
  }, [])

  const inspect = useCallback(async () => {
    const scene = await sceneRequest("scene:get")
    const changed = baseline.current !== JSON.stringify(scene)
    if (mounted.current) setDirty(changed)
    return { scene, changed }
  }, [sceneRequest])

  useEffect(() => {
    if (status !== "ready") return
    let active = true
    void sceneRequest("scene:get")
      .then((scene) => {
        if (!active) return
        baseline.current = JSON.stringify(scene)
        select(null)
        pendingCreate.current = null
        setDirty(false)
        setSaveState("示例预览 · 尚未保存为作品")
      })
      .catch((reason) => {
        if (active) setError(text(reason))
      })
    return () => {
      active = false
    }
  }, [status, sceneRequest, select])

  const save = useCallback(
    async (title?: string): Promise<boolean> => {
      if (lock.current || status !== "ready") return false
      lock.current = true
      setBusy(true)
      setError("")
      setSaveState("正在保存…")
      try {
        const { scene } = await inspect()
        const project = currentRef.current
        let saved: ProjectDetail
        if (title !== undefined || !project || pendingCreate.current) {
          if (!pendingCreate.current) {
            if (!title?.trim()) throw new ProjectError("请先填写作品名称。")
            pendingCreate.current = {
              id: crypto.randomUUID(),
              title: title.trim(),
              scene,
            }
          }
          saved = await projectsAPI.create(pendingCreate.current)
          pendingCreate.current = null
        } else saved = await projectsAPI.save(project, scene)
        if (!mounted.current) return true
        select(saved)
        baseline.current = JSON.stringify(saved.scene)
        const latest = await inspect()
        setSaveState(
          latest.changed ? "有新修改 · 等待自动保存" : "已保存到本机作品库",
        )
        void refresh()
        return true
      } catch (reason) {
        if (mounted.current) {
          setError(text(reason))
          setSaveState("保存失败 · 当前编辑仍保留")
        }
        return false
      } finally {
        lock.current = false
        if (mounted.current) setBusy(false)
      }
    },
    [inspect, refresh, select, status],
  )

  useEffect(() => {
    if (!change || status !== "ready" || lock.current) return
    let active = true
    void inspect()
      .then(({ changed }) => {
        if (active && changed) {
          setError("")
          setSaveState(
            currentRef.current
              ? "有新修改 · 等待自动保存"
              : "未保存 · 请为作品命名",
          )
        }
      })
      .catch((reason) => {
        if (active) setError(text(reason))
      })
    return () => {
      active = false
    }
  }, [change, inspect, status])

  useEffect(() => {
    // Every edit restarts the trailing debounce.
    if (!change || !dirty || !current || busy || error || status !== "ready")
      return
    const timer = window.setTimeout(() => {
      void save()
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [dirty, current, busy, error, status, save, change])

  const canDiscard = useCallback(async () => {
    if (lock.current) return false
    if (status !== "ready")
      return (
        !dirty ||
        (await confirmDiscard(
          "沙盘连接已中断，可能有未保存的修改。建议继续编辑，恢复连接后先保存。",
        ))
      )
    try {
      const { changed } = await inspect()
      return (
        !changed ||
        (await confirmDiscard(
          "当前修改尚未保存到本机作品库。可以继续编辑并点击“保存”或“另存为”，把这方风景留下。",
        ))
      )
    } catch (reason) {
      setError(text(reason))
      return false
    }
  }, [confirmDiscard, dirty, inspect, status])
  const shouldBlock = useCallback(
    async () => !(await canDiscard()),
    [canDiscard],
  )
  useBlocker({
    shouldBlockFn: shouldBlock,
    enableBeforeUnload: dirty || busy,
  })

  const run = useCallback(async (operation: () => Promise<void>) => {
    if (lock.current) return false
    lock.current = true
    setBusy(true)
    setTransitioning(true)
    setError("")
    try {
      await operation()
      return true
    } catch (reason) {
      if (mounted.current) {
        setError(text(reason))
        setSaveState("操作失败 · 当前编辑仍保留")
      }
      return false
    } finally {
      lock.current = false
      if (mounted.current) {
        setBusy(false)
        setTransitioning(false)
      }
    }
  }, [])

  const open = async (project: Project) => {
    if (!(await canDiscard())) return false
    return run(async () => {
      const saved = await projectsAPI.get(project.id)
      const scene = await sceneRequest("scene:load", saved.scene)
      select(saved)
      baseline.current = JSON.stringify(scene)
      pendingCreate.current = null
      setDirty(false)
      setSaveState("已打开 · 已保存到本机作品库")
    })
  }
  const newProject = async () => {
    if (!(await canDiscard())) return false
    return run(async () => {
      const scene = await sceneRequest("scene:new")
      select(null)
      baseline.current = ""
      pendingCreate.current = null
      setDirty(true)
      setSaveState(
        `新的空白作品 · ${scene.theme === "sand" ? "荒漠" : "草地"} · 请命名保存`,
      )
    })
  }
  const importLegacy = async () => {
    if (!(await canDiscard())) return false
    return run(async () => {
      const legacy = await sceneRequest("scene:legacy")
      await sceneRequest("scene:load", legacy)
      select(null)
      baseline.current = ""
      pendingCreate.current = null
      setDirty(true)
      setSaveState("旧存档已载入画布 · 请命名保存到作品库")
    })
  }
  const rename = (project: Project, title: string) =>
    run(async () => {
      const row = await projectsAPI.rename(
        currentRef.current?.id === project.id ? currentRef.current : project,
        title,
      )
      if (currentRef.current?.id === row.id) select(row)
      await refresh()
    })
  const remove = (project: Project) =>
    run(async () => {
      await projectsAPI.delete(
        currentRef.current?.id === project.id ? currentRef.current : project,
      )
      if (currentRef.current?.id === project.id) {
        select(null)
        pendingCreate.current = null
        setDirty(true)
        setSaveState("作品已删除 · 画布仍保留，可另存为新作品")
      }
      await refresh()
    })
  return {
    current,
    items,
    dirty,
    busy,
    transitioning,
    error,
    listError,
    saveState,
    refresh,
    save,
    open,
    newProject,
    importLegacy,
    rename,
    remove,
    discardPrompt,
    resolveDiscard,
    confirmDiscard,
  }
}
