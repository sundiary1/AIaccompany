import { ConversationEmptyState } from "./ConversationEmptyState"
import { ConversationItem } from "./ConversationItem"
import styles from "./chat.module.css"
import type { Conversation } from "./conversation-api"

type Props = {
  conversations: Conversation[]
  activeId?: string
  disabled: boolean
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => Promise<boolean>
  onDelete: (conversation: Conversation) => void
}
export function ConversationList({
  conversations,
  activeId,
  disabled,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  if (!conversations.length) return <ConversationEmptyState />
  return (
    <ul className={styles.conversationList}>
      {conversations.map((conversation) => (
        <ConversationItem
          key={conversation.id}
          conversation={conversation}
          active={conversation.id === activeId}
          disabled={disabled}
          onSelect={() => onSelect(conversation.id)}
          onRename={(title) => onRename(conversation.id, title)}
          onDelete={() => onDelete(conversation)}
        />
      ))}
    </ul>
  )
}
