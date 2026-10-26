import { createFileRoute } from "@tanstack/react-router"
import { RainforestPage } from "@/components/Mindfulness/RainforestPage"

export const Route = createFileRoute("/mindfulness")({
  component: RainforestPage,
  head: () => ({ meta: [{ title: "正念 · 雨林岛 | 心屿 Mind Island" }] }),
})
