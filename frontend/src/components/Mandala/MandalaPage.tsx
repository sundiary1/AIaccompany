import { Link, useBlocker } from "@tanstack/react-router"
import { Card, Input, Modal, Tag, Title, Tooltip } from "animal-island-ui"
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Download,
  Palette,
  Redo2,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import { CanvasViewport } from "./CanvasViewport"
import { ColoringCanvas } from "./ColoringCanvas"
import { MandalaSettings, TemplatePreview } from "./MandalaSettings"
import { MandalaTools, PALETTE } from "./MandalaTools"
import styles from "./mandala.module.css"
import { type Axes, type MandalaWork, serializeWork } from "./mandala-data"
import { downloadBlob, exportPng } from "./mandala-export"
import { SymmetryCanvas } from "./SymmetryCanvas"
import { TEMPLATES } from "./templates"
import { useMandalaHistory } from "./useMandalaHistory"

type Confirmation = { title: string; text: string; action: () => void }
export function MandalaPage() {
  const history = useMandalaHistory()
  const { work } = history
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState("我的曼陀罗")
  const [color, setColor] = useState(PALETTE[0])
  const [erase, setErase] = useState(false)
  const [width, setWidth] = useState(6)
  const [opacity, setOpacity] = useState(90)
  const [folds, setFolds] = useState<Axes>(8)
  const [mirror, setMirror] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exported, setExported] = useState("")
  const [notice, setNotice] = useState("")
  const fingerprint = useMemo(() => serializeWork(work), [work])
  const hasContent =
    work.mode === "coloring"
      ? Object.keys(work.fills).length > 0
      : work.strokes.length > 0
  const dirty = editing && hasContent && fingerprint !== exported
  const shouldBlock = useCallback(() => dirty, [dirty])
  const blocker = useBlocker({
    shouldBlockFn: shouldBlock,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  const confirm = (
    title: string,
    text: string,
    action: () => void,
    always = false,
  ) => {
    if (dirty || always) setConfirmation({ title, text, action })
    else action()
  }
  const commit = (next: MandalaWork) => {
    history.commit(next)
    setNotice("")
  }
  const start = (mode: MandalaWork["mode"]) => {
    history.reset(
      mode === "coloring"
        ? { version: 1, mode, templateId: TEMPLATES[0].id, fills: {} }
        : { version: 1, mode, strokes: [] },
    )
    setExported("")
    setNotice("")
    setErase(false)
    setEditing(true)
  }
  const chooseTemplate = (templateId: string) =>
    confirm(
      "切换图案？",
      "当前涂色尚未导出。切换会清除它，可以先取消并导出 PNG。",
      () => {
        history.reset({ version: 1, mode: "coloring", templateId, fills: {} })
        setExported("")
        setNotice("")
        setSettingsOpen(false)
      },
    )
  const savePng = async () => {
    setExporting(true)
    setNotice("")
    try {
      const blob = await exportPng(work)
      downloadBlob(blob, title)
      setExported(fingerprint)
      setNotice("PNG 已生成，请在浏览器下载中查看。")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "导出失败，请重试")
    } finally {
      setExporting(false)
    }
  }
  const settings = (
    <MandalaSettings
      mode={work.mode}
      templateId={work.mode === "coloring" ? work.templateId : undefined}
      onTemplate={(id) => {
        if (work.mode !== "coloring" || work.templateId !== id) {
          setSettingsOpen(false)
          chooseTemplate(id)
        }
      }}
      folds={folds}
      onFolds={setFolds}
      mirror={mirror}
      onMirror={setMirror}
    />
  )
  return (
    <div
      className={styles.page}
      data-editing={editing}
      data-testid="mandala-page"
    >
      <header className={styles.header}>
        <Link to="/island-preview" preload={false} className={styles.back}>
          <ArrowLeft size={17} />
          <span>返回心屿</span>
        </Link>
        <div className={styles.brand}>
          <BookOpen size={22} />
          <strong>书屋 · 曼陀罗绘画</strong>
        </div>
        {!editing && (
          <span className={styles.headerNote}>让颜色，慢慢展开。</span>
        )}
        {editing && (
          <>
            <Input
              aria-label="作品名称"
              className={styles.nameInput}
              value={title}
              maxLength={60}
              onChange={(event) => setTitle(event.target.value)}
            />
            <div className={styles.headerTools}>
              <Tooltip title="撤销">
                <IslandButton
                  aria-label="撤销"
                  disabled={!history.canUndo || exporting}
                  onClick={history.undo}
                >
                  <Undo2 size={17} />
                </IslandButton>
              </Tooltip>
              <Tooltip title="重做">
                <IslandButton
                  aria-label="重做"
                  disabled={!history.canRedo || exporting}
                  onClick={history.redo}
                >
                  <Redo2 size={17} />
                </IslandButton>
              </Tooltip>
              <Tooltip title="清空当前作品">
                <IslandButton
                  aria-label="清空当前作品"
                  disabled={!hasContent || exporting}
                  onClick={() =>
                    confirm(
                      "清空当前作品？",
                      "清空后可以撤销恢复。",
                      () =>
                        commit(
                          work.mode === "coloring"
                            ? { ...work, fills: {} }
                            : { ...work, strokes: [] },
                        ),
                      true,
                    )
                  }
                >
                  <Trash2 size={17} />
                </IslandButton>
              </Tooltip>
              <IslandButton
                variant="primary"
                className={styles.exportButton}
                disabled={exporting}
                onClick={() => void savePng()}
              >
                <Download size={16} />
                <span>{exporting ? "导出中" : "导出 PNG"}</span>
              </IslandButton>
            </div>
          </>
        )}
      </header>
      {!editing ? (
        <main className={styles.welcome}>
          <div className={styles.welcomeIntro}>
            <span className={styles.eyebrow}>MIND ISLAND · 创作时光</span>
            <h1>
              留一页空白，
              <br />
              让心里的颜色落下来。
            </h1>
            <p>不必画得完美。从一片花瓣，或一条线开始。</p>
          </div>
          <div className={styles.welcomeArtwork}>
            <TemplatePreview template={TEMPLATES[4]} colored />
            <span>TAKE YOUR TIME</span>
          </div>
          <div className={styles.modeCards}>
            <Card className={styles.modeCard} color="app-green" pattern="none">
              <Palette size={25} />
              <Title size="small" variant="tab" color="app-green">
                自由涂色
              </Title>
              <p>选一幅图案，给每个小小的区域一种颜色。</p>
              <IslandButton variant="primary" onClick={() => start("coloring")}>
                开始涂色
                <ArrowUpRight size={16} />
              </IslandButton>
              <Tag size="small" variant="soft" color="app-green">
                {TEMPLATES.length} 幅原创图案
              </Tag>
            </Card>
            <Card className={styles.modeCard} color="app-blue" pattern="none">
              <Sparkles size={25} />
              <Title size="small" variant="tab" color="app-blue">
                对称创作
              </Title>
              <p>轻轻画一笔，让线条向四周生长、相遇。</p>
              <IslandButton onClick={() => start("symmetry")}>
                开始创作
                <ArrowUpRight size={16} />
              </IslandButton>
              <Tag size="small" variant="soft" color="app-blue">
                6 / 8 / 12 / 16 轴
              </Tag>
            </Card>
          </div>
        </main>
      ) : (
        <>
          <div className={styles.editorInfo}>
            <IslandButton
              className={styles.modeBack}
              onClick={() =>
                confirm(
                  "返回书屋？",
                  "当前作品尚未导出。返回后可重新选择创作模式。",
                  () => {
                    setEditing(false)
                    setNotice("")
                  },
                )
              }
            >
              <ArrowLeft size={14} />
              选择模式
            </IslandButton>
            <Tag size="small" variant="soft" color="app-teal">
              {work.mode === "coloring" ? "自由涂色" : "对称创作"}
            </Tag>
            <span role="status">
              {notice ||
                (dirty
                  ? "尚未导出 · 仅当前页面"
                  : exported
                    ? "已导出 PNG · 仅当前页面"
                    : "仅当前页面 · 请导出留存")}
            </span>
            <IslandButton
              className={styles.settingsButton}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={16} />
              设置
            </IslandButton>
          </div>
          <main className={styles.editor}>
            <aside className={styles.settingsPanel}>{settings}</aside>
            <CanvasViewport
              key={`${work.mode}-${work.mode === "coloring" ? work.templateId : "drawing"}`}
            >
              {(blocked) =>
                work.mode === "coloring" ? (
                  <ColoringCanvas
                    work={work}
                    color={color}
                    erase={erase}
                    blocked={blocked}
                    onChange={commit}
                  />
                ) : (
                  <SymmetryCanvas
                    strokes={work.strokes}
                    color={color}
                    width={width}
                    opacity={opacity}
                    folds={folds}
                    mirror={mirror}
                    blocked={blocked}
                    onStroke={(stroke) =>
                      commit({ ...work, strokes: [...work.strokes, stroke] })
                    }
                    onLimit={() =>
                      setNotice("已达到本页绘画上限，请先导出，再新建作品。 ")
                    }
                  />
                )
              }
            </CanvasViewport>
            <Card className={styles.toolPanel} pattern="none">
              <MandalaTools
                mode={work.mode}
                color={color}
                onColor={setColor}
                erase={erase}
                onErase={setErase}
                width={width}
                onWidth={setWidth}
                opacity={opacity}
                onOpacity={setOpacity}
              />
            </Card>
          </main>
          <footer className={styles.editorFooter}>
            <span>双指缩放和移动 · 鼠标中键拖动 · 下方按钮缩放</span>
            <a
              href="/licenses/mandala-maker-MIT.txt"
              target="_blank"
              rel="noreferrer"
            >
              绘图核心：Mandala Maker · MIT
            </a>
          </footer>
        </>
      )}
      <Modal
        open={settingsOpen}
        variant="default"
        typewriter={false}
        title="创作设置"
        className={styles.settingsModal}
        width="min(92vw, 460px)"
        onClose={() => setSettingsOpen(false)}
        footer={
          <IslandButton onClick={() => setSettingsOpen(false)}>
            完成
          </IslandButton>
        }
      >
        {settings}
      </Modal>
      <Modal
        open={!!confirmation || blocker.status === "blocked"}
        variant="default"
        typewriter={false}
        title={confirmation?.title || "离开书屋？"}
        width="min(92vw, 440px)"
        onClose={() => {
          setConfirmation(null)
          blocker.reset?.()
        }}
        footer={
          <>
            <IslandButton
              onClick={() => {
                setConfirmation(null)
                blocker.reset?.()
              }}
            >
              继续创作
            </IslandButton>
            <IslandButton
              variant="primary"
              onClick={() => {
                if (confirmation) {
                  confirmation.action()
                  setConfirmation(null)
                } else blocker.proceed?.()
              }}
            >
              确认
            </IslandButton>
          </>
        }
      >
        <p>
          {confirmation?.text ||
            "当前作品尚未导出。离开后编辑内容会丢失，建议先导出 PNG。"}
        </p>
      </Modal>
    </div>
  )
}
