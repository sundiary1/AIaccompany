import { useNavigate } from "@tanstack/react-router"
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react"
import { ErrorBoundary } from "react-error-boundary"
import { IslandButton } from "../IslandUI/IslandButton"
import { ArrowUpRightIcon, SailboatIcon } from "../IslandUI/island-icons"
import styles from "./landing.module.css"

const LandingScene = lazy(() =>
  import("./LandingScene").then((module) => ({ default: module.LandingScene })),
)

function subscribeVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify)
  return () => document.removeEventListener("visibilitychange", notify)
}
const isVisible = () => document.visibilityState === "visible"

function SceneUnavailable({ onFail }: { onFail: () => void }) {
  useEffect(onFail, [onFail])
  return null
}

export function LandingPage() {
  const navigate = useNavigate()
  const visible = useSyncExternalStore(
    subscribeVisibility,
    isVisible,
    () => true,
  )
  const [state, setState] = useState<"loading" | "ready" | "fallback">(
    "loading",
  )
  const ready = useCallback(() => setState("ready"), [])
  const failed = useCallback(() => setState("fallback"), [])
  const enter = () => void navigate({ to: "/island-preview" })
  const fallback = <SceneUnavailable onFail={failed} />

  return (
    <div className={styles.page} data-testid="landing-page" data-state={state}>
      <div className={styles.scene} data-testid="landing-scene">
        <picture className={styles.staticScene}>
          <source
            media="(max-aspect-ratio: 9/10)"
            srcSet={`${import.meta.env.BASE_URL}images/landing/shore-portrait.jpg`}
          />
          <img
            src={`${import.meta.env.BASE_URL}images/landing/shore-desktop.jpg`}
            alt="心屿浅水、芦苇和飞机遗迹的静态风景"
          />
        </picture>
        <ErrorBoundary fallback={fallback} onError={failed}>
          <Suspense fallback={null}>
            <LandingScene
              visible={visible}
              onReady={ready}
              fallback={fallback}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
      <div className={styles.readability} aria-hidden="true" />
      <header className={styles.header}>
        <div className={styles.brand} role="img" aria-label="心屿 Mind Island">
          <span className={styles.mark}>
            <SailboatIcon size={22} aria-hidden="true" />
          </span>
          <strong>心屿</strong>
          <span className={styles.englishBrand}>Mind Island</span>
        </div>
        <nav aria-label="入口导航">
          <IslandButton className={styles.enter} onClick={enter}>
            进入群岛 <ArrowUpRightIcon size={17} aria-hidden="true" />
          </IslandButton>
        </nav>
      </header>
      <main className={styles.content}>
        <div className={styles.copy}>
          <h1>
            让心，
            <br />
            轻轻靠岸。
          </h1>
          <p className={styles.subtitle}>一座可以慢慢探索的小小群岛。</p>
          <p className={styles.description}>
            在这里，你可以聊聊天、画点什么，
            <br className={styles.desktopBreak} />
            也可以什么都不做。
          </p>
          <IslandButton className={styles.explore} onClick={enter}>
            开始探索 <ArrowUpRightIcon size={20} aria-hidden="true" />
          </IslandButton>
        </div>
      </main>
      <div className={styles.status} role="status" aria-live="polite">
        {state === "loading" && "正在走近心屿…"}
        {state === "fallback" && "静态风景 · 仍可进入群岛"}
      </div>
    </div>
  )
}
