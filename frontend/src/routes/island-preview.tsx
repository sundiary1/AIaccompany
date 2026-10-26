import { createFileRoute } from "@tanstack/react-router"

import { IslandPreviewPage } from "@/components/IslandPreview/IslandPreviewPage"

export const Route = createFileRoute("/island-preview")({
  component: IslandPreviewPage,
  head: () => ({
    meta: [{ title: "云间群岛 · 心屿 Mind Island" }],
  }),
})
