import { createFileRoute } from "@tanstack/react-router"
import { SandplayPage } from "@/components/Sandplay/SandplayPage"

export const Route = createFileRoute("/sandplay")({
  component: SandplayPage,
  head: () => ({ meta: [{ title: "沙盒 · 心理沙盘 | 心屿 Mind Island" }] }),
})
