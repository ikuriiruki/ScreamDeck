use crate::model::{Id, Library, ScreamSet};

pub fn pick_weighted(set: &ScreamSet, lib: &Library, roll: f64) -> Option<Id> {
    let items: Vec<_> = set
        .items
        .iter()
        .filter(|i| i.weight > 0 && lib.screamers.iter().any(|s| s.id == i.screamer_id))
        .collect();
    let total: u64 = items.iter().map(|i| i.weight as u64).sum();
    let target = roll * total as f64;
    let mut acc = 0u64;
    for i in &items {
        acc += i.weight as u64;
        if target < acc as f64 {
            return Some(i.screamer_id.clone());
        }
    }
    items.last().map(|i| i.screamer_id.clone())
}

pub fn normalize_interval(min_ms: u64, max_ms: u64) -> (u64, u64) {
    let (a, b) = if min_ms > max_ms { (max_ms, min_ms) } else { (min_ms, max_ms) };
    (a.clamp(1000, 86_400_000), b.clamp(1000, 86_400_000))
}

pub fn next_delay_ms(set: &ScreamSet, roll: f64) -> u64 {
    let (min, max) = normalize_interval(set.min_interval_ms, set.max_interval_ms);
    (min + (roll * (max - min + 1) as f64) as u64).min(max)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Screamer, SetItem};

    fn lib(ids: &[&str]) -> Library {
        Library {
            screamers: ids.iter().map(|i| Screamer { id: i.to_string(), ..Default::default() }).collect(),
            ..Default::default()
        }
    }

    fn set(items: &[(&str, u32)]) -> ScreamSet {
        ScreamSet {
            items: items.iter().map(|(i, w)| SetItem { screamer_id: i.to_string(), weight: *w }).collect(),
            ..Default::default()
        }
    }

    #[test]
    fn pick_from_empty_is_none() {
        assert_eq!(pick_weighted(&set(&[]), &lib(&["a"]), 0.5), None);
    }

    #[test]
    fn pick_respects_weights() {
        let (s, l) = (set(&[("a", 3), ("b", 1)]), lib(&["a", "b"]));
        assert_eq!(pick_weighted(&s, &l, 0.0).as_deref(), Some("a"));
        assert_eq!(pick_weighted(&s, &l, 0.749).as_deref(), Some("a"));
        assert_eq!(pick_weighted(&s, &l, 0.75).as_deref(), Some("b"));
        assert_eq!(pick_weighted(&s, &l, 0.999).as_deref(), Some("b"));
    }

    #[test]
    fn pick_skips_deleted_screamers() {
        let (s, l) = (set(&[("ghost", 100), ("a", 1)]), lib(&["a"]));
        for r in [0.0, 0.5, 0.99] {
            assert_eq!(pick_weighted(&s, &l, r).as_deref(), Some("a"));
        }
    }

    #[test]
    fn interval_is_normalized() {
        assert_eq!(normalize_interval(0, 0), (1000, 1000));
        assert_eq!(normalize_interval(60_000, 30_000), (30_000, 60_000));
        assert_eq!(normalize_interval(1000, u64::MAX), (1000, 86_400_000));
    }

    #[test]
    fn delay_is_uniform_in_range() {
        let s = ScreamSet { min_interval_ms: 2000, max_interval_ms: 4000, ..Default::default() };
        assert_eq!(next_delay_ms(&s, 0.0), 2000);
        assert_eq!(next_delay_ms(&s, 0.5), 3000);
        assert_eq!(next_delay_ms(&s, 0.999999), 4000);
    }
}
