use chrono::{DateTime, Duration, Local, NaiveTime, TimeZone};

/// Compute the next break time from `from`.
///
/// When `fixed_times` (e.g. `["10:30", "15:00"]`) is non-empty it wins over the
/// interval: the next break is the soonest listed time-of-day strictly after
/// `from` (today or tomorrow). Otherwise the next break is `from + interval`.
pub fn compute_next(
    interval_minutes: u64,
    fixed_times: &[String],
    from: DateTime<Local>,
) -> DateTime<Local> {
    let times: Vec<NaiveTime> = fixed_times
        .iter()
        .filter_map(|s| NaiveTime::parse_from_str(s.trim(), "%H:%M").ok())
        .collect();

    if times.is_empty() {
        // Clamp to at least 1 minute so a zero/garbage interval can't spin-loop breaks.
        return from + Duration::minutes(interval_minutes.max(1) as i64);
    }

    let mut candidates: Vec<DateTime<Local>> = Vec::new();
    for day_offset in 0..=1 {
        let date = (from + Duration::days(day_offset)).date_naive();
        for t in &times {
            let naive = date.and_time(*t);
            // .earliest() picks a valid instant across DST gaps/folds.
            if let Some(dt) = Local.from_local_datetime(&naive).earliest() {
                if dt > from {
                    candidates.push(dt);
                }
            }
        }
    }
    candidates
        .into_iter()
        .min()
        // All parsed times fell in a DST gap both days, practically unreachable;
        // fall back to the interval.
        .unwrap_or_else(|| from + Duration::minutes(interval_minutes.max(1) as i64))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Timelike;

    fn at(h: u32, m: u32) -> DateTime<Local> {
        Local::now()
            .with_hour(h)
            .unwrap()
            .with_minute(m)
            .unwrap()
            .with_second(0)
            .unwrap()
            .with_nanosecond(0)
            .unwrap()
    }

    #[test]
    fn interval_mode_adds_minutes() {
        let from = at(9, 0);
        assert_eq!(compute_next(45, &[], from), from + Duration::minutes(45));
    }

    #[test]
    fn zero_interval_clamps_to_one_minute() {
        let from = at(9, 0);
        assert_eq!(compute_next(0, &[], from), from + Duration::minutes(1));
    }

    #[test]
    fn fixed_times_pick_soonest_today() {
        let from = at(9, 0);
        let next = compute_next(45, &["15:00".into(), "10:30".into()], from);
        assert_eq!((next.hour(), next.minute()), (10, 30));
        assert_eq!(next.date_naive(), from.date_naive());
    }

    #[test]
    fn fixed_times_roll_to_tomorrow() {
        let from = at(16, 0);
        let next = compute_next(45, &["10:30".into(), "15:00".into()], from);
        assert_eq!((next.hour(), next.minute()), (10, 30));
        assert_eq!(next.date_naive(), from.date_naive() + Duration::days(1));
    }

    #[test]
    fn fixed_time_equal_to_now_rolls_forward() {
        let from = at(10, 30);
        let next = compute_next(45, &["10:30".into()], from);
        assert!(next > from);
    }

    #[test]
    fn unparseable_times_fall_back_to_interval() {
        let from = at(9, 0);
        let next = compute_next(30, &["not-a-time".into()], from);
        assert_eq!(next, from + Duration::minutes(30));
    }
}
