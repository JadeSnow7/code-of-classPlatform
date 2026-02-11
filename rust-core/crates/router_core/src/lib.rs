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

    if !input.local_model_ready && input.cloud_model_ready {
        return decision(RouteTarget::Cloud, "local_unavailable");
    }

    if !input.cloud_model_ready && input.local_model_ready {
        return decision(RouteTarget::Local, "cloud_unavailable");
    }

    if !input.local_model_ready && !input.cloud_model_ready {
        return decision(RouteTarget::Local, "no_engine_available");
    }

    decision(RouteTarget::Local, "balanced_default")
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
    fn t01_private_mode_forces_local() {
        let mut input = base_input();
        input.privacy_level = PrivacyLevel::Private;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "privacy_high");
    }

    #[test]
    fn t02_private_local_unavailable_fallback_cloud() {
        let mut input = base_input();
        input.privacy_level = PrivacyLevel::Private;
        input.local_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "privacy_high_fallback_cloud");
    }

    #[test]
    fn t03_private_both_unavailable_reason_contains_no_engine() {
        let mut input = base_input();
        input.privacy_level = PrivacyLevel::Private;
        input.local_model_ready = false;
        input.cloud_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert!(decision.reason.contains("no_engine_available"));
    }

    #[test]
    fn t04_serious_thermal_forces_cloud() {
        let mut input = base_input();
        input.device_context.thermal_state = Some(ThermalState::Serious);

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "thermal_throttle");
    }

    #[test]
    fn t05_critical_thermal_forces_cloud() {
        let mut input = base_input();
        input.device_context.thermal_state = Some(ThermalState::Critical);

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "thermal_throttle");
    }

    #[test]
    fn t06_critical_thermal_cloud_unavailable_fallback_local() {
        let mut input = base_input();
        input.device_context.thermal_state = Some(ThermalState::Critical);
        input.cloud_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "thermal_throttle_fallback_local");
    }

    #[test]
    fn t07_rtt_181_prefers_local() {
        let mut input = base_input();
        input.network_rtt_ms = 181;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "weak_network");
    }

    #[test]
    fn t08_weak_network_local_unavailable_fallback_cloud() {
        let mut input = base_input();
        input.network_rtt_ms = 181;
        input.local_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "weak_network_fallback_cloud");
    }

    #[test]
    fn t09_local_unavailable_cloud_available() {
        let mut input = base_input();
        input.local_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "local_unavailable");
    }

    #[test]
    fn t10_cloud_unavailable_local_available() {
        let mut input = base_input();
        input.cloud_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "cloud_unavailable");
    }

    #[test]
    fn t11_preference_privacy_prefers_local() {
        let mut input = base_input();
        input.user_preference = UserPreference::Privacy;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "user_prefer_privacy");
    }

    #[test]
    fn t12_preference_privacy_local_unavailable_fallback_cloud() {
        let mut input = base_input();
        input.user_preference = UserPreference::Privacy;
        input.local_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "user_prefer_privacy_fallback_cloud");
    }

    #[test]
    fn t13_preference_latency_rtt_60_prefers_cloud() {
        let mut input = base_input();
        input.user_preference = UserPreference::Latency;
        input.network_rtt_ms = 60;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "user_prefer_latency");
    }

    #[test]
    fn t14_preference_latency_rtt_120_falls_back_local() {
        let mut input = base_input();
        input.user_preference = UserPreference::Latency;
        input.network_rtt_ms = 120;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "latency_but_rtt_high");
    }

    #[test]
    fn t15_device_load_085_prefers_cloud() {
        let mut input = base_input();
        input.device_load = 0.85;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "high_device_load");
    }

    #[test]
    fn t16_high_load_cloud_unavailable_fallback_local() {
        let mut input = base_input();
        input.device_load = 0.85;
        input.cloud_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "high_device_load_fallback_local");
    }

    #[test]
    fn t17_balanced_default_path() {
        let input = base_input();

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "balanced_default");
    }

    #[test]
    fn t18_balanced_rtt_180_is_weak_network_boundary() {
        let mut input = base_input();
        input.network_rtt_ms = 180;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "weak_network");
    }

    #[test]
    fn t19_latency_rtt_80_is_cloud_boundary() {
        let mut input = base_input();
        input.user_preference = UserPreference::Latency;
        input.network_rtt_ms = 80;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Cloud);
        assert_eq!(decision.reason, "user_prefer_latency");
    }

    #[test]
    fn t20_ttl_is_30_for_key_branches() {
        let mut cases = Vec::new();

        let mut private_case = base_input();
        private_case.privacy_level = PrivacyLevel::Private;
        cases.push(private_case);

        let mut thermal_case = base_input();
        thermal_case.device_context.thermal_state = Some(ThermalState::Critical);
        cases.push(thermal_case);

        let mut weak_net_case = base_input();
        weak_net_case.network_rtt_ms = 181;
        cases.push(weak_net_case);

        let mut latency_case = base_input();
        latency_case.user_preference = UserPreference::Latency;
        latency_case.network_rtt_ms = 60;
        cases.push(latency_case);

        let mut high_load_case = base_input();
        high_load_case.device_load = 0.85;
        cases.push(high_load_case);

        let balanced_case = base_input();
        cases.push(balanced_case);

        for input in cases {
            let decision = router_decide(&input);
            assert_eq!(decision.ttl_seconds, 30);
        }
    }

    #[test]
    fn t21_serious_thermal_cloud_unavailable_fallback_local() {
        let mut input = base_input();
        input.device_context.thermal_state = Some(ThermalState::Serious);
        input.cloud_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "thermal_throttle_fallback_local");
    }

    #[test]
    fn t22_default_local_when_no_engine_available() {
        let mut input = base_input();
        input.local_model_ready = false;
        input.cloud_model_ready = false;

        let decision = router_decide(&input);

        assert_eq!(decision.route, RouteTarget::Local);
        assert_eq!(decision.reason, "no_engine_available");
    }
}
