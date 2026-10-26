import * as Dialog from "@radix-ui/react-dialog"
import { useGLTF } from "@react-three/drei"
import { Link, useNavigate } from "@tanstack/react-router"
import { Tooltip } from "animal-island-ui"
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
import { IslandButton } from "../IslandUI/IslandButton"
import {
  BookIcon,
  ChatIcon,
  CloseIcon,
  LeafIcon,
  MapIcon,
  MinusIcon,
  MountainIcon,
  PlusIcon,
  RefreshIcon,
  SailboatIcon,
  TreeIcon,
} from "../IslandUI/island-icons"
import { HeaderAction, PageHeader } from "../IslandUI/PageHeader"
import { ArchipelagoMap } from "./ArchipelagoMap"
import { CAT_MODEL_URL, type CompanionCatState } from "./CompanionCat"
import { ForestAtmosphere } from "./ForestAtmosphere"
import forest from "./forest-experiment.module.css"
import { IslandScene, WORLD_MODEL_URLS } from "./IslandScene"
import styles from "./island-preview.module.css"
import { ISLANDS, type IslandDefinition } from "./island-world"
import type { ZoomRequest } from "./WorldCamera"

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

function subscribeCompact(callback: () => void) {
  const query = window.matchMedia("(max-width: 760px)")
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}
const isCompact = () => window.matchMedia("(max-width: 760px)").matches

function SceneError({ resetErrorBoundary }: FallbackProps) {
  return (
    <div className={styles.staticFallback}>
      <img
        className={styles.fallbackImage}
        src={`${import.meta.env.BASE_URL}models/islands/island-world-preview.png`}
        alt="心屿与沙盒的静态预览，云朵连接飞机岛和溪流小岛"
        width={1000}
        height={1000}
      />
      <div className={styles.fallbackMessage} role="status">
        <p>已切换静态预览，仍可通过下方按钮了解小岛。</p>
        <IslandButton
          type="button"
          className={styles.retry}
          onClick={resetErrorBoundary}
        >
          <RefreshIcon size={15} aria-hidden="true" />
          重试三维显示
        </IslandButton>
      </div>
    </div>
  )
}

