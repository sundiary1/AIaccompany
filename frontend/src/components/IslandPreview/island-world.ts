export type WorldPoint = [number, number, number]
export type IslandDefinition = {
  id: "home" | "sandplay" | "mandala" | "mindfulness"
  name: string
  description: string
  route: "/island-preview" | "/sandplay" | "/mandala" | "/mindfulness"
  modelPath: string
  position: WorldPoint
  rotation: WorldPoint
  scale: number
  enabled: boolean
  terrainNode: string
  labelPosition: WorldPoint
  hitArea: { position: WorldPoint; size: WorldPoint }
}

/** All coordinates are metres, Y-up. Source .blend assets remain Z-up. */
export const ISLANDS: readonly IslandDefinition[] = [
  {
    id: "home",
    name: "心屿",
    description: "小屿在这里，陪你慢慢聊。",
    route: "/island-preview",
    modelPath: "models/islands/home-island.glb",
    position: [-5.8, 0, -1.8],
    rotation: [0, 0, 0],
    scale: 1,
    enabled: true,
    terrainNode: "ground",
    labelPosition: [0, 0.2, 4.25],
    hitArea: { position: [0, 0.7, 0], size: [7.9, 1.8, 7.9] },
  },
  {
    id: "sandplay",
    name: "沙盒 · 心理沙盘",
    description: "在沙盘中自由摆放心里的故事",
    route: "/sandplay",
    modelPath: "models/islands/sandplay-island.glb",
    position: [5.4, 0, -1.8],
    rotation: [0, 0, 0],
    scale: 1,
    enabled: true,
    terrainNode: "Grass",
    labelPosition: [0, -0.05, 4.35],
    hitArea: { position: [0, 1.5, 0], size: [7.9, 3.5, 7.9] },
  },
  {
    id: "mandala",
    name: "书屋 · 曼陀罗绘画",
    description: "让颜色和线条，慢慢展开",
    route: "/mandala",
    modelPath: "models/islands/mandala-island.glb",
    position: [-16.6, 0, -1.8],
    rotation: [0, 0, 0],
    scale: 0.85,
    enabled: true,
    terrainNode: "Terrain",
    labelPosition: [0, -0.05, 4.5],
    hitArea: { position: [0, 2.2, 0], size: [7.9, 8.6, 7.9] },
  },
  {
    id: "mindfulness",
    name: "雨林 · 正念",
    description: "在自然的声音里，停留片刻",
    route: "/mindfulness",
    modelPath: "models/mindfulness/beach-island.glb",
    position: [-5.8, 0, -13],
    rotation: [0, 0, 0],
    scale: 1,
    enabled: true,
    terrainNode: "Ground",
    labelPosition: [0, -0.05, 4.4],
    hitArea: { position: [0, 1.5, 0], size: [7.9, 5.4, 7.9] },
  },
]

/** Desktop forms a T; portrait keeps the original column with a lateral branch. */
export function getIslandDefinitions(compact = false): IslandDefinition[] {
  return ISLANDS.filter((island) => island.enabled).map((island) => ({
    ...island,
    labelPosition:
      compact && island.id === "mindfulness"
        ? [0, -0.05, 0]
        : island.labelPosition,
    position: compact
      ? (
          {
            home: [-5.8, 0, -1.8],
            sandplay: [4.5, 0, 3.08],
            mandala: [-16.1, 0, -6.68],
            mindfulness: [-10.8, 0, 8.2],
          } satisfies Record<IslandDefinition["id"], WorldPoint>
        )[island.id]
      : island.position,
  }))
}

// Deliberately independent from visual decoration meshes. These are initial
// safe patches, not a complete navmesh or a promise of traversable terrain.
export const WALK_AREAS = [
  {
    islandId: "home",
    surfaceNode: "ground",
    outlineXZ: [
      [0.9, 3.05],
      [2.2, 2.7],
      [1.8, 1.8],
      [0.9, 1.85],
    ],
    heightSource: "terrain-ray",
  },
  {
    islandId: "sandplay",
    surfaceNode: "Grass",
    outlineXZ: [
      [-3.25, -1.65],
      [-1.6, -1.65],
      [-1.6, -1.05],
      [-3.25, -1.05],
    ],
    heightSource: "terrain-ray",
  },
] as const

export const COMPANION_SPAWN = {
  islandId: "home" as const,
  localPosition: [1.5, 1.20003, 2] as WorldPoint,
}
export const SANDPLAY_ENTRY = {
  islandId: "sandplay" as const,
  localPosition: [-2.2, 0.65, -1.4] as WorldPoint,
}

/** Current assets have no rotation; reserve a transform-aware interface. */
export function toWorldPoint(
  island: IslandDefinition,
  point: WorldPoint,
): WorldPoint {
  const [x, y, z] = point.map((value) => value * island.scale)
  const [rx, ry, rz] = island.rotation
  const x1 = x * Math.cos(rz) - y * Math.sin(rz)
  const y1 = x * Math.sin(rz) + y * Math.cos(rz)
  const x2 = x1 * Math.cos(ry) + z * Math.sin(ry)
  const z2 = -x1 * Math.sin(ry) + z * Math.cos(ry)
  return [
    island.position[0] + x2,
    island.position[1] + y1 * Math.cos(rx) - z2 * Math.sin(rx),
    island.position[2] + y1 * Math.sin(rx) + z2 * Math.cos(rx),
  ]
}

export function getCloudBridges(compact = false) {
  const definitions = getIslandDefinitions(compact)
  const home = definitions.find((island) => island.id === "home")!
  return (["sandplay", "mandala", "mindfulness"] as const).map((id) => {
    const other = definitions.find((island) => island.id === id)!
    const direction = id === "sandplay" ? 1 : -1
    const z = compact ? 1.8 : 0
    const start = toWorldPoint(
      home,
      id === "mindfulness"
        ? compact
          ? [-1.75, 1.05, 3.5]
          : [0, 1.05, -4]
        : [direction * 4, 1.05, direction * z],
    )
    const end = toWorldPoint(
      other,
      id === "mindfulness"
        ? compact
          ? [1.75, 1.05, -3.5]
          : [0, 1.05, 4]
        : [-direction * 4, 1.2, -direction * z],
    )
    const clouds = [0.2, 0.5, 0.8].map(
      (t) =>
        start.map(
          (value, axis) => value + (end[axis] - value) * t,
        ) as WorldPoint,
    )
    return {
      id: `home-${id}`,
      from: "home",
      to: id,
      width: 1.65,
      clouds,
      waypoints: [start, ...clouds, end],
    }
  })
}
export type CloudConnection = ReturnType<typeof getCloudBridges>[number]
export const CLOUD_BRIDGE = getCloudBridges()[0]
