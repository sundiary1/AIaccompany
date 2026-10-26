import * as Dialog from "@radix-ui/react-dialog"
import { Card, Title } from "animal-island-ui"
import { ArrowUpRight, BookOpen, Trees, Waves, X } from "lucide-react"
import { useMemo } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import styles from "./forest-experiment.module.css"
import { getIslandDefinitions, type IslandDefinition } from "./island-world"

function layoutMarkers(compact: boolean) {
  const islands = getIslandDefinitions(compact)
  const minX = Math.min(...islands.map((island) => island.position[0]))
  const maxX = Math.max(...islands.map((island) => island.position[0]))
  const minZ = Math.min(...islands.map((island) => island.position[2]))
  const maxZ = Math.max(...islands.map((island) => island.position[2]))
  return islands.map((island) => ({
    island,
    x: 80 + ((island.position[0] - minX) / (maxX - minX || 1)) * 240,
    y:
      maxZ === minZ
        ? 120
        : 70 + ((island.position[2] - minZ) / (maxZ - minZ)) * 90,
  }))
}

export function ArchipelagoMap({
  compact,
  open,
  onOpenChange,
  onSelect,
  onCloseFocus,
}: {
  compact: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (island: IslandDefinition) => void
  onCloseFocus: () => void
}) {
  const markers = useMemo(() => layoutMarkers(compact), [compact])
  const islands = markers.map(({ island }) => island)
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.mapOverlay} />
        <Dialog.Content
          className={styles.mapPanel}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            onCloseFocus()
          }}
        >
          <header className={styles.mapHeader}>
            <Dialog.Title className={styles.mapTitle}>
              <Title size="middle" variant="layer" color="default">
                群岛地图
              </Title>
            </Dialog.Title>
            <Dialog.Close asChild>
              <IslandButton
                className={styles.iconButton}
                aria-label="关闭群岛地图"
              >
                <X size={19} />
              </IslandButton>
            </Dialog.Close>
          </header>
          <Dialog.Description className={styles.mapDescription}>
            云雾之间，选一座岛靠岸。
          </Dialog.Description>
          <Card className={styles.mapSketch}>
            <svg viewBox="0 0 400 240" aria-hidden="true" focusable="false">
              {markers
                .filter(({ island }) => island.id !== "home")
                .map((marker) => {
                  const home = markers.find(
                    ({ island }) => island.id === "home",
                  )!
                  return (
                    <path
                      key={marker.island.id}
                      d={`M${home.x} ${home.y} L${marker.x} ${marker.y}`}
                      fill="none"
                      stroke="#a7beac"
                      strokeWidth="2"
                      strokeDasharray="3 9"
                    />
                  )
                })}
              {markers.map(({ island, x, y }) => (
                <g key={island.id} transform={`translate(${x} ${y})`}>
                  <ellipse rx="37" ry="23" fill="#e0eddd" />
                  <ellipse cy="6" rx="28" ry="15" fill="#cadcc4" opacity=".6" />
                  <path
                    d="M-13-3Q-4-21 4-11Q19-23 23-7Q39-1 21 5H-17Q-29 3-24-5Q-21-14-13-3Z"
                    fill="white"
                  />
                </g>
              ))}
            </svg>
            {markers.map(({ island, x, y }) => (
              <IslandButton
                key={island.id}
                className={styles.mapMarker}
                style={{ left: `${x / 4}%`, top: `${y / 2.4}%` }}
                aria-label={`前往${island.name}`}
                onClick={() => onSelect(island)}
              >
                {island.id === "home" ? (
                  <Waves size={19} />
                ) : island.id === "mandala" ? (
                  <BookOpen size={19} />
                ) : (
                  <Trees size={19} />
                )}
              </IslandButton>
            ))}
          </Card>
          <div className={styles.mapList}>
            {islands.map((island) => (
              <IslandButton
                key={island.id}
                block
                className={styles.mapLink}
                onClick={() => onSelect(island)}
              >
                <span className={styles.mapIcon}>
                  {island.id === "home" ? (
                    <Waves size={21} />
                  ) : island.id === "mandala" ? (
                    <BookOpen size={21} />
                  ) : (
                    <Trees size={21} />
                  )}
                </span>
                <span className={styles.mapLinkText}>
                  <strong>{island.name}</strong>
                  <small>{island.description}</small>
                </span>
                <ArrowUpRight size={17} />
              </IslandButton>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
