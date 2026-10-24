import {
  type AxiosAdapter,
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
} from "axios"

import type { ItemPublic, UserPublic } from "@/client"

const DEMO_TOKEN = "mind-island-demo-token"
const DEMO_PASSWORD = "mind-island-demo"

const demoUser: UserPublic = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "demo@example.com",
  full_name: "Mind Island Demo",
  is_active: true,
  is_superuser: true,
  created_at: "2026-10-24T00:00:00Z",
}

const demoUsers: UserPublic[] = [
  demoUser,
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "visitor@example.com",
    full_name: "Demo Visitor",
    is_active: true,
    is_superuser: false,
    created_at: "2026-10-24T00:00:00Z",
  },
]

const demoItems: ItemPublic[] = [
  {
    id: "00000000-0000-4000-8000-000000000101",
    owner_id: demoUser.id,
    title: "Frontend preview",
    description: "Fictional sample item for the existing template UI.",
    created_at: "2026-10-24T00:00:00Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000102",
    owner_id: demoUser.id,
    title: "No backend required",
    description: "Read-only demo data. Changes are not saved.",
    created_at: "2026-10-24T00:00:00Z",
  },
]

/** Replace only the generated API client's transport, never global HTTP calls. */
export function createDemoAdapter(): AxiosAdapter {
  // Defense in depth: this transport must never be installed in a production build.
  if (!import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE !== "true") {
    throw new Error("The demo API is available only in development demo mode.")
  }

  return async (config) => {
    const url = new URL(config.url ?? "/", window.location.origin)
    const path = url.pathname.replace(/\/$/, "")
    const method = config.method?.toUpperCase() ?? "GET"
    const respond = (status: number, data: unknown): AxiosResponse => ({
      config,
      data: structuredClone(data),
      headers: new AxiosHeaders({ "Content-Type": "application/json" }),
      status,
      statusText: status === 200 ? "OK" : "Demo request rejected",
    })
    const reject = (status: number, detail: string): never => {
      throw new AxiosError(
        detail,
        status >= 500
          ? AxiosError.ERR_BAD_RESPONSE
          : AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        respond(status, { detail }),
      )
    }

    // Unhandled requests fail locally rather than falling through to a real API.
    if (!path.startsWith("/__demo_api/api/v1/")) {
      return reject(404, "This request is not part of the local frontend demo.")
    }

    if (method === "POST" && path.endsWith("/login/access-token")) {
      const credentials = new URLSearchParams(String(config.data ?? ""))
      if (
        credentials.get("username") !== demoUser.email ||
        credentials.get("password") !== DEMO_PASSWORD
      ) {
        return reject(400, "Demo login: demo@example.com / mind-island-demo")
      }
      return respond(200, { access_token: DEMO_TOKEN, token_type: "bearer" })
    }

    if (method !== "GET") {
      return reject(
        501,
        "只读演示：保存、注册和邮件操作不可用，请连接后端后使用。",
      )
    }

    if (config.headers.get("Authorization") !== `Bearer ${DEMO_TOKEN}`) {
      return reject(401, "Please sign in with the demo account.")
    }

    if (path === "/__demo_api/api/v1/users/me") {
      return respond(200, demoUser)
    }

    const paginate = <T>(rows: T[]) => {
      const skip = Math.max(0, Number(url.searchParams.get("skip")) || 0)
      const limit = Math.max(
        0,
        Number(url.searchParams.get("limit") ?? 100) || 0,
      )
      return { data: rows.slice(skip, skip + limit), count: rows.length }
    }

    if (path === "/__demo_api/api/v1/users") {
      return respond(200, paginate(demoUsers))
    }
    if (path === "/__demo_api/api/v1/items") {
      return respond(200, paginate(demoItems))
    }

    return reject(
      501,
      "This API operation is unavailable in the read-only demo.",
    )
  }
}
