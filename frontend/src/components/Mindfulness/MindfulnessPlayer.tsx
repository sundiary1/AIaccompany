import { Card, Switch, Tooltip } from "animal-island-ui"
import {
  ListMusic,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react"
import { useState } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import { formatMediaTime } from "./AudioController"
import styles from "./mindfulness.module.css"
import type { MindfulnessTrack } from "./mindfulnessTracks"
import { TrackList } from "./TrackList"
import type { useAudioController } from "./useAudioController"

export function MindfulnessPlayer({
  audio,
  tracks,
}: {
  audio: ReturnType<typeof useAudioController>
  tracks: readonly MindfulnessTrack[]
}) {
  const { state, controller } = audio
  const [listOpen, setListOpen] = useState(false)
  const track = tracks.find((item) => item.id === state.trackId)
  const playing = state.playing
  const index = tracks.findIndex((item) => item.id === state.trackId)
  const hasAudio = !!track
  const seekable = hasAudio && state.duration > 0
  return (
    <>
      <Card className={styles.player}>
        <div className={styles.playerTop}>
          <span className={styles.eyebrow}>停留片刻</span>
          <Tooltip title="音频列表">
            <IslandButton
              aria-label="音频列表"
              onClick={() => setListOpen(true)}
            >
              <ListMusic size={21} />
            </IslandButton>
          </Tooltip>
        </div>
        <div
          className={styles.soundMark}
          aria-hidden="true"
          data-playing={state.status === "playing"}
        >
          <svg viewBox="0 0 160 160" focusable="false" aria-hidden="true">
            <circle
              cx="80"
              cy="80"
              r="67"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity=".25"
            />
            <circle
              cx="80"
              cy="80"
              r="51"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              opacity=".3"
            />
            <path
              d="M80 119C46 101 39 58 90 39c20 31 19 55-10 80Z"
              fill="#bfd5b6"
            />
            <path
              d="M79 119c-5-23-1-44 11-63m-10 43L60 80m21 9 18-16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2>{track?.title ?? "音频即将添加"}</h2>
        <p className={styles.trackDescription}>
          {track?.description ?? "在这里，留一点时间给自己。"}
        </p>
        <div className={styles.timeline}>
          <input
            type="range"
            min={0}
            max={state.duration || 1}
            step={0.1}
            value={state.currentTime}
            aria-label="播放进度"
            aria-valuetext={
              seekable
                ? `${formatMediaTime(state.currentTime)}，共 ${formatMediaTime(state.duration)}`
                : "暂无音频"
            }
            disabled={!seekable}
            onChange={(event) => controller.seek(Number(event.target.value))}
          />
          <div className={styles.times}>
            <span>
              {hasAudio ? formatMediaTime(state.currentTime) : "--:--"}
            </span>
            <span>
              {state.duration ? formatMediaTime(state.duration) : "--:--"}
            </span>
          </div>
        </div>
        <div className={styles.transport}>
          <IslandButton
            aria-label="上一首"
            disabled={tracks.length < 2 || index <= 0}
            onClick={() => controller.select(tracks[index - 1])}
          >
            <SkipBack size={18} />
          </IslandButton>
          <IslandButton
            aria-label="后退15秒"
            disabled={!seekable}
            onClick={() => controller.skip(-15)}
          >
            <RotateCcw size={22} />
            <small>15</small>
          </IslandButton>
          <IslandButton
            className={styles.play}
            variant="primary"
            aria-label={
              playing ? "暂停" : state.status === "ended" ? "重新播放" : "播放"
            }
            disabled={!hasAudio}
            onClick={() =>
              playing ? controller.pause() : void controller.play()
            }
          >
            {playing ? (
              <Pause size={29} fill="currentColor" />
            ) : (
              <Play size={29} fill="currentColor" />
            )}
          </IslandButton>
          <IslandButton
            aria-label="前进15秒"
            disabled={!seekable}
            onClick={() => controller.skip(15)}
          >
            <RotateCw size={22} />
            <small>15</small>
          </IslandButton>
          <IslandButton
            aria-label="下一首"
            disabled={tracks.length < 2 || index >= tracks.length - 1}
            onClick={() => controller.select(tracks[index + 1])}
          >
            <SkipForward size={18} />
          </IslandButton>
        </div>
        <div className={styles.playStatus} role="status" aria-live="polite">
          {state.status === "loading" && (
            <>
              <LoaderCircle size={13} /> 正在加载音频
            </>
          )}
          {state.status === "ended" && "这一段，听完了。"}
          {state.error && <span role="alert">{state.error}</span>}
        </div>
        <div className={styles.volume}>
          <IslandButton
            aria-label={state.muted ? "取消静音" : "静音"}
            onClick={() => controller.setMuted(!state.muted)}
          >
            {state.muted || state.volume === 0 ? (
              <VolumeX size={19} />
            ) : (
              <Volume2 size={19} />
            )}
          </IslandButton>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.volume}
            aria-label="音量"
            onChange={(event) =>
              controller.setVolume(Number(event.target.value))
            }
          />
          <output>{Math.round(state.volume * 100)}%</output>
        </div>
        <div className={styles.loop}>
          <span>单曲循环</span>
          <Switch
            checked={state.loop}
            aria-label="单曲循环"
            onChange={(loop) => controller.setLoop(loop)}
          />
        </div>
      </Card>
      <TrackList
        open={listOpen}
        onClose={() => setListOpen(false)}
        tracks={tracks}
        selectedId={state.trackId}
        onSelect={(next) => controller.select(next)}
      />
    </>
  )
}
