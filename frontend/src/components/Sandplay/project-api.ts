export type SandScene = {
  version: 6
  theme: "meadow" | "sand"
  tray: { width: number; depth: number }
  objects: {
    type: string
    x: number
    y: number
    z: number
    rotation: number
    scale: number
  }[]
}
export type Project = {
  id: string
  title: string
  schema_version: 6
  revision: number
  created_at: string
  updated_at: string
}
export type ProjectDetail = Project & { scene: SandScene }
export type CreateProject = { id: string; title: string; scene: SandScene }

export class ProjectError extends Error {
  constructor(
    message: string,
    public readonly code = "network",
  ) {
    super(message)
    this.name = "ProjectError"
  }
}

async function request<T>(
  path = "",
  method = "GET",
  data?: unknown,
): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await fetch(`/api/demo/sandplay/projects${path}`, {
      method,
      headers:
        data === undefined ? undefined : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
      credentials: "omit",
      mode: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new ProjectError(
        body?.error?.message || "作品操作失败，请重试。",
        body?.error?.code,
      )
    }
    return (response.status === 204 ? undefined : await response.json()) as T
  } catch (error) {
    if (error instanceof ProjectError) throw error
    throw new ProjectError(
      "无法确认保存结果。当前编辑仍保留，请检查本机代理并重试。",
    )
  } finally {
    window.clearTimeout(timer)
  }
}

export const projectsAPI = {
  list: (offset = 0) => request<Project[]>(`?limit=100&offset=${offset}`),
  get: (id: string) => request<ProjectDetail>(`/${id}`),
  create: (body: CreateProject) => request<ProjectDetail>("", "POST", body),
  save: (project: Project, scene: SandScene) =>
    request<ProjectDetail>(`/${project.id}`, "PUT", {
      revision: project.revision,
      scene,
    }),
  rename: (project: Project, title: string) =>
    request<Project>(`/${project.id}`, "PATCH", {
      revision: project.revision,
      title,
    }),
  delete: (project: Project) =>
    request<void>(`/${project.id}?revision=${project.revision}`, "DELETE"),
}
