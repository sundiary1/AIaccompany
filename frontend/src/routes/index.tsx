import { createFileRoute } from "@tanstack/react-router"
import { LandingPage } from "@/components/Landing/LandingPage"

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      { title: "心屿 Mind Island · 让心，轻轻靠岸。" },
      {
        name: "description",
        content: "一座可以慢慢探索的小小群岛。",
      },
    ],
  }),
})
