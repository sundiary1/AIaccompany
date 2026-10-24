import { ChatRequestError } from "./chat-api"

export type MemoryCategory =
  | "preference"
  | "interest"
  | "habit"
  | "goal"
  | "fact"
  | "communication"
export const memoryCategories: Record<MemoryCategory, string> = {
  preference: "偏好",
  interest: "兴趣",
  habit: "习惯",
  goal: "目标",
  fact: "事实",
  communication: "交流方式",
}
export type MemorySource = {
  message_id: string
  conversation_id: string
  evidence: string
  conversation_title: string
  created_at: string
}
export type Memory = {
  id: string
  content: string
  category: MemoryCategory
  source_type: "auto" | "manual"
  enabled: number
  review_status: "approved" | "pending"
  user_edited: number
  sensitive: number
  related_memory_id: string | null
  blocked_by_review: number
  updated_at: string
  sources: MemorySource[]
}
export type MemorySettings = {
  auto_extract: number
  use_memories: number
  consented_at: string | null
  updated_at: string
}
export type MemoryJob = {
  id: string
  status: string
  attempts: number
  provider_calls: number
  error_code: string | null
  added_count: number
  updated_count: number
  review_count: number
  finished_at: string | null
}
export type MemoryStatus = {
  jobs: MemoryJob[]
  usage: { provider_calls: number; input_tokens: number; output_tokens: number }
  memory_count: number
  mode: string
  max_attempts: number
}
export type MemoryInput = {
  content: string
  category: MemoryCategory
  enabled: boolean
  allow_sensitive: boolean
  review_status?: string
  resolve_conflict?: boolean
}

async function request<T>(
  path: string,
  method = "GET",
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal?.addEventListener("abort", cancel, { once: true })
  if (signal?.aborted) controller.abort()
  const timer = window.setTimeout(cancel, 6000)
  try {
    const response = await fetch(`/api/demo/${path}`, {
      method,
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      mode: "same-origin",
      headers: data ? { "Content-Type": "application/json" } : undefined,
      body: data ? JSON.stringify(data) : undefined,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new ChatRequestError(
        body?.error?.message || "记忆操作未成功，请重试。",
        body?.error?.code || "memory",
      )
    }
    return (response.status === 204 ? undefined : await response.json()) as T
  } catch (error) {
    if (error instanceof ChatRequestError) throw error
    throw new ChatRequestError(
      "记忆信箱暂时无法连接，请稍后重试。",
      "memory_network",
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", cancel)
  }
}

export const getMemories = (signal?: AbortSignal) =>
  request<Memory[]>("memories", "GET", undefined, signal)
export const createMemory = (body: MemoryInput) =>
  request<Memory>("memories", "POST", {
    content: body.content,
    category: body.category,
    enabled: body.enabled,
    allow_sensitive: body.allow_sensitive,
  })
export const patchMemory = (id: string, body: Partial<MemoryInput>) =>
  request<Memory>(`memories/${encodeURIComponent(id)}`, "PATCH", body)
export const deleteMemory = (id: string) =>
  request<void>(`memories/${encodeURIComponent(id)}`, "DELETE")
export const deleteAutoMemories = () => request<void>("memories/auto", "DELETE")
export const getMemorySettings = (signal?: AbortSignal) =>
  request<MemorySettings>("memory/settings", "GET", undefined, signal)
export const setMemorySettings = (body: {
  auto_extract?: boolean
  use_memories?: boolean
  acknowledge?: boolean
}) => request<MemorySettings>("memory/settings", "PATCH", body)
export const getMemoryStatus = (signal?: AbortSignal) =>
  request<MemoryStatus>("memory/status", "GET", undefined, signal)
export const retryMemoryJob = (id: string) =>
  request<void>(`memory/jobs/${encodeURIComponent(id)}/retry`, "POST")
