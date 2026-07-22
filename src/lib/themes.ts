// Per-user sidebar color themes for a workspace (Slack-style). Dependency-free
// so both the server (layout/route) and client (settings/sidebar) can import it.

export type ChatTheme = {
  label: string;
  /** Sidebar background. */
  sidebar: string;
  /** Active channel/DM background + accent. */
  active: string;
};

export const CHAT_THEMES: Record<string, ChatTheme> = {
  aubergine: { label: "Aubergine", sidebar: "#3f0e40", active: "#1164a3" },
  forest: { label: "Forest", sidebar: "#0b3d2e", active: "#1a7f5a" },
  ocean: { label: "Ocean", sidebar: "#12344d", active: "#2a7ab0" },
  sunset: { label: "Sunset", sidebar: "#4a1d2f", active: "#c2410c" },
  amethyst: { label: "Amethyst", sidebar: "#2b1a4a", active: "#7c3aed" },
  graphite: { label: "Graphite", sidebar: "#1f2937", active: "#4b5563" },
};

export const DEFAULT_THEME = "aubergine";

export function themeFor(key: string | null | undefined): ChatTheme {
  return CHAT_THEMES[key ?? ""] ?? CHAT_THEMES[DEFAULT_THEME];
}

export function isChatTheme(key: string): boolean {
  return key in CHAT_THEMES;
}
