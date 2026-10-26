import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import {
  normalizeLegacy,
  validateScene,
} from "../public/legacy/sandplay-bridge.js"

const source = readFileSync(
  new URL(
    "../../assets/legacy/sandplay-v15/sandplay-v15.original.html",
    import.meta.url,
  ),
  "utf8",
)
const definitions = source.match(/const defs=\[([\s\S]*?)\n\];/)[1]
const types = new Set(
  [...definitions.matchAll(/\{id:'([^']+)'/g)].map((match) => match[1]),
)
const scene = () => ({
  version: 6,
  theme: "meadow",
  tray: { width: 15.75, depth: 11.25 },
  objects: [
    { type: "cloud", x: 1, y: 1.8, z: -1, rotation: -0.75, scale: 1.35 },
  ],
})

test("all 80 allowed types retain numeric transforms", () => {
  assert.equal(types.size, 80)
  for (const type of types) {
    const data = scene()
    data.objects[0].type = type
    data.objects[0].y = 0
    assert.deepEqual(validateScene(data, types), data)
  }
})

test("invalid scenes fail before runtime replacement", () => {
  const invalid = [
    null,
    [],
    { ...scene(), version: 4 },
    { ...scene(), theme: "snow" },
    { ...scene(), extra: "code" },
    { ...scene(), objects: Array(301).fill(scene().objects[0]) },
  ]
  for (const [key, value] of [
    ["type", "__proto__"],
    ["x", Infinity],
    ["x", NaN],
    ["x", "1"],
    ["x", 99],
    ["y", -1],
    ["y", 4],
    ["rotation", 20000],
    ["scale", 2],
    ["scale", true],
  ]) {
    const data = scene()
    data.objects[0][key] = value
    invalid.push(data)
  }
  for (const data of invalid) assert.throws(() => validateScene(data, types))
})

test("v1/v2 arrays and v4 snow normalize without mutating original JSON", () => {
  const input = [
    { type: "cloud", x: "1", y: 1.8, z: -1, rotation: 0.75, scale: 1.35 },
    { type: "unknown", x: 0, z: 0 },
  ]
  const before = JSON.stringify(input)
  const expected = {
    ...scene(),
    objects: [
      { type: "cloud", x: 1, y: 1.8, z: -1, rotation: 0.75, scale: 1.35 },
    ],
  }
  assert.deepEqual(normalizeLegacy(input, types), expected)
  assert.deepEqual(
    normalizeLegacy({ version: 4, theme: "snow", objects: input }, types),
    { ...expected, theme: "sand" },
  )
  assert.equal(JSON.stringify(input), before)
})

test("legacy dimensions and scales are bounded; bad archives are explicit failures", () => {
  const result = normalizeLegacy(
    {
      tray: { width: 999, depth: 0 },
      objects: [{ type: "tree", x: 999, z: -999, y: 3, scale: 999 }],
    },
    types,
  )
  assert.deepEqual(result.tray, { width: 24, depth: 7.5 })
  assert.deepEqual(result.objects[0], {
    type: "tree",
    x: 12,
    y: 0,
    z: -3.75,
    rotation: 0,
    scale: 1.9,
  })
  for (const data of [null, {}, "oops", Array(301).fill({})])
    assert.throws(() => normalizeLegacy(data, types))
})
