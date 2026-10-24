import * as Dialog from "@radix-ui/react-dialog"
import { ArrowLeft, Mail, Plus } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import styles from "./chat.module.css"
import { MemoryConsentDialog } from "./MemoryConsentDialog"
import { MemoryEditor } from "./MemoryEditor"
import type {
  Memory,
  MemoryInput,
  MemorySettings,
  MemoryStatus,
} from "./memory-api"
import * as api from "./memory-api"

const jobErrors: Record<string, string> = {
  memory_json: "提取结果未通过校验，没有成功新增记忆。",
  memory_timeout: "提取超时；不会自动重试。",
  daily_budget: "已达到每日调用上限。",
  interrupted: "上次提取被中断；不会自动重复调用。",
  permission_changed: "授权或设置变更，任务已取消。",
  source_changed: "来源已变化，任务已取消。",
}

export function MemoryMailbox({
  onClose,
  onChanged,
  onSource,
}: {
  onClose: () => void
  onChanged: () => void
  onSource: (id: string) => Promise<boolean>
}) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [settings, setSettings] = useState<MemorySettings | null>(null)
  const [status, setStatus] = useState<MemoryStatus | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<Memory | "new" | null>(null)
  const [consent, setConsent] = useState<"auto" | "use" | null>(null)
  const [deletion, setDeletion] = useState<Memory | "all" | null>(null)
  const back = useRef<HTMLButtonElement>(null)
  const lifecycle = useRef<AbortController | null>(null)
  const read = useCallback(async () => {
    const signal = lifecycle.current?.signal
    const [rows, next, progress] = await Promise.all([
      api.getMemories(signal),
      api.getMemorySettings(signal),
      api.getMemoryStatus(signal),
    ])
    if (signal?.aborted) return
    setMemories(rows)
    setSettings(next)
    setStatus(progress)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    back.current?.focus()
    void read().catch(() => {
      if (!controller.signal.aborted) setError("记忆信箱暂时无法载入，请重试。")
    })
    return () => {
      controller.abort()
      lifecycle.current = null
    }
  }, [read])
  useEffect(() => {
    if (!settings?.auto_extract) return
    const id = window.setInterval(() => {
      if (!busy && !editor && !document.hidden) void read().catch(() => {})
    }, 3000)
    return () => clearInterval(id)
  }, [settings?.auto_extract, busy, editor, read])
  const perform = async (operation: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await operation()
      await read()
      onChanged()
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "操作未成功，请重试。",
      )
    } finally {
      setBusy(false)
    }
  }
  const toggle = (kind: "auto" | "use", value: boolean) => {
    if (value && !settings?.consented_at) {
      setConsent(kind)
      return
    }
    void perform(() =>
      api.setMemorySettings(
        kind === "auto" ? { auto_extract: value } : { use_memories: value },
      ),
    )
  }
  const save = async (body: MemoryInput) =>
    perform(async () => {
      if (editor === "new") await api.createMemory(body)
      else if (editor) await api.patchMemory(editor.id, body)
      setEditor(null)
    })
  const latest = status?.jobs[0]
  return (
    <section
      className={styles.historyDrawer}
      role="dialog"
      aria-label="记忆信箱"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !consent && !deletion) {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <header className={styles.historyHeader}>
        <button
          ref={back}
          className={styles.iconButton}
          type="button"
          aria-label="返回聊天"
          onClick={onClose}
        >
          <ArrowLeft size={19} />
        </button>
        <div>
          <h2>记忆信箱</h2>
          <span>只留下一些真正有用的事</span>
        </div>
        <Mail size={22} strokeWidth={1.2} aria-hidden="true" />
      </header>
      <div className={styles.memoryScroll}>
        <div className={styles.memorySettings}>
          <label>
            <span>
              自动记忆<small>只提取今后的普通聊天，可随时暂停</small>
            </span>
            <input
              type="checkbox"
              aria-label="自动记忆"
              checked={Boolean(settings?.auto_extract)}
              disabled={!settings || busy}
              onChange={(e) => toggle("auto", e.target.checked)}
            />
          </label>
          <label>
            <span>
              使用已有记忆<small>关闭后不向模型注入记忆</small>
            </span>
            <input
              type="checkbox"
              aria-label="使用已有记忆"
              checked={Boolean(settings?.use_memories)}
              disabled={!settings || busy}
              onChange={(e) => toggle("use", e.target.checked)}
            />
          </label>
        </div>
        <p className={styles.memoryPrivacy}>
          临时聊天完全隔离。记忆存放在本机未加密 SQLite；自动提取可能增加模型
          API 费用。
        </p>
        {error && (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => void perform(read)}>
              重新载入
            </button>
          </div>
        )}
        <div className={styles.memoryActions}>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditor("new")}
          >
            <Plus size={15} />
            新增记忆
          </button>
          <button
            type="button"
            disabled={busy || !memories.some((m) => m.source_type === "auto")}
            onClick={() => setDeletion("all")}
          >
            删除全部自动记忆
          </button>
        </div>
        {editor && (
          <MemoryEditor
            key={editor === "new" ? "new" : editor.id}
            memory={editor === "new" ? undefined : editor}
            busy={busy}
            onSave={save}
            onCancel={() => setEditor(null)}
          />
        )}
        {!memories.length && !editor && (
          <div className={styles.historyEmpty}>
            <Mail size={28} />
            <p>信箱还是空的</p>
            <span>自动记忆默认关闭，由你来决定。</span>
          </div>
        )}
        {memories.map((memory) => (
          <article
            key={memory.id}
            className={styles.memoryCard}
            data-review={memory.review_status}
          >
            <div className={styles.memoryTags}>
              <span>{api.memoryCategories[memory.category]}</span>
              <span>
                {memory.source_type === "auto"
                  ? memory.user_edited
                    ? "自动 · 已手动编辑"
                    : "自动"
                  : "手动"}
              </span>
              {memory.review_status === "pending" && <strong>待核对</strong>}
              {Boolean(memory.sensitive) && <span>主动保存的敏感内容</span>}
            </div>
            <p>{memory.content}</p>
            {Boolean(memory.blocked_by_review) && (
              <small>有相关新表达待核对，此条暂不用于聊天。</small>
            )}
            <div className={styles.memoryCardActions}>
              <label>
                <input
                  type="checkbox"
                  aria-label={`启用 ${memory.content}`}
                  checked={Boolean(memory.enabled)}
                  disabled={busy || Boolean(memory.sensitive)}
                  onChange={(e) =>
                    void perform(() =>
                      api.patchMemory(memory.id, { enabled: e.target.checked }),
                    )
                  }
                />
                启用
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditor(memory)}
              >
                {memory.review_status === "pending" ? "核对" : "编辑"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeletion(memory)}
                aria-label={`删除记忆 ${memory.content}`}
              >
                删除
              </button>
            </div>
            <footer>
              <time dateTime={memory.updated_at}>
                {new Date(memory.updated_at).toLocaleString("zh-CN")}
              </time>
              {memory.sources.length ? (
                <details>
                  <summary>来源 · {memory.sources.length} 条</summary>
                  {memory.sources.map((source) => (
                    <div key={source.message_id}>
                      <button
                        type="button"
                        onClick={async () => {
                          if (await onSource(source.conversation_id)) onClose()
                          else
                            setError("来源会话暂时无法载入，请返回聊天后重试。")
                        }}
                      >
                        {source.conversation_title}
                      </button>
                      <blockquote>{source.evidence}</blockquote>
                    </div>
                  ))}
                </details>
              ) : (
                <span>
                  {memory.source_type === "manual"
                    ? "手动添加"
                    : "来源已变更，请核对"}
                </span>
              )}
            </footer>
          </article>
        ))}
        <div className={styles.memoryJobStatus}>
          <strong>提取状态</strong>
          <p>
            {!latest
              ? "尚无提取任务。"
              : latest.status === "pending" || latest.status === "running"
                ? "正在整理，不影响聊天…"
                : latest.status === "completed"
                  ? `最近一次：新增 ${latest.added_count}，更新 ${latest.updated_count}，待核对 ${latest.review_count}。`
                  : (jobErrors[latest.error_code ?? ""] ??
                    "最近一次提取未成功；不会自动重复调用。")}
          </p>
          {latest?.status === "failed" &&
            latest.attempts < (status?.max_attempts ?? 1) &&
            Boolean(settings?.auto_extract) && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void perform(() => api.retryMemoryJob(latest.id))
                }
              >
                重试提取（可能增加 API 费用）
              </button>
            )}
          <small>
            {status?.mode === "mock"
              ? "当前为本地模拟 · 实际 API 调用 0"
              : `提取调用 ${status?.usage.provider_calls ?? 0} 次 · 输入 ${status?.usage.input_tokens ?? 0} / 输出 ${status?.usage.output_tokens ?? 0} tokens（已返回用量）`}
          </small>
        </div>
      </div>
      <MemoryConsentDialog
        key={consent ?? "closed"}
        open={Boolean(consent)}
        auto={consent === "auto"}
        busy={busy}
        onCancel={() => setConsent(null)}
        onConfirm={() =>
          perform(async () => {
            await api.setMemorySettings(
              consent === "auto"
                ? { auto_extract: true, use_memories: true, acknowledge: true }
                : { use_memories: true, acknowledge: true },
            )
            setConsent(null)
          })
        }
      />
      <Dialog.Root
        open={Boolean(deletion)}
        onOpenChange={(next) => {
          if (!next && !busy) setDeletion(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.deleteOverlay} />
          <Dialog.Content
            className={styles.deleteDialog}
            onEscapeKeyDown={(e) => {
              e.stopPropagation()
              if (busy) e.preventDefault()
            }}
          >
            <Dialog.Title>
              {deletion === "all" ? "删除全部自动记忆？" : "删除这条记忆？"}
            </Dialog.Title>
            <Dialog.Description>
              {deletion === "all"
                ? "包含手动修改过的自动条目；手动新增的记忆会保留。"
                : "删除后不会再用于后续对话。"}
              已排队的旧提取任务将取消；今后的新聊天仍按开关设置处理。
            </Dialog.Description>
            <div className={styles.dialogActions}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeletion(null)}
              >
                保留记忆
              </button>
              <button
                className={styles.deleteConfirm}
                type="button"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    if (deletion === "all") await api.deleteAutoMemories()
                    else if (deletion) await api.deleteMemory(deletion.id)
                    setDeletion(null)
                  })
                }
              >
                确认删除记忆
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
