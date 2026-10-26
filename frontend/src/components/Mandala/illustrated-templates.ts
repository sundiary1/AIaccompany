import type { MandalaTemplate, Region } from "./templates"

const ellipse = (x: number, y: number, rx: number, ry = rx) =>
  `M${x - rx} ${y}A${rx} ${ry} 0 1 0 ${x + rx} ${y}A${rx} ${ry} 0 1 0 ${x - rx} ${y}Z`
const polygon = (points: number[][]) =>
  `M${points.map((point) => point.join(" ")).join("L")}Z`
const rectangle = (x: number, y: number, w: number, h: number) =>
  polygon([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ])
function star(x: number, y: number, radius: number, points = 5) {
  return polygon(
    Array.from({ length: points * 2 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / points
      const r = radius * (i % 2 ? 0.46 : 1)
      return [
        +(x + Math.cos(a) * r).toFixed(3),
        +(y + Math.sin(a) * r).toFixed(3),
      ]
    }),
  )
}
function scene(
  id: string,
  name: string,
  draw: (add: (id: string, d: string) => void) => void,
): MandalaTemplate {
  const regions: Region[] = [
    { id: "frame", d: ellipse(300, 300, 282) },
    { id: "background", d: ellipse(300, 300, 263) },
  ]
  draw((key, d) => regions.push({ id: key, d }))
  return { id, name, regions }
}
function flower(
  add: (id: string, d: string) => void,
  key: string,
  x: number,
  y: number,
  radius = 14,
) {
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3
    add(
      `${key}-petal-${i}`,
      ellipse(
        x + Math.cos(angle) * radius,
        y + Math.sin(angle) * radius,
        radius * 0.6,
      ),
    )
  }
  add(`${key}-center`, ellipse(x, y, radius * 0.5))
}

