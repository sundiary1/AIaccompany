import * as Dialog from "@radix-ui/react-dialog"
import { useState } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import styles from "./chat.module.css"

export function MemoryConsentDialog({
  open,
  auto,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean
  auto: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [checked, setChecked] = useState(false)
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setChecked(false)
          onCancel()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.deleteOverlay} />
        <Dialog.Content
          className={styles.deleteDialog}
          onEscapeKeyDown={(e) => {
            e.stopPropagation()
            if (busy) e.preventDefault()
          }}
        >
          <Dialog.Title>让小屿记住一些事</Dialog.Title>
          <Dialog.Description>
            开启后，小屿会自动从今后的普通聊天中提取部分长期有用的信息。你可以随时查看、修改或删除。临时聊天不会使用此功能。记忆提取会通过已配置的大模型
            API 处理相关聊天内容。
          </Dialog.Description>
          <p>
            {auto
              ? "本次将开启自动提取和记忆使用；不会扫描此前的历史。"
              : "本次仅开启已有记忆的使用，自动提取仍保持关闭。"}
            提取可能产生额外 API 费用，本机 SQLite 未加密。
          </p>
          <label className={styles.memoryCheck}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            我已了解并授权所选功能
          </label>
          <div className={styles.dialogActions}>
            <IslandButton type="button" onClick={onCancel} disabled={busy}>
              暂不开启
            </IslandButton>
            <IslandButton
              className={styles.deleteConfirm}
              variant="primary"
              type="button"
              disabled={!checked || busy}
              onClick={() => void onConfirm()}
            >
              {busy ? "正在开启…" : "确认开启"}
            </IslandButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
