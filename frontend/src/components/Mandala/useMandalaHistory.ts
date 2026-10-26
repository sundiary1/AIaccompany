import { useState } from "react"
import type { MandalaWork } from "./mandala-data"
import { TEMPLATES } from "./templates"

type History = {
  past: MandalaWork[]
  present: MandalaWork
  future: MandalaWork[]
}
export function useMandalaHistory() {
  const [history, setHistory] = useState<History>({
    past: [],
    present: {
      version: 1,
      mode: "coloring",
      templateId: TEMPLATES[0].id,
      fills: {},
    },
    future: [],
  })
  const reset = (present: MandalaWork) =>
    setHistory({ past: [], present, future: [] })
  const commit = (present: MandalaWork) =>
    setHistory((old) => ({
      past: [...old.past.slice(-59), old.present],
      present,
      future: [],
    }))
  const undo = () =>
    setHistory((old) =>
      !old.past.length
        ? old
        : {
            past: old.past.slice(0, -1),
            present: old.past[old.past.length - 1],
            future: [old.present, ...old.future],
          },
    )
  const redo = () =>
    setHistory((old) =>
      !old.future.length
        ? old
        : {
            past: [...old.past, old.present],
            present: old.future[0],
            future: old.future.slice(1),
          },
    )
  return {
    work: history.present,
    reset,
    commit,
    undo,
    redo,
    canUndo: !!history.past.length,
    canRedo: !!history.future.length,
  }
}
