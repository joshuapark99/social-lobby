export type ReadinessResult = {
  ready: boolean;
  checks?: Record<string, string>;
};

export type ReadinessCheck = () => Promise<ReadinessResult>;
export type EventLogger = (event: Record<string, unknown>) => void;

type HttpCounterKey = `${string}|${string}|${string}`;
type RealtimeCounterKey = `${string}|${string}|${string}`;

export class Observability {
  private readonly httpRequests = new Map<HttpCounterKey, number>();
  private readonly realtimeEvents = new Map<RealtimeCounterKey, number>();
  private readonly roomOccupants = new Map<string, number>();
  private activeRealtimeConnections = 0;

  recordHttpRequest(input: { method: string; route: string; statusCode: number }): void {
    const key: HttpCounterKey = `${input.method}|${input.route}|${input.statusCode}`;
    this.httpRequests.set(key, (this.httpRequests.get(key) ?? 0) + 1);
  }

  metricsText(): string {
    const lines = [
      "# HELP sl_http_requests_total Total HTTP requests processed.",
      "# TYPE sl_http_requests_total counter",
      "# HELP sl_realtime_connections_active Active websocket connections.",
      "# TYPE sl_realtime_connections_active gauge",
      `sl_realtime_connections_active ${this.activeRealtimeConnections}`,
      "# HELP sl_room_occupants_active Active room occupants by room slug.",
      "# TYPE sl_room_occupants_active gauge",
      ...[...this.roomOccupants.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([roomSlug, count]) => `sl_room_occupants_active{room_slug="${escapeLabel(roomSlug)}"} ${count}`),
      "# HELP sl_realtime_events_total Total realtime events observed.",
      "# TYPE sl_realtime_events_total counter"
    ];

    for (const [key, value] of [...this.httpRequests.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const [method, route, statusCode] = key.split("|");
      lines.push(
        `sl_http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status_code="${escapeLabel(statusCode)}"} ${value}`
      );
    }

    for (const [key, value] of [...this.realtimeEvents.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const [direction, eventType, result] = key.split("|");
      lines.push(
        `sl_realtime_events_total{direction="${escapeLabel(direction)}",event_type="${escapeLabel(eventType)}",result="${escapeLabel(result)}"} ${value}`
      );
    }

    return `${lines.join("\n")}\n`;
  }

  connectionOpened(): void {
    this.activeRealtimeConnections += 1;
  }

  connectionClosed(): void {
    this.activeRealtimeConnections = Math.max(0, this.activeRealtimeConnections - 1);
  }

  roomOccupancyChanged(roomSlug: string, count: number): void {
    if (count <= 0) {
      this.roomOccupants.delete(roomSlug);
      return;
    }

    this.roomOccupants.set(roomSlug, count);
  }

  recordRealtimeEvent(input: { direction: "in" | "out"; eventType: string; result: string }): void {
    const key: RealtimeCounterKey = `${input.direction}|${input.eventType}|${input.result}`;
    this.realtimeEvents.set(key, (this.realtimeEvents.get(key) ?? 0) + 1);
  }
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}
