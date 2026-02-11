use router_core::{router_decide as decide_route, RouteDecision, RouteInput};

#[cfg_attr(feature = "tauri-command", tauri::command)]
pub fn router_decide(input: RouteInput) -> RouteDecision {
    decide_route(&input)
}
