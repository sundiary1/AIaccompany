import { Sprout } from "lucide-react"
import styles from "./chat.module.css"

export function ConversationEmptyState() {
  return (
    <div className={styles.historyEmpty}>
      <Sprout size={32} strokeWidth={1.3} aria-hidden="true" />
      <p>这里还没有对话</p>
      <span>聊过的小事，会留在这里。</span>
    </div>
  )
}
