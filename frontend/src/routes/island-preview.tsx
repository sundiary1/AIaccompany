import { createFileRoute } from "@tanstack/react-router"

import { IslandPreviewPage } from "@/components/IslandPreview/IslandPreviewPage"

export const Route = createFileRoute("/island-preview")({
  component: IslandPreviewPage,
  head: () => ({
    meta: [{ title: "初始果冻岛 · 心屿 Mind Island" }],
  }),
})
