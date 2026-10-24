import { Leaf } from "lucide-react"
import styles from "./chat.module.css"

export function EmptyChat() {
  return (
    <div className={styles.empty}>
      <Leaf size={30} strokeWidth={1.2} aria-hidden="true" />
      <p>
        你好，我是小屿。
        <br />
        想和我聊聊吗？
      </p>
      <span>从今天的一件小事开始，也很好。</span>
    </div>
  )
}
