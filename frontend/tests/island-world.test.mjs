import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { Euler, Vector3 } from "three"
import {
  CLOUD_BRIDGE,
  COMPANION_SPAWN,
  getCloudBridges,
  getIslandDefinitions,
  ISLANDS,
  SANDPLAY_ENTRY,
  toWorldPoint,
  WALK_AREAS,
} from "../src/components/IslandPreview/island-world.ts"

function asset(island) {
  const bytes = readFileSync(
    new URL(`../public/${island.modelPath}`, import.meta.url),
  )
  assert.equal(bytes.toString("ascii", 0, 4), "glTF")
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  return JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)))
}

test("configured GLBs retain terrain and materials without preview cameras/lights", () => {
  assert.equal(new Set(ISLANDS.map((i) => i.id)).size, 4)
  for (const island of ISLANDS) {
    const gltf = asset(island)
    assert.ok(
      gltf.nodes.some((n) => n.extras?.source_name === island.terrainNode),
    )
    assert.ok(gltf.materials.length > 1)
    assert.ok(!gltf.cameras?.length)
    assert.ok(!gltf.extensions?.KHR_lights_punctual)
    assert.ok(
      gltf.meshes.every((m) =>
        m.primitives.every((p) => p.material !== undefined),
      ),
    )
  }
})

test("future coordinate transforms match Three.js XYZ Euler order", () => {
  const definition = { ...ISLANDS[0], rotation: [0.3, 0.7, -0.4], scale: 1.7 }
  const point = [1, 2, 3]
  const expected = new Vector3(...point)
    .multiplyScalar(definition.scale)
    .applyEuler(new Euler(...definition.rotation))
    .add(new Vector3(...definition.position))
  assert.ok(
    expected.distanceTo(new Vector3(...toWorldPoint(definition, point))) <
      1e-10,
  )
})

test("bridge endpoints and future destinations reference real, separated islands", () => {
  const home = ISLANDS.find((i) => i.id === COMPANION_SPAWN.islandId)
  const sand = ISLANDS.find((i) => i.id === SANDPLAY_ENTRY.islandId)
  assert.ok(home.position[0] + 4 < sand.position[0] - 4)
  assert.deepEqual(CLOUD_BRIDGE.waypoints[0], toWorldPoint(home, [4, 1.05, 0]))
  assert.deepEqual(
    CLOUD_BRIDGE.waypoints.at(-1),
    toWorldPoint(sand, [-4, 1.2, 0]),
  )
  assert.ok(CLOUD_BRIDGE.width >= 1.5)
  assert.equal(CLOUD_BRIDGE.clouds.length, 3)
  for (const area of WALK_AREAS) {
    assert.ok(
      ISLANDS.some(
        (i) => i.id === area.islandId && i.terrainNode === area.surfaceNode,
      ),
    )
    assert.ok(area.outlineXZ.length >= 3)
  }
})

test("T layout and compact branch retain separated islands and three cloud connections", () => {
  assert.equal(
    new Set(
      getIslandDefinitions()
        .filter((island) => island.id !== "mindfulness")
        .map((island) => island.position[2]),
    ).size,
    1,
  )
  for (const compact of [false, true]) {
    const islands = getIslandDefinitions(compact)
    for (let a = 0; a < islands.length; a++)
      for (let b = a + 1; b < islands.length; b++) {
        assert.ok(
          Math.abs(islands[a].position[0] - islands[b].position[0]) >
            4 * (islands[a].scale + islands[b].scale) ||
            Math.abs(islands[a].position[2] - islands[b].position[2]) >
              4 * (islands[a].scale + islands[b].scale),
        )
      }
    const bridges = getCloudBridges(compact)
    assert.deepEqual(
      bridges.map((bridge) => bridge.to),
      ["sandplay", "mandala", "mindfulness"],
    )
    for (const bridge of bridges) {
      assert.equal(bridge.clouds.length, 3)
      assert.equal(bridge.waypoints.length, 5)
      for (const point of bridge.clouds) assert.ok(point.every(Number.isFinite))
    }
  }
  assert.deepEqual(ISLANDS[0].position, [-5.8, 0, -1.8])
})
