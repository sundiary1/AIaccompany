import styles from "./chat.module.css"

export function StreamingMessage({ content }: { content: string }) {
  return (
    <p className={styles.messageText}>
      {content || "小屿想一想…"}
      <span className={styles.cursor} aria-hidden="true" />
    </p>
  )
}
