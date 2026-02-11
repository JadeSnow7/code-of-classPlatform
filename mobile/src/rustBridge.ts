export type PrivacyLevel = 'private' | 'public';
export type UserPreference = 'latency' | 'privacy' | 'balanced';
export type ThermalState = 'nominal' | 'fair' | 'serious' | 'critical';
export type RouteTarget = 'local' | 'cloud';

export type DeviceContext = {
  battery_level?: number;
  thermal_state?: ThermalState;
  memory_available_mb: number;
};

export type RouteInput = {
  privacy_level: PrivacyLevel;
  user_preference: UserPreference;
  device_load: number;
  device_context: DeviceContext;
  network_rtt_ms: number;
  local_model_ready: boolean;
  cloud_model_ready: boolean;
};

export type RouteDecision = {
  route: RouteTarget;
  reason: string;
  ttl_seconds: number;
};

type RustCoreBridge = {
  decideRoute: (inputJson: string) => string;
};

function getBridge(): RustCoreBridge | null {
  const holder = globalThis as unknown as { RustCoreBridge?: RustCoreBridge };
  if (!holder.RustCoreBridge?.decideRoute) {
    return null;
  }
  return holder.RustCoreBridge;
}

export async function decideRouteWithRust(input: RouteInput): Promise<RouteDecision | null> {
  const bridge = getBridge();
  if (!bridge) {
    return null;
  }

  try {
    const payload = JSON.stringify(input);
    const raw = bridge.decideRoute(payload);
    return JSON.parse(raw) as RouteDecision;
  } catch {
    return null;
  }
}
