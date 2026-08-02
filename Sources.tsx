/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  /** PUBLISHABLE / anon key only. Never a secret key. */
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_URL: string
  /** Google Cloud OAuth "Web application" client ID — used by native sign-in. */
  readonly VITE_GOOGLE_WEB_CLIENT_ID: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
