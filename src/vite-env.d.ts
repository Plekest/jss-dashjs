/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Jspreadsheet Pro licence certificate — see .env.example. */
  readonly VITE_JSS_LICENSE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
