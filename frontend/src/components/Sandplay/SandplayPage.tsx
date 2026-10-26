import { Link } from "@tanstack/react-router"
import { Modal } from "animal-island-ui"
import {
  ArrowLeft,
  CopyPlus,
  FolderOpen,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react"
import { useState } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import { ProjectDialog, ProjectLibrary } from "./ProjectLibrary"
import type { Project } from "./project-api"
import styles from "./sandplay.module.css"
import { useSandplayBridge } from "./useSandplayBridge"
import { useSandplayProjects } from "./useSandplayProjects"

type Editor = {
  mode: "save" | "rename" | "delete"
  project?: Project
  value: string
}

/** The original Three.js runtime stays in its own document and render loop. */
export function SandplayPage() {
  const bridge = useSandplayBridge()
  const projects = useSandplayProjects(bridge)
  const [library, setLibrary] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const disabled = bridge.status !== "ready" || projects.busy
  const nameNew = () => setEditor({ mode: "save", value: "" })
  const confirm = async () => {
    if (!editor) return
    let success = false
    if (editor.mode === "save") success = await projects.save(editor.value)
    if (editor.mode === "rename" && editor.project)
      success = await projects.rename(editor.project, editor.value)
    if (editor.mode === "delete" && editor.project)
      success = await projects.remove(editor.project)
    if (success) setEditor(null)
  }
  return (
    <div className={styles.page} data-testid="sandplay-page">
      <header className={styles.header}>
        <Link
          to="/island-preview"
          preload={false}
          className={styles.back}
          aria-label="返回"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          <span className={styles.backLabel}>返回</span>
        </Link>
        <h1 className={styles.title}>沙盒 · 心理沙盘</h1>
        {projects.current && (
          <span className={styles.projectTitle} title={projects.current.title}>
            {projects.current.title}
          </span>
        )}
        <div className={styles.actions}>
          <IslandButton
            type="button"
            onClick={() => setLibrary(true)}
            disabled={disabled}
            className={styles.toolButton}
            variant="default"
          >
            <FolderOpen size={16} />
            我的作品
          </IslandButton>
          <IslandButton
            type="button"
            onClick={() =>
              projects.current ? void projects.save() : nameNew()
            }
            disabled={disabled}
            className={`${styles.toolButton} ${styles.primary}`}
            variant="primary"
          >
            <Save size={16} />
            保存
          </IslandButton>
          <IslandButton
            type="button"
            onClick={nameNew}
            disabled={disabled}
            className={styles.toolButton}
            variant="default"
          >
            <CopyPlus size={16} />
            另存为
          </IslandButton>
        </div>
        <IslandButton
          type="button"
          className={styles.settings}
          disabled={disabled}
          aria-label="打开沙盘设置"
          onClick={() => bridge.command("open-settings")}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span className={styles.settingsLabel}>设置</span>
        </IslandButton>
      </header>
      <main
        className={styles.workspace}
        aria-label="沙盘创作区域"
        aria-busy={bridge.status === "loading"}
      >
        {bridge.status !== "error" && (
          <iframe
            key={bridge.attempt}
            ref={bridge.iframe}
            className={styles.frame}
            src={`${import.meta.env.BASE_URL}legacy/sandplay-v15.html`}
            title="沙盒 V15 心理沙盘创作"
            referrerPolicy="no-referrer"
            onLoad={() => bridge.command("status")}
          />
        )}
        {projects.error && !editor && (
          <p className={styles.saveError} role="alert">
            {projects.error}
          </p>
        )}
        {projects.transitioning && (
          <div className={styles.busyShield} aria-hidden="true" />
        )}
        {bridge.status !== "ready" && (
          <div
            className={styles.overlay}
            role={bridge.status === "error" ? "alert" : "status"}
          >
            <p>
              {bridge.status === "loading"
                ? "正在打开沙盒…"
                : "沙盘暂时无法打开"}
            </p>
            <span>
              {bridge.status === "loading"
                ? "首次打开需要联网加载独立的 Three.js 引擎。"
                : "请检查能否连接 cdn.jsdelivr.net，以及浏览器是否支持 WebGL。重试不会清除作品库或浏览器存档。"}
            </span>
            {bridge.status === "error" && (
              <IslandButton
                type="button"
                className={styles.retry}
                onClick={async () => {
                  if (
                    !projects.dirty ||
                    (await projects.confirmDiscard(
                      "重新加载会丢弃当前未保存的修改，确定继续吗？",
                    ))
                  )
                    bridge.retry()
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />
                重新加载沙盘
              </IslandButton>
            )}
          </div>
        )}
      </main>
      <Modal
        open={projects.discardPrompt !== null}
        variant="default"
        typewriter={false}
        title="还有未保存的风景"
        width="min(92vw, 440px)"
        onClose={() => projects.resolveDiscard(false)}
        footer={
          <>
            <IslandButton onClick={() => projects.resolveDiscard(false)}>
              继续编辑并保存
            </IslandButton>
            <IslandButton
              variant="primary"
              onClick={() => projects.resolveDiscard(true)}
            >
              放弃修改
            </IslandButton>
          </>
        }
      >
        <p>{projects.discardPrompt}</p>
      </Modal>
      <ProjectLibrary
        projects={projects}
        open={library}
        onClose={() => setLibrary(false)}
        onRename={(project) =>
          setEditor({ mode: "rename", project, value: project.title })
        }
        onDelete={(project) =>
          setEditor({ mode: "delete", project, value: project.title })
        }
        onImported={nameNew}
      />
      {editor && (
        <ProjectDialog
          title={
            editor.mode === "delete"
              ? "删除这件作品？"
              : editor.mode === "rename"
                ? "重新命名风景"
                : "保存为新作品"
          }
          description={
            editor.mode === "delete"
              ? `“${editor.value}”将从本机作品库永久删除。其他作品和浏览器旧存档不受影响。`
              : "名称与沙盘内容仅保存于本机 Demo 作品库。"
          }
          value={editor.value}
          onValue={(value) => setEditor({ ...editor, value })}
          onClose={() => setEditor(null)}
          onConfirm={confirm}
          busy={projects.busy}
          error={projects.error}
          deleting={editor.mode === "delete"}
        />
      )}
    </div>
  )
}
