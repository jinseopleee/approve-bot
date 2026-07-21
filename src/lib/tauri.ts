import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openShell } from "@tauri-apps/plugin-shell";
import type {
  ActivityEntry,
  AppConfig,
  ConnectionStatus,
  GhLoginProgress,
  GhUserHint,
} from "./types";

export const ACTIVITY_EVENT = "approve-bot://activity";
export const STATUS_EVENT = "approve-bot://status-changed";
export const GH_LOGIN_EVENT = "approve-bot://gh-login";

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
  startGhLogin: () => invoke<void>("start_gh_login"),
  getAutostart: () => invoke<boolean>("get_autostart"),
  setAutostart: (enabled: boolean) =>
    invoke<void>("set_autostart", { enabled }),
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

export function onGhLoginProgress(
  cb: (progress: GhLoginProgress) => void,
): Promise<UnlistenFn> {
  return listen<GhLoginProgress>(GH_LOGIN_EVENT, (e) => cb(e.payload));
}

export function openExternal(url: string): Promise<void> {
  return openShell(url);
}
