/// <reference types="vite/client" />

declare module "animal-island-ui/style"

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_DEMO_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
