use router_core::{router_decide, RouteInput};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum BridgeError {
    #[error("invalid input JSON: {0}")]
    InvalidInput(#[from] serde_json::Error),
    #[error("failed to serialize decision JSON: {0}")]
    Serialize(#[source] serde_json::Error),
}

pub fn router_decide_json(input_json: &str) -> Result<String, BridgeError> {
    let input: RouteInput = serde_json::from_str(input_json)?;
    let decision = router_decide(&input);
    serde_json::to_string(&decision).map_err(BridgeError::Serialize)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_bridge_roundtrip() {
        let input = r#"{
            "privacy_level": "private",
            "user_preference": "balanced",
            "device_load": 0.4,
            "device_context": {
                "battery_level": 0.9,
                "thermal_state": "nominal",
                "memory_available_mb": 1024
            },
            "network_rtt_ms": 60,
            "local_model_ready": true,
            "cloud_model_ready": true
        }"#;

        let output = router_decide_json(input).expect("bridge call should succeed");

        assert!(output.contains("\"route\":\"local\""));
    }
}
