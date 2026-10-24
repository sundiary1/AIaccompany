import { ArrowLeft, Feather, Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ConversationList } from "./ConversationList"
import styles from "./chat.module.css"
import type { Conversation } from "./conversation-api"
import { DeleteConversationDialog } from "./DeleteConversationDialog"
import type { useCompanionChat } from "./useCompanionChat"

export function ConversationDrawer({
  chat,
  onClose,
}: {
  chat: ReturnType<typeof useCompanionChat>
  onClose: () => void
}) {
  const [deleting, setDeleting] = useState<Conversation | null>(null)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    void chat.refreshHistory().catch(() => {})
  }, [chat.refreshHistory])
  return (
    <section
      className={styles.historyDrawer}
      role="dialog"
      aria-label="历史对话"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !deleting) {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <header className={styles.historyHeader}>
        <button
          ref={close}
          className={styles.iconButton}
          type="button"
          aria-label="返回聊天"
          onClick={onClose}
        >
          <ArrowLeft size={19} />
        </button>
        <div>
          <h2>留在岛上的话</h2>
          <span>历史对话</span>
        </div>
      </header>
      <div className={styles.historyActions}>
        <button
          type="button"
          disabled={chat.loading}
          onClick={async () => {
            if (await chat.newConversation()) onClose()
          }}
        >
          <Plus size={16} />
          新的对话
        </button>
        <button
          type="button"
          disabled={chat.loading}
          onClick={async () => {
            if (await chat.startTemporary()) onClose()
          }}
          className={styles.temporaryAction}
        >
          <Feather size={16} />
          临时聊天
        </button>
      </div>
      <p className={styles.historyPrivacy}>
        历史保存在本机 Demo
        服务端，不是长期记忆。临时聊天不保存，关闭或刷新后清除。
      </p>
      {chat.historyError && (
        <div className={styles.error} role="alert">
          <p>{chat.historyError}</p>
          <button
            type="button"
            onClick={() => void chat.refreshHistory().catch(() => {})}
          >
            重新载入历史
          </button>
        </div>
      )}
      <div className={styles.historyScroll}>
        <ConversationList
          conversations={chat.conversations}
          activeId={chat.conversation?.id}
          disabled={chat.loading}
          onSelect={async (id) => {
            if (await chat.selectConversation(id)) onClose()
          }}
          onRename={chat.rename}
          onDelete={setDeleting}
        />
        {chat.hasMore && (
          <button
            className={styles.loadMore}
            type="button"
            disabled={chat.loading}
            onClick={() => void chat.loadMore()}
          >
            查看更多对话
          </button>
        )}
      </div>
      <div className={styles.historyFooter} role="status">
        {chat.loading ? "正在整理对话…" : "只保留你选择保存的聊天"}
      </div>
      <DeleteConversationDialog
        open={Boolean(deleting)}
        title={deleting?.title ?? ""}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? chat.remove(deleting.id) : Promise.resolve(false)
        }
      />
    </section>
  )
}
