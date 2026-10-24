import styles from "./chat.module.css"
import { StreamingMessage } from "./StreamingMessage"
import type { ConversationMessage } from "./useCompanionChat"

export function ChatMessage({
  message,
  temporary = false,
}: {
  message: ConversationMessage
  temporary?: boolean
}) {
  return (
    <article
      className={styles.message}
      data-role={message.role}
      data-status={message.status}
    >
      <span className={styles.speaker}>
        {message.role === "user" ? "你" : "小屿"}
        {message.safety ? " · 安全支持" : ""}
      </span>
      {message.status === "streaming" ? (
        <StreamingMessage content={message.content} />
      ) : (
        <p className={styles.messageText}>
          {message.content ||
            (message.status === "cancelled"
              ? "本次回复已停止。"
              : "这次没能收到回复。")}
        </p>
      )}
      {message.status === "cancelled" && (
        <small>已停止生成 · 不参与以后上下文</small>
      )}
      {message.status === "pending" && (
        <small>这条回复仍在服务端处理，请稍后刷新历史。</small>
      )}
      {message.status === "error" && (
        <small>未完成的回复不会进入上下文。</small>
      )}
      {!temporary && message.status === "complete" && !message.saved && (
        <small>尚未确认保存，可重试这条消息。</small>
      )}
      {message.finishReason === "length" && (
        <small>已达到本次回复长度限制</small>
      )}
    </article>
  )
}
