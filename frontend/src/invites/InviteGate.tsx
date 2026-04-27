import { type FormEvent, useState } from "react";
import type { ApiClient } from "../shared/apiClient";

export function InviteGate({ apiClient, initialCode }: { apiClient: ApiClient; initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [status, setStatus] = useState<"idle" | "submitting" | "redeemed" | "already-member" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const result = await apiClient.redeemInvite(code.trim());
      setStatus(result.status);
      setMessage(result.status === "already-member" ? "Invite already accepted." : "Invite accepted.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to redeem invite.");
    }
  }

  return (
    <form className="invite-form" onSubmit={submitInvite}>
      <label htmlFor="invite-code">Invite code</label>
      <div className="inline-form">
        <input
          id="invite-code"
          name="invite-code"
          onChange={(event) => setCode(event.target.value)}
          type="text"
          value={code}
        />
        <button disabled={status === "submitting" || code.trim() === ""} type="submit">
          Redeem
        </button>
      </div>
      {message ? <p className={status === "error" ? "form-message form-message-error" : "form-message"}>{message}</p> : null}
    </form>
  );
}
