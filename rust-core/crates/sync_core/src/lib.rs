use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncMode {
    Online,
    Hybrid,
    Offline,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SyncInput {
    pub pending_ops: u32,
    pub network_rtt_ms: u32,
    pub storage_free_mb: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SyncPlan {
    pub mode: SyncMode,
    pub batch_size: u32,
    pub reason: String,
}

pub fn build_sync_plan(input: &SyncInput) -> SyncPlan {
    if input.network_rtt_ms > 200 {
        return SyncPlan {
            mode: SyncMode::Offline,
            batch_size: 0,
            reason: "network_slow".to_string(),
        };
    }

    if input.pending_ops > 200 {
        return SyncPlan {
            mode: SyncMode::Hybrid,
            batch_size: 100,
            reason: "large_backlog".to_string(),
        };
    }

    SyncPlan {
        mode: SyncMode::Online,
        batch_size: 20,
        reason: "realtime_sync".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn large_backlog_uses_hybrid() {
        let input = SyncInput {
            pending_ops: 500,
            network_rtt_ms: 80,
            storage_free_mb: 1024,
        };

        let plan = build_sync_plan(&input);

        assert_eq!(plan.mode, SyncMode::Hybrid);
        assert_eq!(plan.batch_size, 100);
    }
}
