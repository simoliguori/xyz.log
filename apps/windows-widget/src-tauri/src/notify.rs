use chrono::{DateTime, Local, Timelike};
use serde::Deserialize;
use std::collections::HashSet;

/// Reminder sent by the frontend (core::collectReminders).
#[derive(Debug, Clone, Deserialize)]
pub struct Reminder {
    pub kind: String, // "habit" | "todo"
    pub id: String,
    pub title: String,
    pub time: String, // "HH:mm"
    #[serde(default)]
    pub date: Option<String>, // "YYYY-MM-DD" (todos only)
}

/// Given the current instant, returns the notifications (title, body) to show
/// now and updates the set of already-sent ones (one per minute per day).
pub fn due_now(
    now: DateTime<Local>,
    reminders: &[Reminder],
    fired: &mut HashSet<String>,
) -> Vec<(String, String)> {
    let hm = format!("{:02}:{:02}", now.hour(), now.minute());
    let today = now.format("%Y-%m-%d").to_string();

    // cleanup: keep only today's keys
    fired.retain(|k| k.ends_with(&today));

    let mut out = Vec::new();
    for r in reminders {
        let matches = if r.kind == "todo" {
            r.date.as_deref() == Some(today.as_str()) && r.time == hm
        } else {
            r.time == hm
        };
        if !matches {
            continue;
        }
        let key = format!("{}|{}|{}|{}", r.kind, r.id, r.time, today);
        if fired.contains(&key) {
            continue;
        }
        fired.insert(key);
        let title = if r.kind == "todo" { "Reminder" } else { "Habit" };
        out.push((title.to_string(), format!("{} · {}", r.title, r.time)));
    }
    out
}
