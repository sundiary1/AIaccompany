import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  AudioController,
  clampTime,
  formatMediaTime,
} from "../src/components/Mindfulness/AudioController.ts"
import {
  advanceSpring,
  JELLY_CONFIG,
  pressSpring,
  spring,
} from "../src/components/Mindfulness/jelly-spring.ts"
import { mindfulnessTracks } from "../src/components/Mindfulness/mindfulnessTracks.ts"

class Media extends EventTarget {
  src = ""
  currentTime = 0
  duration = Number.NaN
  paused = true
  ended = false
  volume = 1
  muted = false
  loop = false
  loads = 0
  plays = 0
  failure = null
  load() {
    this.loads++
  }
  removeAttribute(name) {
    if (name === "src") this.src = ""
  }
  pause() {
    this.paused = true
    this.dispatchEvent(new Event("pause"))
  }
  async play() {
    this.plays++
    if (this.failure) throw this.failure
    this.paused = false
    this.dispatchEvent(new Event("playing"))
  }
  metadata(duration = 40) {
    this.duration = duration
    this.dispatchEvent(new Event("loadedmetadata"))
  }
}
const tracks = [
  { id: "test1", title: "Test only", category: "nature", src: "/test1.wav" },
  { id: "test2", title: "Test only 2", category: "guided", src: "/test2.wav" },
]

function setup() {
  const controller = new AudioController()
  const media = new Media()
  controller.attach(media)
  return { controller, media }
}

