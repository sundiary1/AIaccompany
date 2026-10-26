import { ILLUSTRATED_TEMPLATES } from "./illustrated-templates"

export type Region = { id: string; d: string }
export type MandalaTemplate = {
  id: string
  name: string
  regions: readonly Region[]
}

export const TEMPLATES = ILLUSTRATED_TEMPLATES

export function getTemplate(id: string) {
  return TEMPLATES.find((template) => template.id === id)
}
