use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub fn is_muted(now: OffsetDateTime, mute_until: Option<&str>) -> bool {
    mute_until
        .and_then(|value| OffsetDateTime::parse(value, &Rfc3339).ok())
        .is_some_and(|until| until > now)
}

pub fn can_send(
    now: OffsetDateTime,
    last_sent_at: Option<OffsetDateTime>,
    min_minutes: u64,
    mute_until: Option<&str>,
) -> bool {
    if is_muted(now, mute_until) {
        return false;
    }
    match last_sent_at {
        Some(last) => (now - last).whole_minutes() >= min_minutes as i64,
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn mute_wins_over_rate_limit() {
        let now = datetime!(2026-05-05 15:00 UTC);
        assert!(!can_send(now, None, 10, Some("2026-05-05T16:00:00Z")));
        assert!(can_send(
            now,
            Some(datetime!(2026-05-05 14:49 UTC)),
            10,
            None
        ));
        assert!(!can_send(
            now,
            Some(datetime!(2026-05-05 14:55 UTC)),
            10,
            None
        ));
    }
}
