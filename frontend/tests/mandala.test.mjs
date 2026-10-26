import assert from "node:assert/strict"
import test from "node:test"
import {
  AXES,
  serializeWork,
  validateWork,
} from "../src/components/Mandala/mandala-data.ts"
import { coloringSvg } from "../src/components/Mandala/mandala-export.ts"
import {
  drawStrokes,
  normalizePoint,
} from "../src/components/Mandala/symmetry-engine.ts"
import { TEMPLATES } from "../src/components/Mandala/templates.ts"

const stroke = () => ({
  pts: [
    [0, 0],
    [0.1, 0.2],
    [0.3, 0.4],
  ],
  color: "#648b69",
  w: 0.02,
  a: 0.9,
  folds: 8,
  mirror: true,
})
test("six illustrated templates contain unique closed, numeric-only paths", () => {
  assert.equal(TEMPLATES.length, 6)
  assert.equal(new Set(TEMPLATES.map((template) => template.id)).size, 6)
  for (const template of TEMPLATES) {
    assert.ok(template.regions.length >= 19)
    assert.equal(
      new Set(template.regions.map((region) => region.id)).size,
      template.regions.length,
    )
    for (const region of template.regions) {
      assert.ok(region.d.startsWith("M") && region.d.endsWith("Z"))
      assert.match(region.d, /^[MLCQAZaH0-9.,\s-]+$/)
      assert.ok(!region.d.includes("NaN"))
    }
  }
})
test("coloring serializes template and independent fills, not markup", () => {
  const work = {
    version: 1,
    mode: "coloring",
    templateId: TEMPLATES[0].id,
    fills: { face: "#aabbcc", belly: "#ddeeff" },
  }
  const result = JSON.parse(serializeWork(work))
  assert.deepEqual(result, work)
  result.fills.face = "#ffffff"
  assert.equal(work.fills.face, "#aabbcc")
  const svg = coloringSvg(work)
  assert.ok(svg.includes('fill="#aabbcc"'))
  assert.ok(svg.includes('fill="#ddeeff"'))
  assert.ok(!/<script|on\w+=|<image|<foreignObject|href=/.test(svg))
  assert.throws(() =>
    validateWork({ ...work, fills: { face: 'red" onload="alert(1)' } }),
  )
  assert.throws(() => validateWork({ ...work, fills: { missing: "#ffffff" } }))
  assert.throws(() => validateWork({ ...work, templateId: "remote.svg" }))
})
test("stroke coordinates remain normalized across size and CSS zoom", () => {
  assert.deepEqual(normalizePoint(300, 300, 0, 0, 600), [0, 0])
  assert.deepEqual(normalizePoint(447, 300, 0, 0, 600), [0.5, 0])
  assert.deepEqual(normalizePoint(994, 650, 100, 50, 1200), [0.5, 0])
})
test("work validation rejects oversized, nonfinite and unsafe brush data", () => {
  const base = { version: 1, mode: "symmetry", strokes: [stroke()] }
  assert.deepEqual(JSON.parse(serializeWork(base)), base)
  for (const patch of [
    { folds: 100 },
    { a: 10 },
    { w: Infinity },
    { pts: [[NaN, 0]] },
    { pts: [[3, 0]] },
    { color: "url(https://example.test)" },
    { pts: Array.from({ length: 1801 }, () => [0, 0]) },
  ])
    assert.throws(() =>
      validateWork({ ...base, strokes: [{ ...stroke(), ...patch }] }),
    )
  assert.throws(() =>
    validateWork({ ...base, strokes: Array.from({ length: 301 }, stroke) }),
  )
  assert.throws(() =>
    validateWork({
      ...base,
      strokes: Array.from({ length: 11 }, () => ({
        ...stroke(),
        pts: Array.from({ length: 1800 }, () => [0, 0]),
      })),
    }),
  )
  assert.throws(() => validateWork({ ...base, version: 2 }))
})
test("adapted engine repeats and mirrors each stroke using its stored parameters", () => {
  for (const folds of AXES) {
    let depth = 0,
      paths = 0,
      mirrors = 0,
      curves = 0
    const context = {
      save: () => depth++,
      restore: () => depth--,
      translate() {},
      rotate() {},
      scale: (_x, y) => {
        if (y === -1) mirrors++
      },
      beginPath: () => paths++,
      moveTo() {},
      lineTo() {},
      stroke() {},
      quadraticCurveTo: () => curves++,
    }
    drawStrokes(context, [{ ...stroke(), folds }], 600)
    assert.equal(paths, folds * 2)
    assert.equal(mirrors, folds)
    assert.equal(curves, folds * 2)
    assert.equal(depth, 0)
    paths = 0
    drawStrokes(context, [{ ...stroke(), folds, mirror: false }], 600)
    assert.equal(paths, folds)
  }
})
