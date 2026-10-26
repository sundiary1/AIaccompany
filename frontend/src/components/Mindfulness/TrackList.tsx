import { Modal, Tabs } from "animal-island-ui"
import { Check, Music2 } from "lucide-react"
import { IslandButton } from "../IslandUI/IslandButton"
import styles from "./mindfulness.module.css"
import type { MindfulnessTrack } from "./mindfulnessTracks"

export function TrackList({
  open,
  onClose,
  tracks,
  selectedId,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  tracks: readonly MindfulnessTrack[]
  selectedId: string | null
  onSelect: (track: MindfulnessTrack) => void
}) {
  const list = (category?: MindfulnessTrack["category"]) => {
    const filtered = tracks.filter(
      (track) => !category || track.category === category,
    )
    return filtered.length ? (
      <div className={styles.trackList}>
        {filtered.map((track) => (
          <IslandButton
            key={track.id}
            block
            aria-pressed={track.id === selectedId}
            className={styles.track}
            onClick={() => {
              onSelect(track)
              onClose()
            }}
          >
            <Music2 size={19} />
            <span>
              <strong>{track.title}</strong>
              {track.description && <small>{track.description}</small>}
            </span>
            {track.id === selectedId && <Check size={17} />}
          </IslandButton>
        ))}
      </div>
    ) : (
      <p className={styles.emptyList}>音频即将添加</p>
    )
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="音频列表"
      width={480}
      footer={null}
      typewriter={false}
    >
      <Tabs
        aria-label="音频分类"
        items={[
          { key: "all", label: "全部", children: list() },
          { key: "guided", label: "引导练习", children: list("guided") },
          { key: "nature", label: "自然声音", children: list("nature") },
        ]}
      />
    </Modal>
  )
}
