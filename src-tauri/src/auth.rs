use anyhow::{anyhow, Context, Result};
use std::path::PathBuf;
use std::process::Command;
use std::sync::OnceLock;

/// Resolve the absolute path to the `gh` CLI.
///
/// macOS apps launched from Finder/`open` do not inherit the user's shell
/// PATH, so a bare `gh` lookup fails with `os error 2`. We search common
/// Homebrew/system prefixes first, then fall back to asking a login shell
/// to resolve `gh` from the user's actual shell config.
pub fn resolve_gh() -> Result<PathBuf> {
    static CACHED: OnceLock<Option<PathBuf>> = OnceLock::new();
    if let Some(path) = CACHED.get_or_init(find_gh).clone() {
        return Ok(path);
    }
    Err(anyhow!(
        "GitHub CLI (`gh`) not found in PATH or common locations. \
         Install it from https://cli.github.com/."
    ))
}

fn find_gh() -> Option<PathBuf> {
    const CANDIDATES: &[&str] = &[
        "/opt/homebrew/bin/gh",
        "/usr/local/bin/gh",
        "/usr/bin/gh",
        "/home/linuxbrew/.linuxbrew/bin/gh",
    ];
    for c in CANDIDATES {
        let p = PathBuf::from(c);
        if p.is_file() {
            return Some(p);
        }
    }

    // Fall back: ask a login shell to resolve `gh` using the user's PATH.
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    let out = Command::new(&shell)
        .args(["-lc", "command -v gh"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let path = String::from_utf8(out.stdout).ok()?.trim().to_string();
    if path.is_empty() {
        return None;
    }
    let pb = PathBuf::from(path);
    pb.is_file().then_some(pb)
}

/// Fetch the GitHub OAuth/PAT token currently in use by the local `gh` CLI.
///
/// Token is held only in memory by the caller — never written to disk.
pub fn fetch_gh_token() -> Result<String> {
    let gh = resolve_gh()?;
    let output = Command::new(&gh)
        .args(["auth", "token"])
        .output()
        .map_err(|e| anyhow!("failed to spawn `{}`: {e}", gh.display()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("not logged") || stderr.contains("authentication") {
            return Err(anyhow!(
                "gh CLI is not authenticated. Click \"Sign in with GitHub\"."
            ));
        }
        return Err(anyhow!("`gh auth token` failed: {}", stderr.trim()));
    }

    let token = String::from_utf8(output.stdout)
        .context("gh auth token returned non-UTF8 output")?
        .trim()
        .to_string();

    if token.is_empty() {
        return Err(anyhow!("gh auth token returned empty string"));
    }

    Ok(token)
}
