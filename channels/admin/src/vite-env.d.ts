/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADMIN_TOKEN?: string
  readonly VITE_ADMIN_API_ORIGIN?: string
  readonly VITE_POLL_INTERVAL_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
