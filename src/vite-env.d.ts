/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CODEX_PET_RELEASE_CHANNEL?: "official" | "dev";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
