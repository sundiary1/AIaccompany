import * as Dialog from "@radix-ui/react-dialog"
import { Card, Input } from "animal-island-ui"
import { FolderOpen, Pencil, Plus, Trash2, Upload, X } from "lucide-react"
import { useEffect } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import type { Project } from "./project-api"
import styles from "./sandplay.module.css"
import type { useSandplayProjects } from "./useSandplayProjects"

type Projects = ReturnType<typeof useSandplayProjects>

export function ProjectLibrary({
  projects,
  open,
  onClose,
  onRename,
  onDelete,
  onImported,
}: {
  projects: Projects
  open: boolean
  onClose: () => void
  onRename: (project: Project) => void
  onDelete: (project: Project) => void
  onImported: () => void
}) {
  const { refresh } = projects
  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
      modal={false}
    >
      <Dialog.Portal>
        <Dialog.Content
          className={styles.library}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className={styles.libraryHeading}>
            <div>
              <span className={styles.eyebrow}>SAND ISLAND / WORKS</span>
              <Dialog.Title>留在沙盒的风景</Dialog.Title>
            </div>
            <Dialog.Close
              className={styles.iconButton}
              aria-label="关闭我的作品"
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.libraryNote}>
            作品保存在本机 Demo 服务端的 SQLite 中，不会发送给
            AI，也不是账户云端作品库。
          </Dialog.Description>
          <div className={styles.libraryActions}>
            <IslandButton
              type="button"
              disabled={projects.busy}
              onClick={async () => {
                if (await projects.newProject()) onClose()
              }}
            >
              <Plus size={16} />
              新建空白作品
            </IslandButton>
            <IslandButton
              type="button"
              disabled={projects.busy}
              onClick={async () => {
                if (await projects.importLegacy()) {
                  onClose()
                  onImported()
                }
              }}
            >
              <Upload size={16} />
              导入浏览器旧存档
            </IslandButton>
          </div>
          <p className={styles.libraryNote}>
            旧存档只读取当前浏览器、地址及端口。原沙盘内的“保存作品 /
            恢复”仍使用浏览器本地存档。
          </p>
          {projects.listError && (
            <p role="alert" className={styles.error}>
              {projects.listError}
              <IslandButton type="button" onClick={() => void refresh()}>
                重新读取
              </IslandButton>
            </p>
          )}
          <div className={styles.projectList}>
            {!projects.items.length && !projects.listError && (
              <p className={styles.empty}>
                这里还没有作品。
                <br />
                摆好一方风景，再给它一个名字。
              </p>
            )}
            {projects.items.map((project) => (
              <Card
                role="article"
                key={project.id}
                className={styles.project}
                data-current={projects.current?.id === project.id}
              >
                <IslandButton
                  type="button"
                  className={styles.openProject}
                  disabled={projects.busy}
                  onClick={async () => {
                    if (await projects.open(project)) onClose()
                  }}
                >
                  <FolderOpen size={21} aria-hidden="true" />
                  <span>
                    <strong>{project.title}</strong>
                    <time dateTime={project.updated_at}>
                      {new Date(project.updated_at).toLocaleString("zh-CN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </span>
                </IslandButton>
                <IslandButton
                  type="button"
                  className={styles.iconButton}
                  disabled={projects.busy}
                  aria-label={`重命名 ${project.title}`}
                  onClick={() => onRename(project)}
                >
                  <Pencil size={16} />
                </IslandButton>
                <IslandButton
                  type="button"
                  className={styles.iconButton}
                  disabled={projects.busy}
                  aria-label={`删除 ${project.title}`}
                  onClick={() => onDelete(project)}
                >
                  <Trash2 size={16} />
                </IslandButton>
              </Card>
            ))}
          </div>
          <p className={styles.libraryNote}>
            已有作品修改后约 1.5 秒自动保存。示例与未命名作品不会自动入库。
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ProjectDialog({
  title,
  description,
  value,
  onValue,
  onClose,
  onConfirm,
  busy,
  error,
  deleting = false,
}: {
  title: string
  description: string
  value: string
  onValue: (value: string) => void
  onClose: () => void
  onConfirm: () => Promise<void>
  busy: boolean
  error: string
  deleting?: boolean
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogShade} />
        <Dialog.Content
          className={styles.dialog}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault()
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void onConfirm()
            }}
          >
            {!deleting && (
              <label htmlFor="sandplay-project-title">
                作品名称
                <Input
                  id="sandplay-project-title"
                  className={styles.projectInput}
                  value={value}
                  onChange={(event) => onValue(event.target.value)}
                  maxLength={80}
                  required
                  disabled={busy}
                  placeholder="给这方风景取个名字"
                />
              </label>
            )}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <div className={styles.dialogActions}>
              <IslandButton type="button" disabled={busy} onClick={onClose}>
                取消
              </IslandButton>
              <IslandButton
                type="submit"
                disabled={busy || (!deleting && !value.trim())}
                className={deleting ? styles.danger : styles.primary}
                variant="primary"
                danger={deleting}
                data-danger={deleting}
              >
                {busy ? "正在处理…" : deleting ? "确认删除" : "确认保存"}
              </IslandButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
