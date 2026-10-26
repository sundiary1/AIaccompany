import { Tooltip } from "animal-island-ui"
import { Hand } from "lucide-react"
import { lazy, Suspense, useCallback, useState } from "react"
import { ErrorBoundary } from "react-error-boundary"
import { IslandButton } from "../IslandUI/IslandButton"
import { RefreshIcon, TreeIcon } from "../IslandUI/island-icons"
import { PageHeader } from "../IslandUI/PageHeader"
import { MindfulnessPlayer } from "./MindfulnessPlayer"
import styles from "./mindfulness.module.css"
import { mindfulnessTracks } from "./mindfulnessTracks"
import { useAudioController } from "./useAudioController"
import { useSceneEnvironment } from "./useSceneEnvironment"

const RainforestScene = lazy(() => import("./RainforestScene"))

function SceneFallback({ retry }: { retry: () => void }) {
  return (
    <div className={styles.fallback} role="status">
      <img
        src={`${import.meta.env.BASE_URL}models/mindfulness/rainforest-preview.png`}
        alt="棕榈林与溪水环绕的正念小岛静态预览"
      />
      <p>三维显示暂不可用，音频仍可正常使用。</p>
      <IslandButton onClick={retry}>
        <RefreshIcon size={15} />
        重试三维显示
      </IslandButton>
    </div>
  )
}

export function RainforestPage() {
  const audio = useAudioController(mindfulnessTracks)
  const environment = useSceneEnvironment()
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  return (
    <div
      className={styles.page}
      data-testid="mindfulness-page"
      data-reduced-motion={environment.reducedMotion}
    >
      <PageHeader
        title="雨林 · 正念"
        shortTitle="正念"
        icon={<TreeIcon size={19} />}
      />
      <main className={styles.main}>
        <div className={styles.layout}>
          <section className={styles.sceneSection} aria-label="互动雨林">
            <div
              className={styles.scene}
              data-testid="rainforest-stage"
              data-state={ready ? "ready" : "loading"}
            >
              <ErrorBoundary
                onReset={() => setReady(false)}
                fallbackRender={({ resetErrorBoundary }) => (
                  <SceneFallback
                    retry={() => {
                      void import("./RainforestScene")
                        .then((module) => {
                          module.clearRainforestCache()
                          resetErrorBoundary()
                        })
                        .catch(() => resetErrorBoundary())
                    }}
                  />
                )}
              >
                <Suspense
                  fallback={
                    <span className={styles.loading}>正在走进雨林…</span>
                  }
                >
                  <RainforestScene
                    {...environment}
                    playing={audio.state.status === "playing"}
                    onReady={onReady}
                  />
                  {!ready && (
                    <span className={styles.loading}>正在走进雨林…</span>
                  )}
                </Suspense>
              </ErrorBoundary>
            </div>
            <Tooltip title="轻按模型感受回弹；拖动空白处旋转，滚轮或双指缩放。">
              <p className={styles.sceneHint}>
                <Hand size={15} />
                轻轻碰一下，雨林会回应你。
              </p>
            </Tooltip>
          </section>
          <section className={styles.playerSection} aria-label="正念音频播放器">
            <MindfulnessPlayer audio={audio} tracks={mindfulnessTracks} />
          </section>
        </div>
      </main>
      {/* biome-ignore lint/a11y/useMediaCaption: Audio-only player; no supplied tracks or transcripts yet. */}
      <audio ref={audio.audioRef} preload="metadata" aria-label="正念音频" />
    </div>
  )
}
