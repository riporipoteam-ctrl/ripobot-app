import { describe, expect, it } from "vitest";
import { applyWorkspaceClientState, collectWorkspaceClientState } from "./workspace-backup-client";
import { SEND_KEY_KEY } from "./send-key";

function memory(values: Record<string, string>) {
  const entries = new Map(Object.entries(values));
  return { entries, getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}

describe("full-backup browser state", () => {
  it("exports exact app drafts/preferences, never saved webhook credentials or auth/cache keys", () => {
    const storage = memory({ "ripo-drafts": "draft", "ripo-webhook-credentials": "private URL", "ripo-skin": "daylight", "auth-token": "secret", "ripo-connected-apps": "cached accounts", "ripo-email-gate": "identity", "ripo-pending-workspace-restore": "old" });
    expect(collectWorkspaceClientState(storage)).toEqual({ "ripo-drafts": "draft", "ripo-skin": "daylight" });
  });

  it("replaces only allowlisted keys and clears old drafts absent from the backup", () => {
    const storage = memory({ "ripo-drafts": "old", "ripo-draft-attachments": "old attachment", "auth-token": "keep", "ripo-webhook-credentials": "destination URL" });
    applyWorkspaceClientState({ "ripo-drafts": "restored", "ripo-show-threads": "false" }, storage);
    expect(Object.fromEntries(storage.entries)).toEqual({ "ripo-drafts": "restored", "ripo-show-threads": "false", "auth-token": "keep", "ripo-webhook-credentials": "destination URL" });
  });

  it("carries the run card visibility choice in a workspace backup", () => {
    const storage = memory({ "ripo-show-run-card": "0" });
    expect(collectWorkspaceClientState(storage)).toEqual({ "ripo-show-run-card": "0" });
    applyWorkspaceClientState({ "ripo-show-run-card": "1" }, storage);
    expect(storage.getItem("ripo-show-run-card")).toBe("1");
  });

  it("carries the send key choice in a workspace backup", () => {
    const storage = memory({ [SEND_KEY_KEY]: "mod-enter" });
    expect(collectWorkspaceClientState(storage)).toEqual({ "ripo-send-key": "mod-enter" });
    applyWorkspaceClientState({ "ripo-send-key": "enter" }, storage);
    expect(storage.getItem(SEND_KEY_KEY)).toBe("enter");
  });

  it("carries the message color choice and leaves older backups opted out", () => {
    const storage = memory({ "ripo-color-user-bubbles": "1" });
    expect(collectWorkspaceClientState(storage)).toEqual({ "ripo-color-user-bubbles": "1" });
    applyWorkspaceClientState({ "ripo-color-user-bubbles": "0" }, storage);
    expect(storage.getItem("ripo-color-user-bubbles")).toBe("0");
    applyWorkspaceClientState({}, storage);
    expect(storage.getItem("ripo-color-user-bubbles")).toBeNull();
  });

  it.each([null, [], { "auth-token": "injected" }, { "ripo-webhook-credentials": "source URL" }, { "ripo-drafts": 1 }])("rejects invalid client state before clearing anything (%j)", (value) => {
    const storage = memory({ "ripo-drafts": "old", "auth-token": "keep" });
    expect(() => applyWorkspaceClientState(value, storage)).toThrow("Invalid backup browser state");
    expect(Object.fromEntries(storage.entries)).toEqual({ "ripo-drafts": "old", "auth-token": "keep" });
  });

  it("rolls browser state back if restored values exceed storage quota", () => {
    const storage = memory({ "ripo-drafts": "old", "ripo-skin": "daylight", "auth-token": "keep" });
    const original = storage.setItem;
    storage.setItem = (key, value) => { if (value === "too large") throw new Error("quota"); original(key, value); };
    expect(() => applyWorkspaceClientState({ "ripo-drafts": "too large" }, storage)).toThrow("quota");
    expect(Object.fromEntries(storage.entries)).toEqual({ "ripo-drafts": "old", "ripo-skin": "daylight", "auth-token": "keep" });
  });
});
