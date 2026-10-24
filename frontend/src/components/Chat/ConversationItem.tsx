import { Check, Pencil, Trash2, X } from "lucide-react"
import { useState } from "react"
import styles from "./chat.module.css"
import type { Conversation } from "./conversation-api"

type Props = {
  conversation: Conversation
  active: boolean
  disabled: boolean
  onSelect: () => void
  onRename: (title: string) => Promise<boolean>
  onDelete: () => void
}
export function ConversationItem({
  conversation,
  active,
  disabled,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  return (
    <li className={styles.conversationItem} data-active={active}>
      {editing ? (
        <form
          className={styles.renameForm}
          onSubmit={async (event) => {
            event.preventDefault()
            if (title.trim() && (await onRename(title.trim())))
              setEditing(false)
          }}
        >
          <label className="sr-only" htmlFor={`rename-${conversation.id}`}>
            会话标题
          </label>
          <input
            id={`rename-${conversation.id}`}
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
            disabled={disabled}
          />
          <button
            type="submit"
            aria-label="保存标题"
            disabled={disabled || !title.trim()}
          >
            <Check size={17} />
          </button>
          <button
            type="button"
            aria-label="取消重命名"
            onClick={() => setEditing(false)}
          >
            <X size={17} />
          </button>
        </form>
      ) : (
        <>
          <button
            className={styles.conversationSelect}
            type="button"
            onClick={onSelect}
            disabled={disabled}
            aria-current={active ? "true" : undefined}
          >
            <span>{conversation.title}</span>
            <time dateTime={conversation.updated_at}>
              {new Date(conversation.updated_at).toLocaleString("zh-CN", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </button>
          <button
            className={styles.iconButton}
            type="button"
            aria-label={`重命名 ${conversation.title}`}
            disabled={disabled}
            onClick={() => {
              setTitle(conversation.title)
              setEditing(true)
            }}
          >
            <Pencil size={16} />
          </button>
          <button
            className={styles.iconButton}
            type="button"
            aria-label={`删除 ${conversation.title}`}
            disabled={disabled}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
    </li>
  )
}
