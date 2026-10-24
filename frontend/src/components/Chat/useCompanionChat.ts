import { useCallback, useEffect, useRef, useState } from "react"
import {
  type ChatMode,
  ChatRequestError,
  type ContextMessage,
  getChatMode,
  streamChat,
} from "./chat-api"
import type { Conversation, ConversationDetail } from "./conversation-api"
import * as historyApi from "./conversation-api"

export type MessageStatus =
  | "complete"
  | "streaming"
  | "pending"
  | "cancelled"
  | "error"
export type ConversationMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  status: MessageStatus
  safety?: boolean
  finishReason?: string
  requestId?: string
  saved?: boolean
  memoryWarning?: boolean
}
export type ChatFailure = { message: string; retryable: boolean }

/** Select complete pairs only, so failed or cancelled replies never become context. */
export function recentContext(
  messages: ConversationMessage[],
): ContextMessage[] {
  const pairs: ContextMessage[][] = []
  for (let index = 0; index < messages.length - 1; index++) {
    const user = messages[index]
    const assistant = messages[index + 1]
    if (
      user.role === "user" &&
      assistant.role === "assistant" &&
      assistant.status === "complete" &&
      assistant.content
    ) {
      pairs.push([
        { role: "user", content: user.content },
        { role: "assistant", content: assistant.content },
      ])
      index++
    }
  }
  const selected: ContextMessage[][] = []
  let characters = 0
  for (const pair of pairs.slice(-6).reverse()) {
    const length = pair.reduce(
      (sum, message) => sum + message.content.length,
      0,
    )
    if (characters + length > 10000) break
    selected.unshift(pair)
    characters += length
  }
  return selected.flat()
}

function restoredMessages(detail: ConversationDetail): ConversationMessage[] {
  return detail.messages.map((message) => ({
    id: message.id,
    requestId: message.request_id,
    role: message.role,
    content: message.content,
    status:
      message.status === "completed"
        ? "complete"
        : message.status === "failed"
          ? "error"
          : message.status,
    safety: Boolean(message.is_safety),
    finishReason: message.finish_reason ?? undefined,
    saved: message.status === "completed",
  }))
}

async function readSettled(id: string) {
  let detail = await historyApi.getConversation(id)
  for (const delay of [120, 240, 480, 960]) {
    if (!detail.messages.some((message) => message.status === "pending")) break
    await new Promise((resolve) => window.setTimeout(resolve, delay))
    detail = await historyApi.getConversation(id)
  }
  return detail
}

function failureMessage(error: unknown) {
  return error instanceof ChatRequestError
    ? error.message
    : "历史操作未成功，请重试。"
}

type PendingRequest = {
  text: string
  base: ConversationMessage[]
  id: string
  conversationId?: string
  temporary: boolean
}

