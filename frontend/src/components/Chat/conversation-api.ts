import { ChatRequestError } from "./chat-api"

export type Conversation = {
  id: string
  title: string
  created_at: string
  updated_at: string
  last_message_at: string | null
}
export type SavedMessage = {
  id: string
  request_id: string
  role: "user" | "assistant"
  content: string
  status: "pending" | "completed" | "failed" | "cancelled"
  created_at: string
  is_safety: number
  finish_reason: string | null
}
export type ConversationDetail = {
  conversation: Conversation
  messages: SavedMessage[]
}

async function historyRequest<T>(
  path = "",
  method = "GET",
  data?: unknown,
): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 6000)
  try {
    const response = await fetch(`/api/demo/conversations${path}`, {
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
      throw new ChatRequestError(
        body?.error?.message || "历史操作未成功，请重试。",
        body?.error?.code || "history",
      )
    }
    return (response.status === 204 ? undefined : await response.json()) as T
  } catch (error) {
    if (error instanceof ChatRequestError) throw error
    throw new ChatRequestError(
      "无法确认历史数据，请检查本机代理后重试。",
      "history_network",
    )
  } finally {
    window.clearTimeout(timer)
  }
}

export const listConversations = (offset = 0) =>
  historyRequest<Conversation[]>(`?limit=100&offset=${offset}`)
export const createConversation = (id: string) =>
  historyRequest<Conversation>("", "POST", { id })
export const getConversation = (id: string) =>
  historyRequest<ConversationDetail>(`/${encodeURIComponent(id)}/messages`)
export const renameConversation = (id: string, title: string) =>
  historyRequest<Conversation>(`/${encodeURIComponent(id)}`, "PATCH", { title })
export const deleteConversation = (id: string) =>
  historyRequest<void>(`/${encodeURIComponent(id)}`, "DELETE")
export const clearConversation = (id: string) =>
  historyRequest<void>(`/${encodeURIComponent(id)}/messages`, "DELETE")