export function IslandPreviewPage() {
  const compact = useSyncExternalStore(subscribeCompact, isCompact, () => false)
  const navigate = useNavigate()
  const navigationTimer = useRef<number | undefined>(undefined)
  const navigating = useRef(false)
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
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const mapButtonRef = useRef<HTMLButtonElement>(null)
  const mapSelected = useRef(false)
  const [backgroundMoving, setBackgroundMoving] = useState(true)
  const [resetKey, setResetKey] = useState(0)
  const [zoomRequest, setZoomRequest] = useState<ZoomRequest>({
    id: 0,
    direction: 1,
  })
  const zoom = (direction: 1 | -1) =>
    setZoomRequest((request) => ({ id: request.id + 1, direction }))
  const [chatOpen, setChatOpen] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)
  const chat = useCompanionChat()
  const [characterState, setCharacterState] =
    useState<CompanionCatState>("Idle")
  const [characterActionKey, setCharacterActionKey] = useState(0)
  useEffect(() => () => window.clearTimeout(navigationTimer.current), [])
  const enterIsland = useCallback(
    (island: IslandDefinition) => {
      if (!island.enabled || navigating.current) return
      navigating.current = true
      navigationTimer.current = window.setTimeout(
        () => {
          void navigate({ to: island.route })
        },
        reducedMotion ? 0 : 220,
      )
    },
    [navigate, reducedMotion],
  )
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
    setMapOpen(false)
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
    !reducedMotion &&
    visible &&
    !failed &&
    !infoOpen &&
    !mapOpen &&
    !chatExpanded
  const playing =
    !reducedMotion &&
    visible &&
    !infoOpen &&
    !mapOpen &&
    !failed &&
    !chatExpanded
  const controlsEnabled = visible && !infoOpen && !mapOpen && !chatExpanded

  return (
    <Dialog.Root open={infoOpen} onOpenChange={setInfoOpen}>
      <div
        className={styles.page}
        data-testid="island-preview-page"
        data-chat-open={chatOpen}
        data-map-open={mapOpen}
      >
        <ForestAtmosphere moving={backgroundMoving && playing} />
        <PageHeader
          home
          title="心屿"
          icon={<SailboatIcon size={20} />}
          actions={
            <Tooltip title="查看群岛与入口" placement="bottom">
              <HeaderAction
                icon={<MapIcon size={17} />}
                label="群岛地图"
                ref={mapButtonRef}
                aria-label="群岛地图"
                aria-haspopup="dialog"
                aria-expanded={mapOpen}
                onClick={() => {
                  mapSelected.current = false
                  setMapOpen(true)
                }}
              />
            </Tooltip>
          }
        />

        <div className={styles.worldContent}>
          <main className={styles.main}>
            <div className={styles.intro}>
              <h1>让心，轻轻靠岸。</h1>
              <p className={styles.description}>
                不急着去哪里，先在这里停一会儿。
              </p>
            </div>

            <section
              className={styles.stage}
              aria-label="群岛世界三维预览"
              aria-busy={!ready && !failed}
              data-testid="island-stage"
              data-state={failed ? "error" : ready ? "ready" : "loading"}
            >
              <ErrorBoundary
                FallbackComponent={SceneError}
                onError={() => setFailed(true)}
                onReset={() => {
                  for (const url of WORLD_MODEL_URLS) useGLTF.clear(url)
                  useGLTF.clear(CAT_MODEL_URL)
                  setReady(false)
                  setFailed(false)
                }}
              >
                <IslandScene
                  compact={compact}
                  controlsEnabled={controlsEnabled}
                  resetKey={resetKey}
                  zoomRequest={zoomRequest}
                  playing={playing}
                  onReady={onReady}
                  onSelect={openInfo}
                  onIslandSelect={enterIsland}
                  reducedMotion={reducedMotion}
                  characterPlaying={characterPlaying}
                  characterState={
                    chat.generating ? "Responding" : characterState
                  }
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
              <div className={forest.gestureHint} aria-hidden="true">
                <span className={forest.desktopHint}>拖动探索 · 滚轮缩放</span>
                <span className={forest.touchHint}>单指旋转 · 双指缩放</span>
              </div>
              <fieldset
                className={forest.sceneTools}
                aria-label="群岛视角与背景"
              >
                <Tooltip title="缩小视角" placement="top">
                  <IslandButton
                    className={forest.iconButton}
                    aria-label="缩小视角"
                    disabled={!ready || failed}
                    onClick={() => zoom(-1)}
                  >
                    <MinusIcon size={16} />
                  </IslandButton>
                </Tooltip>
                <Tooltip title="放大视角" placement="top">
                  <IslandButton
                    className={forest.iconButton}
                    aria-label="放大视角"
                    disabled={!ready || failed}
                    onClick={() => zoom(1)}
                  >
                    <PlusIcon size={16} />
                  </IslandButton>
                </Tooltip>
                <Tooltip title="复位视角" placement="top">
                  <IslandButton
                    className={forest.iconButton}
                    aria-label="复位视角"
                    disabled={!ready || failed}
                    onClick={() => setResetKey((key) => key + 1)}
                  >
                    <RefreshIcon size={15} />
                  </IslandButton>
                </Tooltip>
                <Tooltip
                  title={
                    reducedMotion
                      ? "已遵循系统减少动态设置"
                      : backgroundMoving
                        ? "关闭背景动画"
                        : "开启背景动画"
                  }
                  placement="top-end"
                >
                  <IslandButton
                    className={forest.iconButton}
                    aria-label="背景动画"
                    aria-pressed={backgroundMoving && !reducedMotion}
                    disabled={reducedMotion}
                    onClick={() => setBackgroundMoving((moving) => !moving)}
                  >
                    <LeafIcon size={16} />
                  </IslandButton>
                </Tooltip>
              </fieldset>
            </section>

            <div className={styles.controls}>
              <IslandButton
                ref={chatButtonRef}
                variant="primary"
                type="button"
                className={styles.infoButton}
                onClick={openCharacterInfo}
                aria-expanded={chatOpen}
              >
                <ChatIcon size={15} aria-hidden="true" />
                与小屿聊聊
              </IslandButton>
              {ISLANDS.filter(
                (island) => island.enabled && island.id !== "home",
              ).map((island) => (
                <Link
                  key={island.id}
                  to={island.route}
                  preload={false}
                  className={styles.infoButton}
                >
                  {island.id === "mandala" ? (
                    <BookIcon size={19} />
                  ) : island.id === "mindfulness" ? (
                    <TreeIcon size={19} />
                  ) : (
                    <MountainIcon size={19} />
                  )}
                  {island.name}
                </Link>
              ))}
            </div>
          </main>
        </div>
      </div>
      <ArchipelagoMap
        compact={compact}
        open={mapOpen}
        onOpenChange={setMapOpen}
        onCloseFocus={() => {
          if (!mapSelected.current)
            mapButtonRef.current?.focus({ preventScroll: true })
        }}
        onSelect={(island) => {
          mapSelected.current = true
          setMapOpen(false)
          if (island.id === "home") openCharacterInfo()
          else enterIsland(island)
        }}
      />
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
            chatButtonRef.current?.focus()
          }}
        >
          <span className={styles.panelIcon}>
            <SailboatIcon size={29} aria-hidden="true" />
          </span>
          <Dialog.Title className={styles.panelTitle}>
            欢迎来到 Mind Island。
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            通过云桥连接的心屿与沙盒，点击小屿可以聊天，沙盒可以进入心理沙盘。
          </Dialog.Description>
          <IslandButton
            type="button"
            className={styles.infoButton}
            onClick={openCharacterInfo}
          >
            认识小屿
          </IslandButton>
          <Dialog.Close asChild>
            <IslandButton type="button" className={styles.panelDismiss}>
              关闭
            </IslandButton>
          </Dialog.Close>
          <Dialog.Close asChild>
            <IslandButton
              type="button"
              className={styles.panelClose}
              aria-label="关闭信息面板"
            >
              <CloseIcon size={18} aria-hidden="true" />
            </IslandButton>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