test("empty production catalog never selects or plays a nonexistent source", async () => {
  assert.equal(mindfulnessTracks.length, 0)
  const { controller, media } = setup()
  await controller.play()
  assert.equal(media.src, "")
  assert.equal(media.loads, 0)
  assert.equal(media.plays, 0)
  assert.equal(controller.getSnapshot().status, "idle")
})
test("metadata and time events drive actual media state, play/pause and clamped seek", async () => {
  const { controller, media } = setup()
  controller.select(tracks[0])
  assert.equal(media.plays, 0)
  assert.equal(controller.getSnapshot().duration, 0)
  media.metadata()
  await controller.play()
  assert.equal(controller.getSnapshot().status, "playing")
  controller.skip(15)
  assert.equal(media.currentTime, 15)
  controller.skip(300)
  assert.equal(media.currentTime, 40)
  controller.skip(-300)
  assert.equal(media.currentTime, 0)
  media.currentTime = 18.2
  media.dispatchEvent(new Event("timeupdate"))
  assert.equal(controller.getSnapshot().currentTime, 18.2)
  controller.pause()
  assert.equal(media.paused, true)
  assert.equal(controller.getSnapshot().status, "paused")
})
test("track switch pauses old media without autoplay; detach clears source and listeners", async () => {
  const { controller, media } = setup()
  controller.select(tracks[0])
  media.metadata()
  await controller.play()
  controller.setVolume(0.3)
  controller.setMuted(true)
  controller.setLoop(true)
  controller.select(tracks[1])
  assert.equal(media.paused, true)
  assert.equal(media.src, tracks[1].src)
  assert.equal(media.plays, 1)
  assert.equal(controller.getSnapshot().duration, 0)
  assert.equal(media.loop, true)
  assert.equal(media.muted, true)
  assert.equal(media.volume, 0.3)
  controller.detach()
  assert.equal(media.src, "")
  const old = controller.getSnapshot()
  media.metadata(80)
  assert.equal(controller.getSnapshot(), old)
  controller.attach(media)
  media.metadata()
  assert.equal(media.src, tracks[1].src)
  assert.equal(media.plays, 1)
})
test("media failures and autoplay restrictions have explicit recoverable errors", async () => {
  const { controller, media } = setup()
  controller.select(tracks[0])
  media.failure = new DOMException("private diagnostic", "NotAllowedError")
  await controller.play()
  assert.match(controller.getSnapshot().error, /再次点击/)
  assert.ok(!controller.getSnapshot().error.includes("private"))
  media.failure = null
  media.metadata()
  await controller.play()
  assert.equal(controller.getSnapshot().error, null)
  media.dispatchEvent(new Event("error"))
  assert.equal(controller.getSnapshot().status, "error")
  assert.match(controller.getSnapshot().error, /加载失败/)
})
test("stale play rejection cannot overwrite new selection", async () => {
  const { controller, media } = setup()
  let reject
  media.play = () =>
    new Promise((_, fail) => {
      reject = fail
    })
  controller.select(tracks[0])
  const attempt = controller.play()
  controller.select(tracks[1])
  reject(new Error("old request"))
  await attempt
  assert.equal(controller.getSnapshot().error, null)
  assert.equal(controller.getSnapshot().trackId, "test2")
})
test("ended state replays from zero; unknown duration is not fabricated", async () => {
  const { controller, media } = setup()
  controller.select(tracks[0])
  media.metadata()
  media.currentTime = 40
  media.ended = true
  media.dispatchEvent(new Event("ended"))
  assert.equal(controller.getSnapshot().status, "ended")
  controller.seek(12)
  assert.equal(controller.getSnapshot().status, "paused")
  assert.equal(media.currentTime, 12)
  media.currentTime = 40
  media.dispatchEvent(new Event("ended"))
  await controller.play()
  assert.equal(media.currentTime, 0)
  media.metadata(Number.POSITIVE_INFINITY)
  assert.equal(controller.getSnapshot().duration, 0)
  assert.equal(clampTime(Number.NaN, 20), 0)
  assert.equal(formatMediaTime(Number.NaN), "--:--")
  assert.equal(formatMediaTime(89), "1:29")
})
test("buffering preserves pause control and cancellation returns to paused", async () => {
  const { controller, media } = setup()
  controller.select(tracks[0])
  media.metadata()
  await controller.play()
  media.dispatchEvent(new Event("waiting"))
  assert.equal(controller.getSnapshot().status, "loading")
  assert.equal(controller.getSnapshot().playing, true)
  controller.pause()
  assert.equal(controller.getSnapshot().playing, false)
  assert.equal(controller.getSnapshot().status, "paused")
})
test("spring oscillates, settles and remains bounded during repeated presses", () => {
  const state = spring()
  pressSpring(state)
  let crossings = 0,
    last = state.value
  for (let i = 0; i < 900; i++) {
    advanceSpring(state, 0, 1 / 120)
    if (last * state.value < 0) crossings++
    last = state.value
  }
  assert.ok(crossings >= 2)
  assert.equal(state.value, 0)
  assert.equal(state.velocity, 0)
  for (let i = 0; i < 2000; i++) {
    pressSpring(state)
    advanceSpring(state, 0, 0.2)
    assert.ok(Math.abs(state.value) <= JELLY_CONFIG.maxDisplacement)
    assert.ok(Number.isFinite(state.velocity))
  }
})
test("fixed spring substeps agree across 30, 60 and 120 Hz", () => {
  const values = [30, 60, 120].map((fps) => {
    const state = spring()
    pressSpring(state)
    for (let i = 0; i < fps; i++) advanceSpring(state, 0, 1 / fps)
    return state.value
  })
  assert.ok(Math.max(...values) - Math.min(...values) < 0.002)
})
test("optimized rainforest exports carry material-safe part categories and no cameras/lights", () => {
  const bytes = readFileSync(
    new URL("../public/models/mindfulness/rainforest.glb", import.meta.url),
  )
  const gltf = JSON.parse(
    bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)),
  )
  const kinds = new Set(
    gltf.nodes.map((node) => node.extras?.jelly_kind).filter(Boolean),
  )
  for (const kind of ["foliage", "trunk", "terrain", "rock", "water"])
    assert.ok(kinds.has(kind))
  assert.ok(!gltf.cameras?.length)
  assert.ok(!gltf.extensions?.KHR_lights_punctual)
  assert.ok(bytes.length < 3 * 1024 * 1024)
  assert.ok(
    gltf.meshes.every((mesh) =>
      mesh.primitives.every((p) => p.material !== undefined),
    ),
  )
})
