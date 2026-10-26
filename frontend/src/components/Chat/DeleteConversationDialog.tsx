import * as Dialog from "@radix-ui/react-dialog"
import { useState } from "react"
import { IslandButton } from "../IslandUI/IslandButton"
import styles from "./chat.module.css"

type Props = {
  open: boolean
  title: string
  clearOnly?: boolean
  onCancel: () => void
  onConfirm: () => Promise<boolean>
}
export function DeleteConversationDialog({
  open,
  title,
  clearOnly = false,
  onCancel,
  onConfirm,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setFailed(false)
          onCancel()
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.deleteOverlay} />
        <Dialog.Content
          className={styles.deleteDialog}
          onEscapeKeyDown={(event) => {
            event.stopPropagation()
            if (busy) event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault()
          }}
        >
          <Dialog.Title>
            {clearOnly ? "清空当前聊天？" : "删除这段对话？"}
          </Dialog.Title>
          <Dialog.Description>
            “{title}”{clearOnly ? "中的所有消息" : "及其全部消息"}
            将从本机历史中删除，无法恢复。正在生成的回复会先停止。
          </Dialog.Description>
          {failed && (
            <p role="alert">操作未确认成功，请关闭此窗口查看提示后重试。</p>
          )}
          <div className={styles.dialogActions}>
            <IslandButton
              type="button"
              onClick={() => {
                setFailed(false)
                onCancel()
              }}
              disabled={busy}
            >
              保留
            </IslandButton>
            <IslandButton
              type="button"
              disabled={busy}
              className={styles.deleteConfirm}
              variant="primary"
              danger
              data-danger="true"
              onClick={async () => {
                setBusy(true)
                try {
                  const success = await onConfirm()
                  setFailed(!success)
                  if (success) onCancel()
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? "正在处理…" : clearOnly ? "确认清空" : "确认删除"}
            </IslandButton>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
