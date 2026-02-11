use serde::{Deserialize, Serialize};

const DEFAULT_TTL_SECONDS: u32 = 30;
const WEAK_NETWORK_RTT_MS: u32 = 180;
const FAST_NETWORK_RTT_MS: u32 = 80;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PrivacyLevel {
    Private,
    Public,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserPreference {
    Latency,
    Privacy,
    Balanced,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThermalState {
    Nominal,
    Fair,
    Serious,
    Critical,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DeviceContext {
    pub battery_level: Option<f32>,
    pub thermal_state: Option<ThermalState>,
    pub memory_available_mb: u32,
}

impl Default for DeviceContext {
    fn default() -> Self {
        Self {
            battery_level: None,
            thermal_state: None,
            memory_available_mb: 4096,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RouteInput {
    pub privacy_level: PrivacyLevel,
    pub user_preference: UserPreference,
    pub device_load: f32,
    pub device_context: DeviceContext,
    pub network_rtt_ms: u32,
    pub local_model_ready: bool,
    #[serde(default = "default_true")]
    pub cloud_model_ready: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RouteTarget {
    Local,
    Cloud,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RouteDecision {
    pub route: RouteTarget,
    pub reason: String,
    pub ttl_seconds: u32,
}

pub fn router_decide(input: &RouteInput) -> RouteDecision {
    if input.privacy_level == PrivacyLevel::Private {
        return choose_with_fallback(RouteTarget::Local, "privacy_high", input);
    }

    if matches!(
        input.device_context.thermal_state,
        Some(ThermalState::Serious | ThermalState::Critical)
    ) {
        return choose_with_fallback(RouteTarget::Cloud, "thermal_throttle", input);
    }

    if !input.local_model_ready {
        return choose_with_fallback(RouteTarget::Cloud, "local_unavailable", input);
    }

    if !input.cloud_model_ready {
        return choose_with_fallback(RouteTarget::Local, "cloud_unavailable", input);
    }

    if input.network_rtt_ms >= WEAK_NETWORK_RTT_MS {
        return choose_with_fallback(RouteTarget::Local, "weak_network", input);
    }

    match input.user_preference {
        UserPreference::Privacy => {
            return choose_with_fallback(RouteTarget::Local, "user_prefer_privacy", input)
        }
        UserPreference::Latency => {
            if input.network_rtt_ms <= FAST_NETWORK_RTT_MS {
                return choose_with_fallback(RouteTarget::Cloud, "user_prefer_latency", input);
            }
            return choose_with_fallback(RouteTarget::Local, "latency_but_rtt_high", input);
        }
        UserPreference::Balanced => {}
    }

    if input.device_load >= 0.85 {
        return choose_with_fallback(RouteTarget::Cloud, "high_device_load", input);
    }

    choose_with_fallback(RouteTarget::Local, "balanced_default", input)
}

fn choose_with_fallback(target: RouteTarget, reason: &str, input: &RouteInput) -> RouteDecision {
    match target {
        RouteTarget::Local => {
            if input.local_model_ready {
                return decision(RouteTarget::Local, reason);
            }
            if input.cloud_model_ready {
                return decision(RouteTarget::Cloud, &format!("{reason}_fallback_cloud"));
            }
        }
        RouteTarget::Cloud => {
            if input.cloud_model_ready {
                return decision(RouteTarget::Cloud, reason);
            }
            if input.local_model_ready {
                return decision(RouteTarget::Local, &format!("{reason}_fallback_local"));
            }
        }
    }

    decision(RouteTarget::Local, &format!("{reason}_no_engine_available"))
}

fn decision(route: RouteTarget, reason: &str) -> RouteDecision {
    RouteDecision {
        route,
        reason: reason.to_string(),
        ttl_seconds: DEFAULT_TTL_SECONDS,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_input() -> RouteInput {
        RouteInput {
            privacy_level: PrivacyLevel::Public,
            user_preference: UserPreference::Balanced,
            device_load: 0.2,
            device_context: DeviceContext {
                battery_level: Some(0.8),
                thermal_state: Some(ThermalState::Nominal),
                memory_available_mb: 2048,
            },
            network_rtt_ms: 90,
            local_model_ready: true,
            cloud_model_ready: true,
        }
    }

    #[test]
    fn private_mode_forces_local() {
        let mut input = base_input();
        input.privacy_level = PrivacyLevel::Private;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "privacy_high");
    }

    #[test]
    fn critical_thermal_forces_cloud() {
        let mut input = base_input();
        input.device_context.thermal_state = Some(ThermalState::Critical);

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "thermal_throttle");
    }

    #[test]
    fn weak_network_prefers_local() {
        let mut input = base_input();
        input.network_rtt_ms = WEAK_NETWORK_RTT_MS + 20;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "weak_network");
    }

    #[test]
    fn fallback_to_cloud_when_local_not_ready() {
        let mut input = base_input();
        input.privacy_level = PrivacyLevel::Private;
        input.local_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "privacy_high_fallback_cloud");
    }

    #[test]
    fn fallback_to_local_when_cloud_not_ready() {
        let mut input = base_input();
        input.device_context.thermal_state = Some(ThermalState::Serious);
        input.cloud_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "thermal_throttle_fallback_local");
    }

    #[test]
    fn default_local_when_no_engine_available() {
        let mut input = base_input();
        input.local_model_ready = false;
        input.cloud_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "local_unavailable_no_engine_available");
    }
}
