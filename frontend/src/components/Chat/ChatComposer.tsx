import { ArrowUp, Square } from "lucide-react"
import { useRef, useState } from "react"
import styles from "./chat.module.css"

export function ChatComposer({
  generating,
  onSend,
  onStop,
  disabled = false,
}: {
  generating: boolean
  onSend: (text: string) => void
  onStop: () => void
  disabled?: boolean
}) {
  const [text, setText] = useState("")
  const composing = useRef(false)
  const submit = () => {
    if (generating || disabled || composing.current || !text.trim()) return
    onSend(text.trim())
    setText("")
  }
  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <label className="sr-only" htmlFor="companion-chat-input">
        给小屿的消息
      </label>
      <div className={styles.inputRow}>
        <textarea
          id="companion-chat-input"
          disabled={disabled}
          value={text}
          maxLength={2000}
          rows={2}
          placeholder="慢慢说，我在听…"
          enterKeyHint="send"
          onChange={(event) => setText(event.target.value)}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !composing.current &&
              !event.nativeEvent.isComposing &&
              event.nativeEvent.keyCode !== 229
            ) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {generating ? (
          <button
            className={styles.send}
            type="button"
            onClick={onStop}
            aria-label="停止生成"
          >
            <Square size={15} fill="currentColor" />
          </button>
        ) : (
          <button
            className={styles.send}
            type="submit"
            disabled={disabled || !text.trim()}
            aria-label="发送消息"
          >
            <ArrowUp size={19} />
          </button>
        )}
      </div>
      <div className={styles.inputHint}>
        <span>Enter 发送 · Shift+Enter 换行</span>
        <span>{text.length}/2000</span>
      </div>
    </form>
  )
}
