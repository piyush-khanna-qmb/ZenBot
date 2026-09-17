use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ThingToTry {
    pub id: String,
    pub text: String,
    /// Seeded items are disable-only (never removed) so the curated set survives.
    pub builtin: bool,
    pub enabled: bool,
    /// When true, this item also fires as a reminder right after every fog log,
    /// instead of only appearing in the rotated suggestion pool.
    pub fires_as_reminder: bool,
}

impl Default for ThingToTry {
    fn default() -> Self {
        Self {
            id: String::new(),
            text: String::new(),
            builtin: false,
            enabled: true,
            fires_as_reminder: false,
        }
    }
}

impl ThingToTry {
    fn builtin(id: &str, text: &str) -> Self {
        Self {
            id: id.into(),
            text: text.into(),
            builtin: true,
            enabled: true,
            fires_as_reminder: false,
        }
    }
}

pub fn default_things_to_try() -> Vec<ThingToTry> {
    vec![
        ThingToTry::builtin("builtin-walk", "Take a short walk"),
        ThingToTry::builtin("builtin-water", "Drink a glass of water"),
        ThingToTry::builtin("builtin-stretch", "Stand up and stretch"),
        ThingToTry::builtin("builtin-yawn", "Yawn deliberately a few times"),
        ThingToTry::builtin("builtin-20-20-20", "20-20-20: look 20ft away for 20 seconds"),
        ThingToTry::builtin("builtin-cold-water", "Splash cold water on your face or wrists"),
        ThingToTry::builtin("builtin-daylight", "Step outside for a few minutes of daylight"),
        ThingToTry::builtin("builtin-box-breathing", "Do one round of box breathing"),
        ThingToTry::builtin("builtin-name-five", "Name 5 things you can see right now"),
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct FogSettings {
    pub shortcut: String,
    pub things_to_try: Vec<ThingToTry>,
    pub breathing_inhale: u32,
    pub breathing_hold1: u32,
    pub breathing_exhale: u32,
    pub breathing_hold2: u32,
}

impl Default for FogSettings {
    fn default() -> Self {
        Self {
            shortcut: "CommandOrControl+Shift+F".into(),
            things_to_try: default_things_to_try(),
            breathing_inhale: 4,
            breathing_hold1: 4,
            breathing_exhale: 4,
            breathing_hold2: 4,
        }
    }
}

impl FogSettings {
    pub fn sanitized(mut self) -> Self {
        self.breathing_inhale = self.breathing_inhale.clamp(1, 30);
        self.breathing_hold1 = self.breathing_hold1.clamp(0, 30);
        self.breathing_exhale = self.breathing_exhale.clamp(1, 30);
        self.breathing_hold2 = self.breathing_hold2.clamp(0, 30);
        self.shortcut = self.shortcut.trim().to_string();
        if self.shortcut.is_empty() {
            self.shortcut = "CommandOrControl+Shift+F".into();
        }
        self.things_to_try.retain(|t| !t.text.trim().is_empty());
        if self.things_to_try.is_empty() {
            self.things_to_try = default_things_to_try();
        }
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct FogLogEntry {
    pub ts: String,
    pub severity: u8,
    pub context: String,
    pub sleep_time: String,
    pub wake_time: String,
    pub sleep_hours: f32,
    pub last_meal: String,
    pub last_caffeine: String,
    pub notes: String,
}

impl Default for FogLogEntry {
    fn default() -> Self {
        Self {
            ts: String::new(),
            severity: 3,
            context: String::new(),
            sleep_time: String::new(),
            wake_time: String::new(),
            sleep_hours: 0.0,
            last_meal: String::new(),
            last_caffeine: String::new(),
            notes: String::new(),
        }
    }
}

/// Pick the next suggestion from the rotation pool (enabled, non-reminder items),
/// wrapping around with `index`. Pure, no I/O — mirrors schedule::compute_next.
pub fn pick_suggestion(pool: &[ThingToTry], index: usize) -> Option<ThingToTry> {
    let candidates: Vec<&ThingToTry> = pool
        .iter()
        .filter(|t| t.enabled && !t.fires_as_reminder)
        .collect();
    if candidates.is_empty() {
        return None;
    }
    Some(candidates[index % candidates.len()].clone())
}

/// Items flagged to fire alongside every fog-log submission.
pub fn active_reminders(pool: &[ThingToTry]) -> Vec<ThingToTry> {
    pool.iter()
        .filter(|t| t.enabled && t.fires_as_reminder)
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, enabled: bool, reminder: bool) -> ThingToTry {
        ThingToTry {
            id: id.into(),
            text: id.into(),
            builtin: false,
            enabled,
            fires_as_reminder: reminder,
        }
    }

    #[test]
    fn pick_suggestion_rotates_through_pool() {
        let pool = vec![item("a", true, false), item("b", true, false), item("c", true, false)];
        assert_eq!(pick_suggestion(&pool, 0).unwrap().id, "a");
        assert_eq!(pick_suggestion(&pool, 1).unwrap().id, "b");
        assert_eq!(pick_suggestion(&pool, 3).unwrap().id, "a");
    }

    #[test]
    fn pick_suggestion_skips_disabled_and_reminder_items() {
        let pool = vec![item("a", false, false), item("b", true, true), item("c", true, false)];
        assert_eq!(pick_suggestion(&pool, 0).unwrap().id, "c");
        assert_eq!(pick_suggestion(&pool, 1).unwrap().id, "c");
    }

    #[test]
    fn pick_suggestion_empty_pool_is_none() {
        let pool = vec![item("a", false, false), item("b", true, true)];
        assert!(pick_suggestion(&pool, 0).is_none());
    }

    #[test]
    fn active_reminders_filters_correctly() {
        let pool = vec![
            item("a", true, true),
            item("b", false, true),
            item("c", true, false),
        ];
        let reminders = active_reminders(&pool);
        assert_eq!(reminders.len(), 1);
        assert_eq!(reminders[0].id, "a");
    }

    #[test]
    fn sanitized_clamps_breathing_seconds_and_reseeds_empty_list() {
        let dirty = FogSettings {
            shortcut: "  ".into(),
            things_to_try: vec![item("", false, false)],
            breathing_inhale: 0,
            breathing_hold1: 999,
            breathing_exhale: 0,
            breathing_hold2: 999,
        };
        let clean = dirty.sanitized();
        assert_eq!(clean.shortcut, "CommandOrControl+Shift+F");
        assert_eq!(clean.breathing_inhale, 1);
        assert_eq!(clean.breathing_hold1, 30);
        assert_eq!(clean.breathing_exhale, 1);
        assert_eq!(clean.breathing_hold2, 30);
        assert_eq!(clean.things_to_try.len(), default_things_to_try().len());
    }

    #[test]
    fn sanitized_keeps_valid_custom_items() {
        let dirty = FogSettings {
            things_to_try: vec![item("custom", true, true)],
            ..FogSettings::default()
        };
        let clean = dirty.sanitized();
        assert_eq!(clean.things_to_try.len(), 1);
        assert_eq!(clean.things_to_try[0].id, "custom");
    }
}
