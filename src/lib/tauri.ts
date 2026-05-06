import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openShell } from "@tauri-apps/plugin-shell";
import type {
  ActivityEntry,
  AppConfig,
  ConnectionStatus,
  GhUserHint,
} from "./types";

export const ACTIVITY_EVENT = "approve-bot://activity";
export const STATUS_EVENT = "approve-bot://status-changed";

export const api = {
  getConnectionStatus: () => invoke<ConnectionStatus>("get_connection_status"),
  reconnect: () => invoke<ConnectionStatus>("reconnect"),
  getConfig: () => invoke<AppConfig>("get_config"),
  updateConfig: (config: AppConfig) =>
    invoke<AppConfig>("update_config", { config }),
  getActivityLog: (limit = 100) =>
    invoke<ActivityEntry[]>("get_activity_log", { limit }),
  forceCheckNow: () => invoke<void>("force_check_now"),
  searchUsers: (query: string) =>
    invoke<GhUserHint[]>("search_users", { query }),
};

export function onActivity(
  cb: (entry: ActivityEntry) => void,
): Promise<UnlistenFn> {
  return listen<ActivityEntry>(ACTIVITY_EVENT, (e) => cb(e.payload));
}

export function onStatusChanged(
  cb: (status: ConnectionStatus) => void,
): Promise<UnlistenFn> {
  return listen<ConnectionStatus>(STATUS_EVENT, (e) => cb(e.payload));
}

export function openExternal(url: string): Promise<void> {
  return openShell(url);
}