/** Original illustrated coloring pages; every outlined region is a closed path. */
export const ILLUSTRATED_TEMPLATES: MandalaTemplate[] = [
  scene("forest-cat-v1", "森林小猫", (add) => {
    add("tree-trunk", rectangle(118, 188, 25, 190))
    add(
      "tree-crown",
      "M70 228Q45 171 105 143Q97 87 157 102Q208 111 190 164Q238 193 191 229Z",
    )
    add("tree-leaf-1", "M92 168Q102 118 143 136Q145 168 92 168Z")
    add("tree-leaf-2", "M140 194Q168 145 192 174Q185 205 140 194Z")
    add("tail", "M365 436C474 450 493 339 448 337C423 339 453 395 367 395Z")
    add("body", ellipse(324, 400, 75, 83))
    add("ear-left", "M233 220Q212 125 242 143L290 190Z")
    add("ear-right", "M355 190L412 142Q433 139 411 226Z")
    add(
      "inner-ear-left",
      polygon([
        [240, 171],
        [250, 215],
        [272, 191],
      ]),
    )
    add(
      "inner-ear-right",
      polygon([
        [394, 167],
        [371, 191],
        [400, 215],
      ]),
    )
    add("face", ellipse(324, 260, 98, 82))
    add("forehead", "M298 183Q325 175 350 184L327 222Z")
    add("eye-left", ellipse(287, 255, 17, 22))
    add("eye-right", ellipse(361, 255, 17, 22))
    add("pupil-left", ellipse(290, 257, 6, 13))
    add("pupil-right", ellipse(358, 257, 6, 13))
    add("muzzle", ellipse(324, 292, 44, 27))
    add("nose", "M315 283Q324 277 333 283L324 293Z")
    add("belly", ellipse(324, 406, 45, 54))
    add("scarf", "M258 337Q325 364 387 337L375 361Q325 388 272 361Z")
    add("paw-left", ellipse(283, 472, 24, 16))
    add("paw-right", ellipse(363, 472, 24, 16))
    flower(add, "daisy", 164, 410, 19)
    flower(add, "little-flower", 447, 259, 15)
  }),
  scene("ocean-fish-v1", "海浪与鱼", (add) => {
    add(
      "wave-upper",
      "M54 333Q160 285 300 337Q440 380 546 326L529 370Q420 412 295 375Q150 324 65 378Z",
    )
    add(
      "wave-lower",
      "M84 416Q185 382 305 427Q430 468 510 412L481 460Q400 501 296 468Q180 429 120 464Z",
    )
    add(
      "fish-tail",
      polygon([
        [223, 255],
        [151, 211],
        [159, 305],
      ]),
    )
    add("fish-body", ellipse(292, 255, 91, 57))
    add("fish-fin", "M263 221Q285 182 319 204L315 221Z")
    add("fish-cheek", ellipse(333, 255, 24, 42))
    add("fish-eye", ellipse(345, 244, 10))
    add("fish-stripe", "M265 203Q248 257 267 308L285 311Q270 254 287 199Z")
    add(
      "small-tail",
      polygon([
        [397, 432],
        [450, 402],
        [450, 457],
      ]),
    )
    add("small-fish", ellipse(355, 432, 55, 33))
    add(
      "small-fin",
      polygon([
        [353, 403],
        [373, 380],
        [386, 411],
      ]),
    )
    add("small-eye", ellipse(323, 427, 6))
    for (const [i, x] of [119, 145, 171].entries())
      add(
        `seaweed-${i}`,
        `M${x} 438C${x - 25} 390 ${x + 28} 370 ${x} 340Q${x + 47} 371 ${x + 8} 416L${x + 12} 438Z`,
      )
    for (const [i, [x, y, r]] of [
      [410, 173, 23],
      [449, 219, 11],
      [225, 138, 16],
      [184, 174, 9],
      [392, 326, 14],
      [463, 319, 8],
    ].entries())
      add(`bubble-${i}`, ellipse(x, y, r))
  }),
  scene("moon-stars-v1", "星月晚安", (add) => {
    add("moon", "M333 135C172 122 135 340 302 375C216 314 239 201 333 135Z")
    for (const [i, [x, y, r]] of [
      [400, 216, 60],
      [373, 357, 36],
      [188, 147, 24],
      [135, 304, 20],
      [451, 336, 23],
      [289, 445, 25],
      [329, 254, 17],
    ].entries())
      add(`star-${i}`, star(x, y, r))
    add(
      "cloud-left",
      "M111 408Q91 369 130 360Q146 321 178 352Q217 347 219 381Q250 398 225 420H126Z",
    )
    add(
      "cloud-right",
      "M359 455Q337 425 371 407Q387 370 420 398Q453 390 465 421Q486 442 461 455Z",
    )
    for (const [i, [x, y]] of [
      [257, 110],
      [444, 145],
      [489, 260],
      [121, 220],
      [210, 454],
      [327, 390],
      [354, 161],
      [278, 324],
      [178, 247],
      [273, 389],
    ].entries())
      add(`stardust-${i}`, ellipse(x, y, 5))
  }),
  scene("butterfly-garden-v1", "蝶舞花园", (add) => {
    add("wing-left-top", "M293 295C220 96 82 106 134 253Q186 325 293 295Z")
    add("wing-right-top", "M307 295C380 96 518 106 466 253Q414 325 307 295Z")
    add("wing-left-bottom", "M290 290C122 273 161 427 259 391Z")
    add("wing-right-bottom", "M310 290C478 273 439 427 341 391Z")
    add("body", ellipse(300, 294, 15, 91))
    add("head", ellipse(300, 200, 21))
    for (const side of [-1, 1]) {
      add(
        `antenna-${side}`,
        `M${300 + side * 8} 181Q${300 + side * 17} 144 ${300 + side * 40} 149L${300 + side * 37} 156Q${300 + side * 22} 151 ${300 + side * 13} 184Z`,
      )
      for (const [i, [dx, y, rx, ry]] of [
        [92, 214, 35, 45],
        [64, 334, 23, 28],
        [138, 227, 9, 12],
      ].entries())
        add(`wing-spot-${side}-${i}`, ellipse(300 + side * dx, y, rx, ry))
    }
    flower(add, "flower-left", 179, 448, 22)
    flower(add, "flower-right", 410, 438, 27)
    add("leaf-left", "M195 492Q231 437 260 471Q243 501 195 492Z")
    add("leaf-right", "M329 493Q342 452 376 467Q382 501 329 493Z")
  }),
  scene("geometric-quilt-v1", "几何拼花", (add) => {
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        const x = 144 + col * 78,
          y = 144 + row * 78
        const flipped = (row + col) % 2 === 0
        add(
          `tile-${row}-${col}-a`,
          polygon(
            flipped
              ? [
                  [x, y],
                  [x + 78, y],
                  [x, y + 78],
                ]
              : [
                  [x, y],
                  [x + 78, y],
                  [x + 78, y + 78],
                ],
          ),
        )
        add(
          `tile-${row}-${col}-b`,
          polygon(
            flipped
              ? [
                  [x + 78, y],
                  [x + 78, y + 78],
                  [x, y + 78],
                ]
              : [
                  [x, y],
                  [x + 78, y + 78],
                  [x, y + 78],
                ],
          ),
        )
      }
    add("center", star(300, 300, 74, 8))
    for (const [i, [x, y]] of [
      [300, 98],
      [502, 300],
      [300, 502],
      [98, 300],
    ].entries())
      add(
        `diamond-${i}`,
        polygon([
          [x, y - 27],
          [x + 27, y],
          [x, y + 27],
          [x - 27, y],
        ]),
      )
  }),
  scene("mountain-cabin-v1", "山野小屋", (add) => {
    add("sun", ellipse(411, 152, 38))
    add(
      "mountain-left",
      polygon([
        [89, 347],
        [196, 166],
        [299, 347],
      ]),
    )
    add(
      "snow-left",
      polygon([
        [196, 166],
        [159, 229],
        [193, 214],
        [219, 230],
        [233, 230],
      ]),
    )
    add(
      "mountain-right",
      polygon([
        [315, 338],
        [435, 221],
        [508, 360],
      ]),
    )
    add(
      "river",
      "M119 434Q224 392 291 448Q325 477 416 469L392 494Q321 504 273 470Q212 430 139 461Z",
    )
    add("house", rectangle(239, 306, 151, 132))
    add(
      "roof",
      polygon([
        [217, 307],
        [315, 228],
        [412, 307],
      ]),
    )
    add(
      "roof-inset",
      polygon([
        [258, 294],
        [315, 249],
        [371, 294],
      ]),
    )
    add("chimney", rectangle(352, 235, 23, 25))
    add("door", rectangle(302, 371, 39, 67))
    add("door-knob", ellipse(332, 409, 3))
    add("window-left", rectangle(254, 333, 34, 32))
    add("window-right", rectangle(342, 333, 34, 32))
    add("step", rectangle(289, 438, 66, 12))
    add("tree-trunk", rectangle(141, 354, 16, 65))
    add(
      "tree-crown",
      polygon([
        [106, 366],
        [149, 278],
        [192, 366],
      ]),
    )
    add(
      "cloud",
      "M242 151Q227 122 252 114Q271 87 294 109Q321 105 328 133Q344 149 325 153Z",
    )
    flower(add, "field-flower", 451, 391, 18)
  }),
]
