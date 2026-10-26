import {
  ChevronDown,
  ChevronUp,
  History,
  Hourglass,
  Leaf,
  MessageCircle,
  Trash2,
  X,
} from "lucide-react"
import { type CSSProperties, useEffect, useRef, useState } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import { ChatComposer } from "./ChatComposer"
import { ChatError } from "./ChatError"
import { ChatMessage } from "./ChatMessage"
import { ConversationDrawer } from "./ConversationDrawer"
import styles from "./chat.module.css"
import { DeleteConversationDialog } from "./DeleteConversationDialog"
import { MemoryMailbox } from "./MemoryMailbox"
import type { useCompanionChat } from "./useCompanionChat"
import { useMemoryStatus } from "./useMemoryStatus"

type ChatPanelProps = {
  open: boolean
  chat: ReturnType<typeof useCompanionChat>
  onClose: () => void
  onExpandedChange: (expanded: boolean) => void
}

export function ChatPanel({
  open,
  chat,
  onClose,
  onExpandedChange,
}: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [viewport, setViewport] = useState({
    height: window.visualViewport?.height ?? window.innerHeight,
    top: 0,
  })
  const scroll = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const historyButton = useRef<HTMLButtonElement>(null)
  const memoryButton = useRef<HTMLButtonElement>(null)
  const memory = useMemoryStatus(open && !chat.temporary, chat.generating)
  const stickToBottom = useRef(true)
  const { refreshMode, restore } = chat
  useEffect(() => {
    if (open) {
      void restore()
      return refreshMode()
    }
    setHistoryOpen(false)
    setMemoryOpen(false)
  }, [open, refreshMode, restore])
  useEffect(() => {
    if (!open) return
    close.current?.focus({ preventScroll: true })
    const update = () =>
      setViewport({
        height: window.visualViewport?.height ?? window.innerHeight,
        top: window.visualViewport?.offsetTop ?? 0,
      })
    update()
    window.visualViewport?.addEventListener("resize", update)
    window.visualViewport?.addEventListener("scroll", update)
    window.addEventListener("resize", update)
    return () => {
      window.visualViewport?.removeEventListener("resize", update)
      window.visualViewport?.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [open])
  const lastMessage = chat.messages[chat.messages.length - 1]
  useEffect(() => {
    if (!open) setExpanded(false)
  }, [open])
  useEffect(() => {
    if (!open || !lastMessage || !stickToBottom.current) return
    const list = scroll.current
    if (list) list.scrollTop = list.scrollHeight
  }, [open, lastMessage])
  if (!open) return null
  const modeLabel = {
    mock: "模拟",
    live: "",
    unconfigured: "未配置",
    offline: "未连接",
  }[chat.mode]
  return (
    <div
      className={styles.viewport}
      style={
        {
          "--chat-vp-height": `${viewport.height}px`,
          "--chat-vp-top": `${viewport.top}px`,
        } as CSSProperties
      }
    >
      <section
        className={styles.panel}
        data-expanded={expanded}
        role="dialog"
        aria-modal="false"
        aria-labelledby="companion-chat-title"
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            !event.nativeEvent.isComposing &&
            !event.defaultPrevented &&
            !historyOpen &&
            !memoryOpen &&
            !clearOpen
          ) {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <div
          className={styles.chatContent}
          inert={historyOpen || memoryOpen}
          aria-hidden={historyOpen || memoryOpen}
        >
          <header className={styles.header}>
            <div className={styles.heading}>
              <h2 id="companion-chat-title">
                {chat.temporary ? "临时聊天" : "小屿"}
              </h2>
              {modeLabel && <span data-testid="chat-mode">{modeLabel}</span>}
            </div>
            {!chat.temporary && (
              <IslandButton
                className={styles.iconButton}
                ref={memoryButton}
                type="button"
                aria-label="记忆信箱"
                title="记忆信箱"
                onClick={() => setMemoryOpen(true)}
              >
                <Leaf size={19} />
              </IslandButton>
            )}
            <IslandButton
              className={styles.iconButton}
              type="button"
              aria-label={chat.temporary ? "普通聊天" : "临时聊天"}
              aria-pressed={chat.temporary}
              title={
                chat.temporary ? "返回普通聊天" : "临时聊天 · 关闭或刷新后清除"
              }
              disabled={chat.loading}
              onClick={() => {
                if (chat.temporary) void chat.restore()
                else void chat.startTemporary()
              }}
            >
              {chat.temporary ? (
                <MessageCircle size={18} />
              ) : (
                <Hourglass size={18} />
              )}
            </IslandButton>
            <IslandButton
              className={styles.iconButton}
              type="button"
              aria-label="历史对话"
              ref={historyButton}
              onClick={() => setHistoryOpen(true)}
            >
              <History size={19} />
            </IslandButton>
            <IslandButton
              className={`${styles.iconButton} ${styles.expand}`}
              type="button"
              aria-label={expanded ? "收起聊天面板" : "扩大聊天面板"}
              aria-expanded={expanded}
              onClick={() => {
                setExpanded(!expanded)
                onExpandedChange(!expanded)
              }}
            >
              {expanded ? <ChevronDown size={19} /> : <ChevronUp size={19} />}
            </IslandButton>
            <IslandButton
              className={styles.iconButton}
              type="button"
              onClick={() => {
                if (chat.temporary) void chat.clear()
                else setClearOpen(true)
              }}
              disabled={chat.loading || !chat.messages.length}
              aria-label="清空当前聊天"
            >
              <Trash2 size={17} />
            </IslandButton>
            <IslandButton
              ref={close}
              className={styles.iconButton}
              type="button"
              onClick={onClose}
              aria-label="关闭聊天"
            >
              <X size={20} />
            </IslandButton>
          </header>
          {memory.notice && !chat.temporary && (
            <div className={styles.memoryNotice} role="status">
              <span>{memory.notice}</span>
              <IslandButton
                type="button"
                onClick={() => {
                  memory.dismiss()
                  setMemoryOpen(true)
                }}
              >
                查看
              </IslandButton>
              <IslandButton
                type="button"
                aria-label="忽略记忆提示"
                onClick={memory.dismiss}
              >
                ×
              </IslandButton>
            </div>
          )}
          {lastMessage?.memoryWarning && !chat.temporary && (
            <p className={styles.historyWarning} role="alert">
              本次长期记忆处理暂不可用；聊天记录已保存，没有确认新增记忆。
            </p>
          )}
          {chat.historyError && !chat.temporary && (
            <div className={styles.historyWarning} role="alert">
              <span>{chat.historyError}</span>
              <IslandButton type="button" onClick={() => void chat.restore()}>
                重新载入
              </IslandButton>
            </div>
          )}
          <div
            className={styles.messages}
            ref={scroll}
            role="log"
            aria-live="off"
            aria-label="当前对话"
            onScroll={() => {
              const list = scroll.current
              if (list)
                stickToBottom.current =
                  list.scrollHeight - list.scrollTop - list.clientHeight < 64
            }}
          >
            {chat.messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                temporary={chat.temporary}
              />
            ))}
            {chat.error && (
              <ChatError error={chat.error} onRetry={chat.retry} />
            )}
            {chat.hasPending && (
              <p className={styles.historyWarning}>
                有回复尚在服务端处理。
                <IslandButton type="button" onClick={() => void chat.restore()}>
                  刷新历史
                </IslandButton>
              </p>
            )}
          </div>
          <div className="sr-only" role="status" aria-live="polite">
            {chat.generating
              ? "小屿正在回复…"
              : chat.loading
                ? "正在确认历史状态…"
                : ""}
          </div>
          <ChatComposer
            key={chat.composerKey}
            generating={chat.generating}
            disabled={
              chat.loading ||
              chat.hasPending ||
              (!chat.temporary && Boolean(chat.historyError))
            }
            onSend={(text) => {
              stickToBottom.current = true
              void chat.send(text)
            }}
            onStop={chat.stop}
          />
        </div>
        {historyOpen && (
          <ConversationDrawer
            chat={chat}
            onClose={() => {
              setHistoryOpen(false)
              requestAnimationFrame(() => historyButton.current?.focus())
            }}
          />
        )}
        {memoryOpen && !chat.temporary && (
          <MemoryMailbox
            onClose={() => {
              setMemoryOpen(false)
              requestAnimationFrame(() => memoryButton.current?.focus())
            }}
            onChanged={memory.refresh}
            onSource={chat.selectConversation}
          />
        )}
        <DeleteConversationDialog
          open={clearOpen}
          title={chat.conversation?.title ?? "当前聊天"}
          clearOnly
          onCancel={() => setClearOpen(false)}
          onConfirm={chat.clear}
        />
      </section>
    </div>
  )
}
