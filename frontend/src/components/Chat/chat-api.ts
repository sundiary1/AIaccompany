export type ChatMode = "mock" | "live" | "unconfigured" | "offline"
export type ContextMessage = { role: "user" | "assistant"; content: string }
export type StreamEvent =
  | {
      type: "meta"
      mode: ChatMode
      safety: boolean
      userSaved: boolean
      assistantId?: string
    }
  | { type: "delta"; text: string }
  | {
      type: "done"
      finishReason: string
      persisted: boolean
      memoryWarning: boolean
    }

export class ChatRequestError extends Error {
  constructor(
    message: string,
    public readonly code = "network",
    public readonly retryable = true,
  ) {
    super(message)
    this.name = "ChatRequestError"
  }
}

export async function getChatMode(signal: AbortSignal): Promise<ChatMode> {
  try {
    const response = await fetch("/api/demo/chat/status", {
      signal,
      cache: "no-store",
      credentials: "omit",
    })
    if (!response.ok) return "offline"
    const { mode } = await response.json()
    return ["mock", "live", "unconfigured"].includes(mode) ? mode : "offline"
  } catch {
    return "offline"
  }
}

function parseEvent(frame: string): StreamEvent | null {
  let type = ""
  const lines: string[] = []
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim()
    if (line.startsWith("data:")) lines.push(line.slice(5).trimStart())
  }
  if (!lines.length) return null
  const data = JSON.parse(lines.join("\n"))
  if (type === "error") {
    throw new ChatRequestError(
      typeof data.message === "string"
        ? data.message
        : "回复暂时中断，请重试。",
      typeof data.code === "string" ? data.code : "provider",
      data.retryable !== false,
    )
  }
  if (type === "meta")
    return {
      type,
      mode: data.mode === "live" ? "live" : "mock",
      safety: data.safety === true,
      userSaved: data.user_saved === true,
      assistantId: data.assistant_message_id,
    }
  if (type === "delta" && typeof data.text === "string")
    return { type, text: data.text }
  if (type === "done")
    return {
      type,
      finishReason: data.finish_reason,
      persisted: data.persisted === true,
      memoryWarning: data.memory_warning === true,
    }
  return null
}

/** POST + SSE, independent of the template's mock Axios API client. */
export async function streamChat(
  message: string,
  history: ContextMessage[],
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
  session: {
    conversation_id?: string
    request_id?: string
    temporary: boolean
  } = { temporary: true },
) {
  const request = new AbortController()
  const cancel = () => request.abort()
  signal.addEventListener("abort", cancel, { once: true })
  if (signal.aborted) request.abort()
  let timedOut = false
  const timer = window.setTimeout(() => {
    timedOut = true
    request.abort()
  }, 60000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await fetch("/api/demo/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, ...session }),
      credentials: "omit",
      mode: "same-origin",
      cache: "no-store",
      signal: request.signal,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new ChatRequestError(
        body?.error?.message || "无法连接本机 AI 代理，请确认服务已启动。",
        body?.error?.code || "network",
      )
    }
    if (
      !response.body ||
      !response.headers.get("content-type")?.includes("text/event-stream")
    )
      throw new ChatRequestError("回复格式不兼容，请检查本机代理。", "protocol")
    reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let completed = false
    let characters = 0
    while (!completed) {
      const { value, done } = await reader.read()
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true })
      // Normalize only complete CRLF pairs, preserving splits across network chunks.
      buffer = buffer.replace(/\r\n/g, "\n")
      if (buffer.length > 100000)
        throw new ChatRequestError("回复超出限制。", "response_size")
      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const event = parseEvent(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        if (event) {
          if (event.type === "delta") {
            characters += event.text.length
            if (characters > 8000)
              throw new ChatRequestError("回复超出限制。", "response_size")
          }
          onEvent(event)
          if (event.type === "done") completed = true
        }
        boundary = buffer.indexOf("\n\n")
      }
      if (done && !completed)
        throw new ChatRequestError(
          "回复连接意外中断，可以重试。",
          "interrupted",
        )
    }
  } catch (error) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError")
    if (timedOut)
      throw new ChatRequestError("等待回复超时了，可以稍后重试。", "timeout")
    if (error instanceof ChatRequestError) throw error
    throw new ChatRequestError("网络连接暂时中断，请确认本机代理已启动后重试。")
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener("abort", cancel)
    await reader?.cancel().catch(() => {})
    reader?.releaseLock()
    request.abort()
  }
}
