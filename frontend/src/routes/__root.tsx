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
  const isIslandPreview = useRouterState({
    select: (state) =>
      state.location.pathname.replace(/\/$/, "") === "/island-preview",
  })
  return (
    <>
      <HeadContent />
      {!isIslandPreview &&
        import.meta.env.DEV &&
        import.meta.env.VITE_DEMO_MODE === "true" && (
          <aside
            role="status"
            className="border-b bg-muted px-4 py-2 text-center text-xs text-muted-foreground"
          >
            本地只读演示 · 虚构数据，保存及邮件功能不可用。演示登录：
            <code>demo@example.com</code> / <code>mind-island-demo</code>
          </aside>
        )}
      <Outlet />
      {!isIslandPreview && (
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
