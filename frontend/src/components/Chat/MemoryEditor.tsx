import { useState } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import styles from "./chat.module.css"
import {
  type Memory,
  type MemoryCategory,
  type MemoryInput,
  memoryCategories,
} from "./memory-api"

export function MemoryEditor({
  memory,
  busy,
  onSave,
  onCancel,
}: {
  memory?: Memory
  busy: boolean
  onSave: (body: MemoryInput) => Promise<void>
  onCancel: () => void
}) {
  const [content, setContent] = useState(memory?.content ?? "")
  const [category, setCategory] = useState<MemoryCategory>(
    memory?.category ?? "fact",
  )
  const [enabled, setEnabled] = useState(
    memory ? Boolean(memory.enabled) : true,
  )
  const [sensitive, setSensitive] = useState(false)
  const pending = memory?.review_status === "pending"
  return (
    <form
      className={styles.memoryEditor}
      onSubmit={(event) => {
        event.preventDefault()
        void onSave({
          content: content.trim(),
          category,
          enabled,
          allow_sensitive: sensitive,
          review_status: "approved",
          resolve_conflict: pending,
        })
      }}
    >
      <label>
        记忆内容
        <textarea
          aria-label="记忆内容"
          value={content}
          maxLength={240}
          rows={3}
          onChange={(e) => setContent(e.target.value)}
          required
        />
      </label>
      <label>
        分类
        <select
          aria-label="分类"
          value={category}
          onChange={(e) => setCategory(e.target.value as MemoryCategory)}
        >
          {Object.entries(memoryCategories).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.memoryCheck}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        允许在普通聊天中参考（还需开启全局使用开关）
      </label>
      <label className={styles.memoryCheck}>
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(e) => setSensitive(e.target.checked)}
        />
        如含敏感经历，我明确主动保存并允许所选的使用方式
      </label>
      {pending && <p>保存表示已核对；如有关联旧记忆，将停用旧条目。</p>}
      <small>
        不要保存密码、API Key 或身份号码。手动保存后，自动任务不会覆盖你的编辑。
      </small>
      <div className={styles.dialogActions}>
        <IslandButton type="button" onClick={onCancel} disabled={busy}>
          取消编辑
        </IslandButton>
        <IslandButton
          className={styles.deleteConfirm}
          variant="primary"
          type="submit"
          disabled={busy || !content.trim()}
        >
          {busy ? "正在保存…" : pending ? "核对并保存" : "保存记忆"}
        </IslandButton>
      </div>
    </form>
  )
}
