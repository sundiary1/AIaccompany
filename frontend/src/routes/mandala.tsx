import { createFileRoute } from "@tanstack/react-router"
import { MandalaPage } from "@/components/Mandala/MandalaPage"

export const Route = createFileRoute("/mandala")({
  component: MandalaPage,
  head: () => ({ meta: [{ title: "书屋 · 曼陀罗绘画 | 心屿 Mind Island" }] }),
})
