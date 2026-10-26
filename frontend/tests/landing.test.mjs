import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector3,
} from "three"
import {
  getLandingView,
  LANDING_MODEL_PATH,
  LANDING_WATER_LEVEL,
  LANDING_WATER_SIZE,
} from "../src/components/Landing/landing-world.ts"

const views = [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [390, 844],
  [375, 667],
  [1024, 768],
  [768, 1024],
]
const bytes = readFileSync(
  new URL(`../public/${LANDING_MODEL_PATH}`, import.meta.url),
)
const jsonSize = bytes.readUInt32LE(12)
const gltf = JSON.parse(bytes.toString("utf8", 20, 20 + jsonSize))

test("landing reuses the current, self-contained home asset", () => {
  assert.equal(bytes.toString("ascii", 0, 4), "glTF")
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  assert.equal(LANDING_MODEL_PATH, "models/islands/home-island.glb")
  assert.equal(gltf.materials.length, 11)
  assert.ok(gltf.images.every((image) => image.bufferView !== undefined))
})

test("the surrounding water covers every visible camera corner at required sizes", () => {
  for (const [width, height] of views) {
    const view = getLandingView(width, height)
    const camera = new PerspectiveCamera(view.fov, width / height, 0.1, 180)
    camera.position.set(...view.position)
    camera.lookAt(...view.target)
    camera.updateMatrixWorld(true)
    const raycaster = new Raycaster()
    for (const x of [-1, 0, 1]) {
      for (const y of [-1, 0, 1]) {
        raycaster.setFromCamera({ x, y }, camera)
        const { origin, direction } = raycaster.ray
        const distance = (LANDING_WATER_LEVEL - origin.y) / direction.y
        assert.ok(distance > 0 && distance < camera.far, `${width}x${height}`)
        const point = raycaster.ray.at(distance, new Vector3())
        assert.ok(Math.abs(point.x) < LANDING_WATER_SIZE / 2)
        assert.ok(Math.abs(point.z) < LANDING_WATER_SIZE / 2)
      }
    }
  }
})

test("the existing square foundation perimeter stays submerged", () => {
  let edgeVertices = 0
  const walk = (index, parent = new Matrix4()) => {
    const node = gltf.nodes[index]
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3(...(node.translation ?? [0, 0, 0])),
          new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
          new Vector3(...(node.scale ?? [1, 1, 1])),
        )
    const matrix = parent.clone().multiply(local)
    if (node.mesh !== undefined) {
      for (const primitive of gltf.meshes[node.mesh].primitives) {
        if (
          !["ground", "ground2"].includes(
            gltf.materials[primitive.material].name,
          )
        )
          continue
        const accessor = gltf.accessors[primitive.attributes.POSITION]
        const buffer = gltf.bufferViews[accessor.bufferView]
        for (let i = 0; i < accessor.count; i++) {
          const at =
            28 +
            jsonSize +
            (buffer.byteOffset ?? 0) +
            (accessor.byteOffset ?? 0) +
            i * (buffer.byteStride ?? 12)
          const point = new Vector3(
            bytes.readFloatLE(at),
            bytes.readFloatLE(at + 4),
            bytes.readFloatLE(at + 8),
          ).applyMatrix4(matrix)
          if (Math.abs(point.x) > 3.9 || Math.abs(point.z) > 3.9) {
            edgeVertices++
            assert.ok(
              point.y < LANDING_WATER_LEVEL,
              "square perimeter would be exposed",
            )
          }
        }
      }
    }
    for (const child of node.children ?? []) walk(child, matrix)
  }
  for (const node of gltf.scenes[gltf.scene ?? 0].nodes) walk(node)
  assert.ok(edgeVertices > 0)
})

test("camera presets remain perspective views from the same side of the shore", () => {
  for (const [width, height] of views) {
    const { position, target, fov } = getLandingView(width, height)
    assert.ok(position.every(Number.isFinite) && target.every(Number.isFinite))
    assert.ok(position[0] > target[0] && position[2] > target[2])
    assert.ok(position[1] > LANDING_WATER_LEVEL)
    assert.ok(fov >= 35 && fov <= 45)
  }
})

test("both static fallbacks are real JPEG files", () => {
  for (const view of ["desktop", "portrait"]) {
    const image = readFileSync(
      new URL(`../public/images/landing/shore-${view}.jpg`, import.meta.url),
    )
    assert.equal(image.readUInt16BE(0), 0xffd8)
    assert.ok(image.length > 10000)
  }
})
