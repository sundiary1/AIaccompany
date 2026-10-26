import { type MandalaWork, validateWork } from "./mandala-data"
import { drawStrokes } from "./symmetry-engine"
import { getTemplate } from "./templates"

export function coloringSvg(work: MandalaWork) {
  const checked = validateWork(work)
  if (checked.mode !== "coloring") throw new Error("无效的涂色作品")
  const template = getTemplate(checked.templateId)!
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 600 600"><rect width="600" height="600" fill="white"/>${template.regions.map((region) => `<path d="${region.d}" fill="${checked.fills[region.id] || "#ffffff"}" stroke="#788572" stroke-width="1.4" stroke-linejoin="round"/>`).join("")}</svg>`
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("图片导出失败，请重试")),
      "image/png",
    )
  })
}

/** Bounded 2048px export from validated data, never arbitrary SVG DOM. */
export async function exportPng(work: MandalaWork) {
  const checked = validateWork(work)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 2048
  const context = canvas.getContext("2d")
  if (!context) throw new Error("当前设备无法导出图片")
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, 2048, 2048)
  if (checked.mode === "symmetry") drawStrokes(context, checked.strokes, 2048)
  else {
    const url = URL.createObjectURL(
      new Blob([coloringSvg(checked)], { type: "image/svg+xml" }),
    )
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      context.drawImage(image, 0, 0, 2048, 2048)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  return canvasBlob(canvas)
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  const filename = [...name]
    .filter(
      (character) =>
        character.charCodeAt(0) >= 32 && !'<>:"/\\|?*'.includes(character),
    )
    .join("")
    .slice(0, 60)
  anchor.download = `${filename || "曼陀罗"}.png`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
