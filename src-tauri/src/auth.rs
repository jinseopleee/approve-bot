use anyhow::{anyhow, Context, Result};
use std::process::Command;

/// Fetch the GitHub OAuth/PAT token currently in use by the local `gh` CLI.
///
/// Token is held only in memory by the caller — never written to disk.
pub fn fetch_gh_token() -> Result<String> {
    let output = Command::new("gh")
        .args(["auth", "token"])
        .output()
        .map_err(|e| {
            anyhow!(
                "failed to spawn `gh`: {e}. Install GitHub CLI from https://cli.github.com/."
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("not logged") || stderr.contains("authentication") {
            return Err(anyhow!(
                "gh CLI is not authenticated. Run `gh auth login` first."
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
