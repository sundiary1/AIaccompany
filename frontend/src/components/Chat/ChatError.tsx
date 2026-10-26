import { IslandButton } from "../IslandUI/IslandButton"
import styles from "./chat.module.css"
import type { ChatFailure } from "./useCompanionChat"

export function ChatError({
  error,
  onRetry,
}: {
  error: ChatFailure
  onRetry: () => void
}) {
  return (
    <div className={styles.error} role="alert">
      <p>{error.message}</p>
      <IslandButton type="button" onClick={onRetry}>
        {error.retryable ? "重试这条消息" : "检查配置后重试"}
      </IslandButton>
    </div>
  )
}
