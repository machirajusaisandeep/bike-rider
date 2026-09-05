/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_BUILD?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ANALYTICS_ENDPOINT?: string;
  readonly VITE_PORTAL?: 'poki' | 'crazygames' | '';
}
