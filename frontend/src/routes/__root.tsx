import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import {
  createRootRoute,
  HeadContent,
  Outlet,
  useRouterState,
} from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import ErrorComponent from "@/components/Common/ErrorComponent"
import NotFound from "@/components/Common/NotFound"

function RootLayout() {
  const isImmersivePage = useRouterState({
    select: (state) =>
      ["/island-preview", "/sandplay", "/mandala", "/mindfulness"].includes(
        state.location.pathname.replace(/\/$/, ""),
      ),
  })
  return (
    <>
      <HeadContent />
      <Outlet />
      {!isImmersivePage && (
        <>
          <TanStackRouterDevtools position="bottom-right" />
          <ReactQueryDevtools initialIsOpen={false} />
        </>
      )}
    </>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => <NotFound />,
  errorComponent: () => <ErrorComponent />,
})
