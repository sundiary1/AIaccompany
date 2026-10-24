import * as Dialog from "@radix-ui/react-dialog"
import { useGLTF } from "@react-three/drei"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeft,
  Info,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Waves,
  X,
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { ErrorBoundary, type FallbackProps } from "react-error-boundary"
import { ChatPanel } from "../Chat/ChatPanel"
import { useCompanionChat } from "../Chat/useCompanionChat"
import { CAT_MODEL_URL, type CompanionCatState } from "./CompanionCat"
import { ISLAND_MODEL_URL, IslandScene } from "./IslandScene"
import styles from "./island-preview.module.css"

function subscribeMotionPreference(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)")
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback)
  return () => document.removeEventListener("visibilitychange", callback)
}

function isPageVisible() {
  return document.visibilityState === "visible"
}

function SceneError({ resetErrorBoundary }: FallbackProps) {
  return (
    <div className={styles.staticFallback}>
      <img
        className={styles.fallbackImage}
        src={`${import.meta.env.BASE_URL}models/starter_jelly_island_preview.webp`}
        alt="果冻岛的静态预览：绿色草地、两棵小树和分层土壤"
        width={1000}
        height={1000}
      />
      <div className={styles.fallbackMessage} role="status">
        <p>已切换静态预览，仍可通过下方按钮了解小岛。</p>
        <button
          type="button"
          className={styles.retry}
          onClick={resetErrorBoundary}
        >
          <RotateCcw size={15} aria-hidden="true" />
          重试三维显示
        </button>
      </div>
    </div>
  )
}

