use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DevNotesSettings {
    /// Empty means no password has been set yet — the tab prompts to set one.
    pub password_hash: String,
    pub notes: String,
}

impl Default for DevNotesSettings {
    fn default() -> Self {
        Self {
            password_hash: String::new(),
            notes: String::new(),
        }
    }
}

pub fn hash_password(pw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(pw.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn verify_password(pw: &str, hash: &str) -> bool {
    !hash.is_empty() && hash_password(pw) == hash
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevSession {
    pub ts: String,
    pub session_id: String,
    pub title: String,
    pub working_dir: String,
    pub resume_hint: String,
}

// Baked in at compile time — appended to by hand whenever a dev session touches
// this app (no automatic hook can populate this; see feedback-dev-notes-tab).
const DEV_SESSIONS_JSONL: &str = include_str!("../dev_sessions.jsonl");

pub fn dev_sessions() -> Vec<DevSession> {
    DEV_SESSIONS_JSONL
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verify_password_matches_correct_hash() {
        let hash = hash_password("hunter2");
        assert!(verify_password("hunter2", &hash));
        assert!(!verify_password("wrong", &hash));
    }

    #[test]
    fn verify_password_rejects_empty_hash() {
        assert!(!verify_password("anything", ""));
    }

    #[test]
    fn seeded_dev_sessions_parse() {
        assert!(!dev_sessions().is_empty());
    }
}
