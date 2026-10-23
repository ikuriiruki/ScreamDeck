use crate::model::{show_duration_ms, Id, Library, Show, Target};
use std::collections::VecDeque;

const MAX_QUEUE: usize = 10;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Source {
    Timer,
    Api,
    Test,
}

#[derive(Clone, Debug)]
pub enum Effect {
    Prepare(Show),
    End { show_id: u64 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Rejected {
    Skipped,
    QueueFull,
}

#[derive(Default)]
pub struct Player {
    current: Option<Show>,
    queue: VecDeque<(Id, Target)>,
    next_id: u64,
}

impl Player {
    fn start(&mut self, screamer_id: &str, target: Target, lib: &Library) -> Option<Effect> {
        let screamer = lib.screamers.iter().find(|s| s.id == screamer_id)?.clone();
        self.next_id += 1;
        let show = Show { show_id: self.next_id, duration_ms: show_duration_ms(&screamer), screamer, target };
        self.current = Some(show.clone());
        Some(Effect::Prepare(show))
    }

    pub fn request(&mut self, screamer_id: &str, target: Target, source: Source, lib: &Library) -> Result<Vec<Effect>, Rejected> {
        if !lib.screamers.iter().any(|s| s.id == screamer_id) {
            return Ok(vec![]);
        }
        let mut fx = vec![];
        if let Some(cur) = &self.current {
            match source {
                Source::Timer => return Err(Rejected::Skipped),
                Source::Api if self.queue.len() >= MAX_QUEUE => return Err(Rejected::QueueFull),
                Source::Api => {
                    self.queue.push_back((screamer_id.to_string(), target));
                    return Ok(vec![]);
                }
                Source::Test => fx.push(Effect::End { show_id: cur.show_id }),
            }
        }
        fx.extend(self.start(screamer_id, target, lib));
        Ok(fx)
    }

    pub fn finished(&mut self, show_id: u64, lib: &Library) -> Vec<Effect> {
        if self.current.as_ref().map(|s| s.show_id) != Some(show_id) {
            return vec![];
        }
        self.current = None;
        while let Some((id, target)) = self.queue.pop_front() {
            if let Some(e) = self.start(&id, target, lib) {
                return vec![e];
            }
        }
        vec![]
    }

    pub fn stop(&mut self) -> Vec<Effect> {
        self.queue.clear();
        self.current.take().map(|s| Effect::End { show_id: s.show_id }).into_iter().collect()
    }

    pub fn is_busy(&self) -> bool {
        self.current.is_some()
    }

    pub fn queue_len(&self) -> usize {
        self.queue.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Screamer;

    fn lib(ids: &[&str]) -> Library {
        Library {
            screamers: ids.iter().map(|i| Screamer { id: i.to_string(), ..Default::default() }).collect(),
            ..Default::default()
        }
    }

    fn prepared(fx: &[Effect]) -> Show {
        match fx {
            [Effect::Prepare(s)] => s.clone(),
            _ => panic!("expected single Prepare, got {fx:?}"),
        }
    }

    #[test]
    fn timer_is_skipped_while_busy() {
        let (mut p, l) = (Player::default(), lib(&["a"]));
        p.request("a", Target::Both, Source::Timer, &l).unwrap();
        assert_eq!(p.request("a", Target::Both, Source::Timer, &l).unwrap_err(), Rejected::Skipped);
        assert_eq!(p.queue_len(), 0);
    }

    #[test]
    fn api_is_queued_while_busy_and_capped_at_10() {
        let (mut p, l) = (Player::default(), lib(&["a"]));
        p.request("a", Target::Pc, Source::Api, &l).unwrap();
        for _ in 0..10 {
            assert!(p.request("a", Target::Pc, Source::Api, &l).unwrap().is_empty());
        }
        assert_eq!(p.queue_len(), 10);
        assert_eq!(p.request("a", Target::Pc, Source::Api, &l).unwrap_err(), Rejected::QueueFull);
    }

    #[test]
    fn finished_starts_next_from_queue() {
        let (mut p, l) = (Player::default(), lib(&["a", "b"]));
        let first = prepared(&p.request("a", Target::Pc, Source::Api, &l).unwrap());
        p.request("b", Target::Overlay, Source::Api, &l).unwrap();
        let next = prepared(&p.finished(first.show_id, &l));
        assert_eq!(next.screamer.id, "b");
        assert_eq!(next.target, Target::Overlay);
        assert_ne!(next.show_id, first.show_id);
        assert_eq!(p.queue_len(), 0);
        assert!(p.finished(next.show_id, &l).is_empty());
        assert!(!p.is_busy());
    }

    #[test]
    fn stale_finished_is_ignored() {
        let (mut p, l) = (Player::default(), lib(&["a"]));
        let first = prepared(&p.request("a", Target::Pc, Source::Test, &l).unwrap());
        p.request("a", Target::Pc, Source::Test, &l).unwrap();
        assert!(p.finished(first.show_id, &l).is_empty());
        assert!(p.is_busy());
    }

    #[test]
    fn test_source_interrupts_current() {
        let (mut p, l) = (Player::default(), lib(&["a", "b"]));
        let old = prepared(&p.request("a", Target::Pc, Source::Timer, &l).unwrap());
        p.request("a", Target::Pc, Source::Api, &l).unwrap();
        let fx = p.request("b", Target::Both, Source::Test, &l).unwrap();
        match fx.as_slice() {
            [Effect::End { show_id }, Effect::Prepare(new)] => {
                assert_eq!(*show_id, old.show_id);
                assert_eq!(new.screamer.id, "b");
            }
            _ => panic!("unexpected {fx:?}"),
        }
        assert_eq!(p.queue_len(), 1);
    }

    #[test]
    fn stop_clears_queue_and_ends_current() {
        let (mut p, l) = (Player::default(), lib(&["a"]));
        let cur = prepared(&p.request("a", Target::Pc, Source::Api, &l).unwrap());
        p.request("a", Target::Pc, Source::Api, &l).unwrap();
        let fx = p.stop();
        assert!(matches!(fx.as_slice(), [Effect::End { show_id }] if *show_id == cur.show_id));
        assert_eq!(p.queue_len(), 0);
        assert!(!p.is_busy());
        assert!(p.stop().is_empty());
    }

    #[test]
    fn queued_show_of_deleted_screamer_is_dropped() {
        let (mut p, l) = (Player::default(), lib(&["a", "b", "c"]));
        let first = prepared(&p.request("a", Target::Pc, Source::Api, &l).unwrap());
        p.request("b", Target::Pc, Source::Api, &l).unwrap();
        p.request("c", Target::Pc, Source::Api, &l).unwrap();
        let next = prepared(&p.finished(first.show_id, &lib(&["a", "c"])));
        assert_eq!(next.screamer.id, "c");
        assert_eq!(p.queue_len(), 0);
    }

    #[test]
    fn unknown_screamer_produces_no_show() {
        let (mut p, l) = (Player::default(), lib(&["a"]));
        assert!(p.request("ghost", Target::Pc, Source::Timer, &l).unwrap().is_empty());
        assert!(p.request("ghost", Target::Pc, Source::Test, &l).unwrap().is_empty());
        assert!(!p.is_busy());
        p.request("a", Target::Pc, Source::Timer, &l).unwrap();
        assert!(p.request("ghost", Target::Pc, Source::Api, &l).unwrap().is_empty());
        assert_eq!(p.queue_len(), 0);
    }

    #[test]
    fn end_is_driven_by_core_not_clients() {
        let (mut p, l) = (Player::default(), lib(&["a"]));
        let show = prepared(&p.request("a", Target::Both, Source::Timer, &l).unwrap());
        assert_eq!(show.duration_ms, show_duration_ms(&l.screamers[0]));
    }
}
