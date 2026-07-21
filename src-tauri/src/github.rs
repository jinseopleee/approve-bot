use anyhow::{anyhow, Result};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};

const API: &str = "https://api.github.com";
const UA: &str = "approve-bot/0.1.0";

/// Default approval comment used when the user leaves the approval message blank.
/// GitHub comments only render images from public URLs, so this points at the
/// app icon committed to the public repo (rendered at 32x32 via HTML <img>).
const DEFAULT_APPROVE_BODY: &str = concat!(
    "<img src=\"https://raw.githubusercontent.com/jinseopleee/approve-bot/main/src-tauri/icons/32x32.png\" ",
    "width=\"32\" height=\"32\" alt=\"따봉\" /> 따봉"
);

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GhUser {
    pub login: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GhUserHint {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UserSearchResp {
    items: Vec<GhUserHint>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub draft: bool,
    pub html_url: String,
    pub user: GhUser,
}

#[derive(Debug, Deserialize)]
pub struct Review {
    pub user: GhUser,
    pub state: String,
}

#[derive(Debug, Clone)]
pub struct RateLimit {
    pub remaining: Option<u64>,
    pub limit: Option<u64>,
}

pub struct GitHubClient {
    http: Client,
    token: String,
}

impl GitHubClient {
    pub fn new(token: String) -> Self {
        Self {
            http: Client::builder()
                .build()
                .expect("failed to build reqwest client"),
            token,
        }
    }

    fn headers(&self) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(USER_AGENT, HeaderValue::from_static(UA));
        h.insert(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github+json"),
        );
        h.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.token))
                .expect("token contains invalid header chars"),
        );
        h.insert(
            "X-GitHub-Api-Version",
            HeaderValue::from_static("2022-11-28"),
        );
        h
    }

    fn extract_rate(headers: &reqwest::header::HeaderMap) -> RateLimit {
        let parse =
            |name: &str| -> Option<u64> { headers.get(name)?.to_str().ok()?.parse().ok() };
        RateLimit {
            remaining: parse("x-ratelimit-remaining"),
            limit: parse("x-ratelimit-limit"),
        }
    }

    pub async fn get_user(&self) -> Result<(GhUser, RateLimit)> {
        let url = format!("{API}/user");
        let resp = self
            .http
            .get(&url)
            .headers(self.headers())
            .send()
            .await?;
        let rate = Self::extract_rate(resp.headers());
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("GET /user failed: {status} {body}"));
        }
        let user: GhUser = resp.json().await?;
        Ok((user, rate))
    }

    pub async fn list_open_pulls(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<(Vec<PullRequest>, RateLimit)> {
        let url = format!(
            "{API}/repos/{owner}/{repo}/pulls?state=open&per_page=100&sort=created&direction=desc"
        );
        let resp = self
            .http
            .get(&url)
            .headers(self.headers())
            .send()
            .await?;
        let rate = Self::extract_rate(resp.headers());
        let status = resp.status();
        if status == StatusCode::NOT_FOUND {
            return Err(anyhow!("repository {owner}/{repo} not found (404)"));
        }
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("list pulls failed: {status} {body}"));
        }
        let pulls: Vec<PullRequest> = resp.json().await?;
        Ok((pulls, rate))
    }

    pub async fn list_reviews(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
    ) -> Result<Vec<Review>> {
        let url = format!("{API}/repos/{owner}/{repo}/pulls/{number}/reviews?per_page=100");
        let resp = self
            .http
            .get(&url)
            .headers(self.headers())
            .send()
            .await?;
        if !resp.status().is_success() {
            let s = resp.status();
            let b = resp.text().await.unwrap_or_default();
            return Err(anyhow!("list reviews failed: {s} {b}"));
        }
        Ok(resp.json().await?)
    }

    pub async fn search_users(&self, query: &str, limit: u8) -> Result<Vec<GhUserHint>> {
        let q = query.trim();
        if q.is_empty() {
            return Ok(vec![]);
        }
        // Match user logins that start with the prefix; falls back to fuzzy if no prefix hits.
        let q_param = format!("{q} in:login type:user");
        let url = format!("{API}/search/users");
        let resp = self
            .http
            .get(&url)
            .headers(self.headers())
            .query(&[
                ("q", q_param.as_str()),
                ("per_page", &limit.to_string()),
            ])
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("user search failed: {status} {body}"));
        }
        let parsed: UserSearchResp = resp.json().await?;
        Ok(parsed.items)
    }

    pub async fn approve_pull(
        &self,
        owner: &str,
        repo: &str,
        number: u64,
        body: Option<&str>,
    ) -> Result<()> {
        let url = format!("{API}/repos/{owner}/{repo}/pulls/{number}/reviews");
        let mut payload = serde_json::Map::new();
        payload.insert("event".into(), serde_json::Value::String("APPROVE".into()));
        // Fall back to the default "따봉" comment when no message is configured.
        let comment = match body {
            Some(b) if !b.trim().is_empty() => b,
            _ => DEFAULT_APPROVE_BODY,
        };
        payload.insert(
            "body".into(),
            serde_json::Value::String(comment.to_string()),
        );
        let resp = self
            .http
            .post(&url)
            .headers(self.headers())
            .json(&serde_json::Value::Object(payload))
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            return Err(anyhow!("approve failed: {status} {body}"));
        }
        Ok(())
    }
}

/// Parse "owner/repo" into (owner, repo). Trims whitespace and rejects malformed entries.
pub fn split_repo(full: &str) -> Result<(&str, &str)> {
    let trimmed = full.trim();
    let mut parts = trimmed.splitn(2, '/');
    let owner = parts
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow!("invalid repo `{full}`: expected owner/repo"))?;
    let repo = parts
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| anyhow!("invalid repo `{full}`: expected owner/repo"))?;
    if repo.contains('/') {
        return Err(anyhow!("invalid repo `{full}`: too many slashes"));
    }
    Ok((owner, repo))
}
