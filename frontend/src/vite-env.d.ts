/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_STEAM_ENABLED: boolean;
	readonly VITE_SERVER_ARCHIVE?: string;
	readonly WISP_URL: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