export function useCompanionChat() {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<ChatFailure | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [mode, setMode] = useState<ChatMode>("offline")
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [temporary, setTemporary] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [composerKey, setComposerKey] = useState(0)
  const busy = useRef(false)
  const mounted = useRef(true)
  const view = useRef<{
    conversation: Conversation | null
    temporary: boolean
  }>({ conversation: null, temporary: false })
  const previousNormal = useRef<string | null>(null)
  const draftConversationId = useRef<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const running = useRef<Promise<void> | null>(null)
  const sequence = useRef(0)
  const navigation = useRef(0)
  const latest = useRef(messages)
  const lastRequest = useRef<PendingRequest | null>(null)

  const showMessages = useCallback((next: ConversationMessage[]) => {
    latest.current = next
    setMessages(next)
  }, [])
  const changeView = useCallback(
    (next: Conversation | null, isTemporary: boolean) => {
      view.current = { conversation: next, temporary: isTemporary }
      if (next) previousNormal.current = next.id
      setConversation(next)
      setTemporary(isTemporary)
    },
    [],
  )
  const markLoading = useCallback((next: boolean) => {
    busy.current = next
    setLoading(next)
  }, [])
  const refreshMode = useCallback(() => {
    const abort = new AbortController()
    const timeout = window.setTimeout(() => abort.abort(), 5000)
    void getChatMode(abort.signal)
      .then((next) => {
        if (!abort.signal.aborted) setMode(next)
      })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      abort.abort()
      window.clearTimeout(timeout)
    }
  }, [])
  useEffect(refreshMode, [refreshMode])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      sequence.current++
      navigation.current++
      controller.current?.abort()
    }
  }, [])

  const refreshHistory = useCallback(async () => {
    try {
      const rows = await historyApi.listConversations()
      if (mounted.current) {
        setConversations(rows)
        setHasMore(rows.length === 100)
        setHistoryError(null)
      }
      return rows
    } catch (failure) {
      if (mounted.current) setHistoryError(failureMessage(failure))
      throw failure
    }
  }, [])
  const loadMore = async () => {
    if (busy.current) return
    markLoading(true)
    try {
      const rows = await historyApi.listConversations(conversations.length)
      setConversations((current) => [
        ...current,
        ...rows.filter((row) => !current.some((c) => c.id === row.id)),
      ])
      setHasMore(rows.length === 100)
    } catch (failure) {
      setHistoryError(failureMessage(failure))
    } finally {
      markLoading(false)
    }
  }

  const cancelForSwitch = useCallback(async () => {
    if (controller.current)
      showMessages(
        latest.current.map((message) =>
          message.status === "streaming"
            ? { ...message, status: "cancelled" }
            : message,
        ),
      )
    sequence.current++
    controller.current?.abort()
    setGenerating(false)
    await running.current
    controller.current = null
  }, [showMessages])

  const switchView = useCallback(
    async (target?: string, create = false, isTemporary = false) => {
      if (busy.current) return false
      const token = ++navigation.current
      markLoading(true)
      await cancelForSwitch()
      try {
        if (isTemporary) {
          changeView(null, true)
          showMessages([])
          setError(null)
          lastRequest.current = null
          setComposerKey((key) => key + 1)
          return true
        }
        const rows = await refreshHistory()
        let chosen =
          target ??
          view.current.conversation?.id ??
          previousNormal.current ??
          rows[0]?.id
        if (create) {
          chosen = draftConversationId.current ?? crypto.randomUUID()
          draftConversationId.current = chosen
          await historyApi.createConversation(chosen)
        }
        const detail = chosen ? await readSettled(chosen) : null
        if (token !== navigation.current || !mounted.current) return false
        changeView(detail?.conversation ?? null, false)
        showMessages(detail ? restoredMessages(detail) : [])
        setComposerKey((key) => key + 1)
        const unfinished = detail?.messages[detail.messages.length - 1]
        setError(
          unfinished && ["failed", "cancelled"].includes(unfinished.status)
            ? {
                message:
                  "上次回复未完成，可以重试；未完成的回复不会进入上下文。",
                retryable: true,
              }
            : null,
        )
        lastRequest.current = null
        draftConversationId.current = null
        if (create) await refreshHistory()
        return true
      } catch (failure) {
        if (token === navigation.current)
          setHistoryError(failureMessage(failure))
        return false
      } finally {
        if (token === navigation.current && mounted.current) markLoading(false)
      }
    },
    [cancelForSwitch, changeView, markLoading, refreshHistory, showMessages],
  )

  const restore = useCallback(() => switchView(), [switchView])
  const selectConversation = (id: string) => switchView(id)
  const newConversation = () => switchView(undefined, true)
  const startTemporary = () => switchView(undefined, false, true)
  const stop = useCallback(() => controller.current?.abort(), [])

  const send = useCallback(
    async (text: string, retryRequest?: PendingRequest) => {
      const trimmed = text.trim()
      if (
        !trimmed ||
        trimmed.length > 2000 ||
        controller.current ||
        busy.current
      )
        return
      const snapshot = view.current
      const input: PendingRequest = retryRequest ?? {
        text: trimmed,
        base: latest.current,
        id: crypto.randomUUID(),
        temporary: snapshot.temporary,
        conversationId: snapshot.temporary
          ? undefined
          : (snapshot.conversation?.id ??
            draftConversationId.current ??
            crypto.randomUUID()),
      }
      if (!input.temporary && !snapshot.conversation)
        draftConversationId.current = input.conversationId ?? null
      const requestSequence = ++sequence.current
      const abort = new AbortController()
      controller.current = abort
      lastRequest.current = input
      const assistantId = `${input.id}:assistant`
      showMessages([
        ...input.base,
        {
          id: input.id,
          requestId: input.id,
          role: "user",
          content: input.text,
          status: "complete",
          saved: input.temporary,
        },
        {
          id: assistantId,
          requestId: input.id,
          role: "assistant",
          content: "",
          status: "streaming",
          saved: false,
        },
      ])
      setGenerating(true)
      setError(null)
      const update = (change: Partial<ConversationMessage>) => {
        if (requestSequence !== sequence.current || !mounted.current) return
        const next = latest.current.map((message) =>
          message.id === assistantId ? { ...message, ...change } : message,
        )
        showMessages(next)
      }
      const run = async () => {
        let content = ""
        let knownConversation = Boolean(snapshot.conversation)
        try {
          if (!input.temporary && !snapshot.conversation) {
            const created = await historyApi.createConversation(
              input.conversationId as string,
            )
            knownConversation = true
            if (requestSequence !== sequence.current) return
            changeView(created, false)
            draftConversationId.current = null
          }
          if (requestSequence !== sequence.current || abort.signal.aborted)
            return
          await streamChat(
            input.text,
            input.temporary ? recentContext(input.base) : [],
            abort.signal,
            (event) => {
              if (requestSequence !== sequence.current) return
              if (event.type === "meta") {
                if (!event.safety) setMode(event.mode)
                showMessages(
                  latest.current.map((message) =>
                    message.id === input.id
                      ? {
                          ...message,
                          saved: event.userSaved || input.temporary,
                        }
                      : message,
                  ),
                )
                update({ safety: event.safety })
              } else if (event.type === "delta") {
                content += event.text
                update({ content })
              } else {
                if (!input.temporary && !event.persisted)
                  throw new ChatRequestError(
                    "回复尚未确认保存，请重新载入历史。",
                    "save_failed",
                  )
                update({
                  status: "complete",
                  saved: event.persisted,
                  finishReason: event.finishReason,
                  memoryWarning: event.memoryWarning,
                })
              }
            },
            {
              temporary: input.temporary,
              conversation_id: input.conversationId,
              request_id: input.id,
            },
          )
        } catch (failure) {
          if (requestSequence !== sequence.current) return
          update({ status: abort.signal.aborted ? "cancelled" : "error" })
          setError({
            message: abort.signal.aborted
              ? "已停止生成；未完成的回复不会进入上下文。"
              : failureMessage(failure),
            retryable: true,
          })
        } finally {
          if (requestSequence === sequence.current && mounted.current) {
            setGenerating(false)
            controller.current = null
            if (!input.temporary && knownConversation) {
              markLoading(true)
              try {
                const detail = await readSettled(input.conversationId as string)
                if (requestSequence === sequence.current) {
                  // Keep an unsubmitted user message visible if the server never accepted it.
                  if (
                    detail.messages.some((message) => message.id === input.id)
                  ) {
                    showMessages(restoredMessages(detail))
                    changeView(detail.conversation, false)
                    if (
                      detail.messages.some(
                        (message) =>
                          message.request_id === input.id &&
                          message.role === "assistant" &&
                          message.status === "completed",
                      )
                    )
                      setError(null)
                  }
                  await refreshHistory()
                }
              } catch (failure) {
                if (requestSequence === sequence.current)
                  setHistoryError(failureMessage(failure))
              } finally {
                if (requestSequence === sequence.current) markLoading(false)
              }
            }
          }
        }
      }
      const promise = run()
      running.current = promise
      try {
        await promise
      } finally {
        if (running.current === promise) running.current = null
      }
    },
    [changeView, markLoading, refreshHistory, showMessages],
  )

  const retry = useCallback(() => {
    const previous = lastRequest.current
    if (previous) {
      void send(previous.text, previous)
      return
    }
    const rows = latest.current
    const assistant = rows[rows.length - 1]
    const user = rows[rows.length - 2]
    if (
      user?.role === "user" &&
      assistant?.role === "assistant" &&
      ["error", "cancelled"].includes(assistant.status)
    ) {
      void send(user.content, {
        text: user.content,
        base: rows.slice(0, -2),
        id: user.requestId ?? user.id,
        conversationId: view.current.conversation?.id,
        temporary: view.current.temporary,
      })
    }
  }, [send])

  const clear = async () => {
    if (busy.current) return false
    markLoading(true)
    await cancelForSwitch()
    try {
      if (!view.current.temporary && view.current.conversation) {
        await readSettled(view.current.conversation.id)
        await historyApi.clearConversation(view.current.conversation.id)
      }
      showMessages([])
      setError(null)
      lastRequest.current = null
      setComposerKey((key) => key + 1)
      if (!view.current.temporary)
        await refreshHistory()
          .then((rows) => {
            const updated = rows.find(
              (row) => row.id === view.current.conversation?.id,
            )
            if (updated) changeView(updated, false)
          })
          .catch(() => {})
      return true
    } catch (failure) {
      setHistoryError(failureMessage(failure))
      return false
    } finally {
      markLoading(false)
    }
  }
  const rename = async (id: string, title: string) => {
    try {
      const updated = await historyApi.renameConversation(id, title)
      if (view.current.conversation?.id === id) changeView(updated, false)
      setConversations((rows) =>
        rows.map((row) => (row.id === id ? updated : row)),
      )
      await refreshHistory().catch(() => {})
      return true
    } catch (failure) {
      setHistoryError(failureMessage(failure))
      return false
    }
  }
  const remove = async (id: string) => {
    if (busy.current) return false
    markLoading(true)
    await cancelForSwitch()
    try {
      if (view.current.conversation?.id)
        await readSettled(view.current.conversation.id)
      await historyApi.deleteConversation(id)
      if (view.current.conversation?.id === id) {
        changeView(null, false)
        showMessages([])
        setError(null)
        lastRequest.current = null
        previousNormal.current = null
        setComposerKey((key) => key + 1)
      }
      if (previousNormal.current === id) previousNormal.current = null
      setConversations((rows) => rows.filter((row) => row.id !== id))
      await refreshHistory().catch(() => {})
      return true
    } catch (failure) {
      setHistoryError(failureMessage(failure))
      return false
    } finally {
      markLoading(false)
    }
  }
  const close = () => {
    controller.current?.abort()
    if (view.current.temporary) {
      navigation.current++
      sequence.current++
      changeView(null, false)
      showMessages([])
      setError(null)
      lastRequest.current = null
      controller.current = null
      setGenerating(false)
      markLoading(false)
      setComposerKey((key) => key + 1)
    }
  }

  return {
    messages,
    generating,
    error,
    mode,
    send,
    stop,
    retry,
    clear,
    refreshMode,
    conversation,
    temporary,
    conversations,
    hasMore,
    loading,
    historyError,
    composerKey,
    hasPending: messages.some((message) => message.status === "pending"),
    restore,
    refreshHistory,
    loadMore,
    selectConversation,
    newConversation,
    startTemporary,
    rename,
    remove,
    close,
  }
}