export function IslandPreviewPage() {
  const reducedMotion = useSyncExternalStore(
    subscribeMotionPreference,
    prefersReducedMotion,
    () => true,
  )
  const visible = useSyncExternalStore(
    subscribeVisibility,
    isPageVisible,
    () => true,
  )
  const [motionEnabled, setMotionEnabled] = useState(true)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)
  const chat = useCompanionChat()
  const [characterState, setCharacterState] =
    useState<CompanionCatState>("Idle")
  const [characterActionKey, setCharacterActionKey] = useState(0)
  const infoButtonRef = useRef<HTMLButtonElement>(null)
  const chatButtonRef = useRef<HTMLButtonElement>(null)
  const onReady = useCallback(() => setReady(true), [])
  const openInfo = useCallback(() => {
    setInfoOpen(true)
  }, [])
  const runCharacterAction = useCallback((state: CompanionCatState) => {
    setCharacterState(state)
    setCharacterActionKey((key) => key + 1)
  }, [])
  const openCharacterInfo = useCallback(() => {
    setInfoOpen(false)
    runCharacterAction("Greeting")
    setChatOpen(true)
  }, [runCharacterAction])
  const closeChat = () => {
    chat.close()
    setCharacterState("Idle")
    setChatOpen(false)
    setChatExpanded(false)
    chatButtonRef.current?.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (!chat.generating) setCharacterState("Idle")
  }, [chat.generating])
  const finishCharacterAction = useCallback(() => setCharacterState("Idle"), [])
  const characterPlaying =
    motionEnabled &&
    !reducedMotion &&
    visible &&
    !failed &&
    !infoOpen &&
    !chatExpanded
  const playing =
    motionEnabled &&
    !reducedMotion &&
    visible &&
    !infoOpen &&
    !failed &&
    !chatExpanded
  const status = !ready
    ? "正在等待小岛"
    : reducedMotion
      ? "已遵循系统的减少动态设置"
      : motionEnabled && !infoOpen && !chatExpanded
        ? "正在轻轻漂浮"
        : "小岛暂时静止"

  return (
    <Dialog.Root open={infoOpen} onOpenChange={setInfoOpen}>
      <div
        className={styles.page}
        data-testid="island-preview-page"
        data-chat-open={chatOpen}
      >
        <header className={styles.header}>
          <div
            className={styles.brand}
            role="img"
            aria-label="心屿 Mind Island"
          >
            <span className={styles.brandMark}>
              <Waves size={24} strokeWidth={1.45} aria-hidden="true" />
            </span>
            <span className={styles.brandChinese}>心屿</span>
            <span className={styles.brandEnglish}>Mind Island</span>
          </div>
          <Link to="/" className={styles.back}>
            <ArrowLeft size={15} aria-hidden="true" />
            返回首页
          </Link>
        </header>

        <main className={styles.main}>
          <div className={styles.intro}>
            <p className={styles.eyebrow}>
              <span className={styles.smallLine} />
              一座属于自己的小岛
            </p>
            <h1>让心，轻轻靠岸。</h1>
            <p className={styles.description}>
              不急着去哪里，先在这里停一会儿。
            </p>
            <span className={styles.edition}>
              <span>01</span> 初始岛屿
            </span>
          </div>

          <section
            className={styles.stage}
            aria-label="果冻岛三维预览"
            aria-busy={!ready && !failed}
            data-testid="island-stage"
            data-state={failed ? "error" : ready ? "ready" : "loading"}
          >
            <ErrorBoundary
              FallbackComponent={SceneError}
              onError={() => setFailed(true)}
              onReset={() => {
                useGLTF.clear(ISLAND_MODEL_URL)
                useGLTF.clear(CAT_MODEL_URL)
                setReady(false)
                setFailed(false)
              }}
            >
              <IslandScene
                playing={playing}
                onReady={onReady}
                onSelect={openInfo}
                reducedMotion={reducedMotion}
                characterPlaying={characterPlaying}
                characterState={chat.generating ? "Responding" : characterState}
                characterActionKey={characterActionKey}
                onCharacterSelect={openCharacterInfo}
                onCharacterActionComplete={finishCharacterAction}
              />
              {!ready && (
                <div className={styles.loading} role="status">
                  <span className={styles.loadingDot} />
                  小岛正在靠近…
                </div>
              )}
            </ErrorBoundary>
          </section>

          <div className={styles.controls}>
            <div className={styles.motionStatus} role="status">
              <span
                className={styles.statusDot}
                data-playing={playing && ready}
              />
              {failed ? "静态预览" : status}
            </div>
            <button
              type="button"
              className={styles.motionButton}
              disabled={reducedMotion || !ready || failed}
              onClick={() => setMotionEnabled((current) => !current)}
              aria-label={motionEnabled ? "暂停岛屿动态" : "播放岛屿动态"}
            >
              {motionEnabled ? (
                <Pause size={15} strokeWidth={1.7} aria-hidden="true" />
              ) : (
                <Play size={15} strokeWidth={1.7} aria-hidden="true" />
              )}
              {reducedMotion
                ? "静态预览"
                : motionEnabled
                  ? "暂停动态"
                  : "继续动态"}
            </button>
            <Dialog.Trigger asChild>
              <button
                ref={infoButtonRef}
                type="button"
                className={styles.infoButton}
              >
                <Info size={15} strokeWidth={1.6} aria-hidden="true" />
                岛屿信息
              </button>
            </Dialog.Trigger>
            <button
              ref={chatButtonRef}
              type="button"
              className={styles.infoButton}
              onClick={openCharacterInfo}
              aria-expanded={chatOpen}
            >
              <MessageCircle size={15} strokeWidth={1.6} aria-hidden="true" />
              与小屿聊聊
            </button>
          </div>
        </main>

        <footer className={styles.footer}>
          <span>留一点空白，给此刻的自己。</span>
          <span className={styles.footerSignature}>MIND ISLAND · 心屿</span>
        </footer>
      </div>
      <ChatPanel
        open={chatOpen}
        chat={chat}
        onClose={closeChat}
        onExpandedChange={setChatExpanded}
      />
      <Dialog.Portal>
        <Dialog.Overlay className={styles.infoOverlay} />
        <Dialog.Content
          className={styles.infoPanel}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            infoButtonRef.current?.focus()
          }}
        >
          <span className={styles.panelIcon}>
            <Waves size={29} strokeWidth={1.35} aria-hidden="true" />
          </span>
          <Dialog.Title className={styles.panelTitle}>
            欢迎来到 Mind Island。
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            初始果冻岛的信息面板
          </Dialog.Description>
          <button
            type="button"
            className={styles.infoButton}
            onClick={openCharacterInfo}
          >
            认识小屿
          </button>
          <Dialog.Close asChild>
            <button type="button" className={styles.panelDismiss}>
              关闭
            </button>
          </Dialog.Close>
          <Dialog.Close asChild>
            <button
              type="button"
              className={styles.panelClose}
              aria-label="关闭信息面板"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
