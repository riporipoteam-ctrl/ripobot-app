// Exact app-owned browser state that belongs in an encrypted full backup.
// Never include cookies, authentication tokens, connection caches or unknown keys.
export const WORKSPACE_BACKUP_CLIENT_KEYS = [
  "ripo-drafts",
  "ripo-draft-attachments",
  "ripo-draft-send-ids",
  "ripo-draft-channel-modes",
  "ripo-skin",
  "ripo-show-threads",
  "ripo-show-run-card",
  "ripo-send-key",
  "ripo-color-user-bubbles",
  "ripobot.sidebarDensity",
  "ripobot.sidebarCollapsedSections.v1",
  "ripobot.sidebarSectionOrder.v1",
  "ripo-analytics-opt-out",
  "ripobot.remote-voice.v1",
] as const;

export type WorkspaceBackupClientState = Partial<Record<(typeof WORKSPACE_BACKUP_CLIENT_KEYS)[number], string>>;
