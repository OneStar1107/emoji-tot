/// <reference types="vite/client" />

/**
 * The desktop's settings schema, aliased in by vite.config.ts so the docs page
 * can print the real page count instead of a typed one.
 */
declare module '@emojitot/settings-schema' {
  export const PAGE_MANIFEST: readonly { key: string; title: string }[];
  export const DEFAULTS: Record<string, unknown>;
  export const SETTINGS_NAV: readonly {
    id: string;
    title: string;
    items: readonly { key: string; label: string; icon: string }[];
  }[];
}
