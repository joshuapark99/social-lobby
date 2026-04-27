import type { ApiClient } from "../shared/apiClient";

export function LobbyView({ apiClient }: { apiClient: ApiClient }) {
  return (
    <div className="stack">
      <p>Room list placeholder</p>
      <p className="muted">API boundary: {apiClient.baseUrl}</p>
    </div>
  );
}
