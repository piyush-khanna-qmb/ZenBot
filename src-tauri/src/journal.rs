use crate::fog;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct JournalSettings {
    pub api_key: String,
    pub ai_enabled: bool,
}

impl Default for JournalSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            ai_enabled: true,
        }
    }
}

impl JournalSettings {
    pub fn sanitized(mut self) -> Self {
        self.api_key = self.api_key.trim().to_string();
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct JournalEntry {
    pub ts: String,
    pub mood: String,
    pub energy: u8,
    pub concentration: u8,
    pub text: String,
    pub fog_suspected: bool,
    pub fog_confirmed: bool,
    pub weather: String,
    pub food_timing: String,
    pub reason: String,
    // Only meaningful when fog_confirmed — mirrors fog::FogLogEntry's fields
    // so a confirmed fog episode can also feed the existing Patterns charts.
    pub sleep_time: String,
    pub wake_time: String,
    pub sleep_hours: f32,
    pub last_meal: String,
    pub last_caffeine: String,
    pub severity: u8,
    pub parsed_by: String,
}

impl Default for JournalEntry {
    fn default() -> Self {
        Self {
            ts: String::new(),
            mood: "okay".into(),
            energy: 3,
            concentration: 3,
            text: String::new(),
            fog_suspected: false,
            fog_confirmed: false,
            weather: String::new(),
            food_timing: String::new(),
            reason: String::new(),
            sleep_time: String::new(),
            wake_time: String::new(),
            sleep_hours: 0.0,
            last_meal: String::new(),
            last_caffeine: String::new(),
            severity: 3,
            parsed_by: "none".into(),
        }
    }
}

impl JournalEntry {
    /// Converts a fog-confirmed journal entry into the existing fog log schema,
    /// so it shows up in the Patterns tab's fog charts alongside direct fog logs.
    pub fn to_fog_log(&self) -> fog::FogLogEntry {
        fog::FogLogEntry {
            ts: self.ts.clone(),
            severity: self.severity,
            context: "journal".into(),
            sleep_time: self.sleep_time.clone(),
            wake_time: self.wake_time.clone(),
            sleep_hours: self.sleep_hours,
            last_meal: self.last_meal.clone(),
            last_caffeine: self.last_caffeine.clone(),
            notes: self.text.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ParsedDraft {
    pub mood: String,
    pub energy: Option<u8>,
    pub concentration: Option<u8>,
    pub fog_suspected: bool,
    pub fog_confidence: f32,
    pub reason_guess: Option<String>,
    pub weather_mentioned: bool,
    pub food_mentioned: bool,
    pub missing: Vec<String>,
    pub parsed_by: String,
}

impl Default for ParsedDraft {
    fn default() -> Self {
        Self {
            mood: "okay".into(),
            energy: None,
            concentration: None,
            fog_suspected: false,
            fog_confidence: 0.0,
            reason_guess: None,
            weather_mentioned: false,
            food_mentioned: false,
            missing: vec!["weather".into(), "food_timing".into(), "reason".into()],
            parsed_by: "none".into(),
        }
    }
}

const POSITIVE_WORDS: &[&str] = &[
    "fresh", "good", "great", "energetic", "happy", "productive", "motivated", "excited",
    "calm", "fantastic", "amazing", "wonderful", "relaxed", "clear-headed", "clearheaded",
];
const NEGATIVE_WORDS: &[&str] = &[
    "low", "tired", "exhausted", "drained", "sad", "stressed", "anxious", "down", "upset",
    "overwhelmed", "frustrated", "irritable", "bleh", "meh", "rough",
];
const FOG_WORDS: &[&str] = &[
    "foggy", "fog", "numb", "can't focus", "cant focus", "can't concentrate",
    "cant concentrate", "spacing out", "zoned out", "zoning out", "spaced out",
    "blank", "same line", "brain fog", "can't think", "cant think",
];
const WEATHER_WORDS: &[&str] = &[
    "weather", "sunny", "rain", "raining", "cloudy", "cold", "hot", "humid", "windy", "storm",
    "gloomy", "overcast",
];
const FOOD_WORDS: &[&str] = &[
    "ate", "eat", "lunch", "breakfast", "dinner", "meal", "snack", "food", "hungry",
];
const REASON_MARKERS: &[&str] = &[
    "because", "since", "after", "due to", "thanks to", "bonus", "promoted", "promotion",
    "message", "call", "fight", "argument", "appreciated", "compliment",
];

fn count_hits(lower: &str, words: &[&str]) -> usize {
    words.iter().filter(|w| lower.contains(*w)).count()
}

/// Pure keyword/phrase heuristic parser — no I/O, unit tested. Used whenever the
/// AI path is disabled, has no key, or fails, so the app never hard-depends on
/// the network for the mood/journal flow to keep working.
pub fn local_parse(text: &str) -> ParsedDraft {
    let lower = text.to_lowercase();
    let pos = count_hits(&lower, POSITIVE_WORDS);
    let neg = count_hits(&lower, NEGATIVE_WORDS);
    let fog_hits = count_hits(&lower, FOG_WORDS);
    let weather_mentioned = WEATHER_WORDS.iter().any(|w| lower.contains(w));
    let food_mentioned = FOOD_WORDS.iter().any(|w| lower.contains(w));
    let reason_mentioned = REASON_MARKERS.iter().any(|w| lower.contains(w));

    let mood = if fog_hits > 0 {
        "foggy"
    } else if neg > pos {
        "low"
    } else if pos > neg {
        if pos >= 2 {
            "great"
        } else {
            "good"
        }
    } else {
        "okay"
    };

    let mut missing = Vec::new();
    if !weather_mentioned {
        missing.push("weather".to_string());
    }
    if !food_mentioned {
        missing.push("food_timing".to_string());
    }
    if !reason_mentioned {
        missing.push("reason".to_string());
    }

    ParsedDraft {
        mood: mood.to_string(),
        energy: None,
        concentration: None,
        fog_suspected: fog_hits > 0,
        fog_confidence: if fog_hits > 0 {
            (fog_hits as f32 * 0.35).min(0.9)
        } else {
            0.0
        },
        reason_guess: None,
        weather_mentioned,
        food_mentioned,
        missing,
        parsed_by: "local".to_string(),
    }
}

const AI_SYSTEM_PROMPT: &str = r#"You are a private local journaling assistant analyzing a short personal mood/energy dump. Note that energy and concentration are separate axes — someone can have high energy but low concentration (or vice versa) — infer each independently from the text, don't assume they move together. Output ONLY compact valid JSON, no markdown, no prose, matching exactly this schema:
{"mood":"great"|"good"|"okay"|"low"|"foggy","energy":<1-5 integer or null>,"concentration":<1-5 integer or null, how focused/clear-headed vs scattered/distracted they sound, independent of energy>,"fog_suspected":<boolean, true if the text suggests brain fog / numbness / trouble concentrating>,"fog_confidence":<0-1 number>,"reason_guess":<short string guess at why they feel this way, or null if not inferable>,"weather_mentioned":<boolean>,"food_mentioned":<boolean>,"missing":<array with zero or more of "weather","food_timing","reason" for topics NOT already covered in the text and worth asking about>}"#;

async fn ai_parse(api_key: &str, text: &str) -> Result<ParsedDraft, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 300,
        "temperature": 0.2,
        "system": AI_SYSTEM_PROMPT,
        "messages": [{ "role": "user", "content": text }],
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        return Err(format!("API error {status}: {body_text}"));
    }

    let value: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    let text_out = value
        .get("content")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("text"))
        .and_then(|t| t.as_str())
        .ok_or("no content in response")?;

    let mut parsed: ParsedDraft =
        serde_json::from_str(text_out).map_err(|e| format!("bad json from model: {e}"))?;
    parsed.parsed_by = "ai".to_string();
    Ok(parsed)
}

/// Parses a journal draft, preferring the AI path when configured and falling
/// back to the local heuristic on any failure so this never hard-fails offline.
pub async fn parse_draft(settings: &JournalSettings, text: &str) -> ParsedDraft {
    if text.trim().is_empty() {
        return ParsedDraft::default();
    }
    if settings.ai_enabled && !settings.api_key.is_empty() {
        match ai_parse(&settings.api_key, text).await {
            Ok(p) => return p,
            Err(e) => eprintln!("zenbot: journal AI parse failed, falling back to local: {e}"),
        }
    }
    local_parse(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fog_words_trigger_fog_suspected() {
        let p = local_parse("I keep reading the same line, totally foggy today");
        assert!(p.fog_suspected);
        assert!(p.fog_confidence > 0.0);
    }

    #[test]
    fn clean_positive_text_yields_good_or_great_mood() {
        let p = local_parse("Feeling fresh and energetic today, had a great morning");
        assert!(p.mood == "good" || p.mood == "great");
        assert!(!p.fog_suspected);
    }

    #[test]
    fn negative_non_fog_text_yields_low_mood() {
        let p = local_parse("Feeling pretty stressed and drained, kind of sad too");
        assert_eq!(p.mood, "low");
        assert!(!p.fog_suspected);
    }

    #[test]
    fn fog_words_yield_foggy_mood_regardless_of_sentiment_words() {
        let p = local_parse("brain fog is bad today, can't concentrate at all");
        assert_eq!(p.mood, "foggy");
        assert!(p.fog_suspected);
    }

    #[test]
    fn missing_topics_detected_correctly() {
        let p = local_parse("It's sunny out and I had lunch an hour ago, feeling good");
        assert!(p.weather_mentioned);
        assert!(p.food_mentioned);
        assert!(p.missing.contains(&"reason".to_string()));
        assert!(!p.missing.contains(&"weather".to_string()));
        assert!(!p.missing.contains(&"food_timing".to_string()));
    }

    #[test]
    fn empty_text_defaults_to_none_parsed() {
        let p = ParsedDraft::default();
        assert_eq!(p.parsed_by, "none");
        assert_eq!(p.missing.len(), 3);
    }

    #[test]
    fn neutral_text_yields_okay_mood() {
        let p = local_parse("Went to the office, had a meeting, worked on the report");
        assert_eq!(p.mood, "okay");
    }
}
