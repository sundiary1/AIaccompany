/** Module-scoped adapter for V15. No eval, window.serialize, or AI traffic. */
const CHANNEL = "mind-island:sandplay-v15"
const FLYING = new Set(["bird", "cloud", "butterfly", "plane", "balloon"])
const MAX_BYTES = 131072
const plain = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const keys = (value, allowed) =>
  plain(value) && Object.keys(value).every((key) => allowed.includes(key))
const number = (value, min, max) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max

export function validateScene(scene, types) {
  if (
    !keys(scene, ["version", "theme", "tray", "objects"]) ||
    scene.version !== 6 ||
    !["meadow", "sand"].includes(scene.theme) ||
    !keys(scene.tray, ["width", "depth"]) ||
    !number(scene.tray.width, 10.5, 24) ||
    !number(scene.tray.depth, 7.5, 18) ||
    !Array.isArray(scene.objects) ||
    scene.objects.length > 300 ||
    new TextEncoder().encode(JSON.stringify(scene)).length > MAX_BYTES
  )
    throw new Error("invalid_scene")
  for (const item of scene.objects) {
    if (
      !keys(item, ["type", "x", "y", "z", "rotation", "scale"]) ||
      !types.has(item.type) ||
      !number(item.x, -scene.tray.width / 2, scene.tray.width / 2) ||
      !number(item.z, -scene.tray.depth / 2, scene.tray.depth / 2) ||
      !number(item.y, 0, FLYING.has(item.type) ? 3 : 0) ||
      !number(item.rotation, -10000, 10000) ||
      !number(item.scale, 0.45, 1.9)
    )
      throw new Error("invalid_scene")
  }
  return scene
}

/** Explicit import only. Match V15's old array/object, snow and numeric rules. */
export function normalizeLegacy(data, types) {
  const finite = (value, fallback) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
  const tray = {
    width: clamp(finite(data?.tray?.width, 15.75), 10.5, 24),
    depth: clamp(finite(data?.tray?.depth, 11.25), 7.5, 18),
  }
  const items = Array.isArray(data) ? data : data?.objects
  if (!Array.isArray(items) || items.length > 300)
    throw new Error("invalid_scene")
  const objects = []
  for (const item of items) {
    if (
      !plain(item) ||
      !types.has(item.type) ||
      !Number.isFinite(Number(item.x)) ||
      !Number.isFinite(Number(item.z))
    )
      continue
    objects.push({
      type: item.type,
      x: clamp(Number(item.x), -tray.width / 2, tray.width / 2),
      y: FLYING.has(item.type) ? clamp(finite(item.y, 0), 0, 3) : 0,
      z: clamp(Number(item.z), -tray.depth / 2, tray.depth / 2),
      rotation: finite(item.rotation, 0),
      scale: clamp(finite(item.scale, 1), 0.45, 1.9),
    })
  }
  return validateScene(
    {
      version: 6,
      theme: ["sand", "snow"].includes(data?.theme) ? "sand" : "meadow",
      tray,
      objects,
    },
    types,
  )
}

export function installSandplayBridge(runtime) {
  const types = new Set(runtime.types)
  const controller = new AbortController()
  let baseline = JSON.stringify(runtime.serialize())
  let sequence = 0
  let timer
  const post = (data) => {
    if (window.parent !== window)
      window.parent.postMessage(
        { channel: CHANNEL, version: 1, ...data },
        window.location.origin,
      )
  }
  const detect = () => {
    const current = JSON.stringify(runtime.serialize())
    if (current !== baseline) {
      baseline = current
      sequence++
      post({ event: "scene:changed", sequence })
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(detect, 100)
  }
  // Observe input completion, never the render loop or animated water geometry.
  for (const type of ["click", "input", "pointerup", "pointercancel", "keyup"])
    window.addEventListener(type, schedule, { signal: controller.signal })
  window.addEventListener(
    "message",
    (event) => {
      const data = event.data
      if (
        event.source !== window.parent ||
        event.origin !== window.location.origin ||
        !plain(data) ||
        data.channel !== CHANNEL ||
        data.version !== 1 ||
        typeof data.requestId !== "string" ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(data.requestId) ||
        !["scene:get", "scene:load", "scene:new", "scene:legacy"].includes(
          data.action,
        )
      )
        return
      try {
        detect()
        if (data.action === "scene:load") {
          const scene = validateScene(data.scene, types)
          const previous = runtime.serialize()
          try {
            runtime.load(scene)
          } catch {
            runtime.load(previous)
            throw new Error("load_failed")
          }
        }
        if (data.action === "scene:new") runtime.clear()
        let scene = runtime.serialize()
        if (data.action === "scene:legacy") {
          const raw = [6, 4, 2, 1]
            .map((version) =>
              localStorage.getItem(`sand-island-scene-v${version}`),
            )
            .find(Boolean)
          if (!raw) throw new Error("legacy_missing")
          if (new TextEncoder().encode(raw).length > MAX_BYTES)
            throw new Error("invalid_scene")
          scene = normalizeLegacy(JSON.parse(raw), types)
        } else {
          // Applied loads become the new baseline without a spurious dirty event.
          baseline = JSON.stringify(scene)
          sequence++
        }
        post({
          event: "scene:result",
          requestId: data.requestId,
          ok: true,
          scene,
          sequence,
        })
      } catch (error) {
        post({
          event: "scene:result",
          requestId: data.requestId,
          ok: false,
          code:
            error instanceof Error && error.message === "legacy_missing"
              ? "legacy_missing"
              : "invalid_scene",
        })
      }
    },
    { signal: controller.signal },
  )
  window.addEventListener(
    "pagehide",
    () => {
      clearTimeout(timer)
      controller.abort()
    },
    { once: true },
  )
}
