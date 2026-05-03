import { type FormEvent, useEffect, useState } from "react";
import { ApiError, type ApiClient } from "../shared/apiClient";
import type { CommunityRoomsResponse, RoomListResponse } from "./api";

export function CommunityNavigation({
  apiClient,
  activeCommunitySlug,
  activeRoomSlug,
  onNavigate
}: {
  apiClient: ApiClient;
  activeCommunitySlug?: string;
  activeRoomSlug?: string;
  onNavigate?: (pathname: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [communities, setCommunities] = useState<CommunityRoomsResponse>({ communities: [] });
  const [addCommunityOpen, setAddCommunityOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    apiClient
      .listCommunities()
      .then((response) => {
        if (!active) return;
        setCommunities(response);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 403) {
          setCommunities({ communities: [] });
          return;
        }
        setMessage(error instanceof Error ? error.message : "Unable to load communities.");
      });

    return () => {
      active = false;
    };
  }, [apiClient]);

  function navigateToRoom(community: RoomListResponse, roomSlug: string) {
    const pathname = `/community/${encodeURIComponent(community.community.slug)}/rooms/${encodeURIComponent(roomSlug)}`;
    window.history.pushState({}, "", pathname);
    onNavigate?.(pathname);
  }

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = inviteCode.trim();
    if (!code) return;

    setInviteStatus("submitting");
    setMessage("");

    try {
      await apiClient.redeemInvite(code);
      const nextCommunities = await apiClient.listCommunities();
      setCommunities(nextCommunities);
      setInviteCode("");
      setAddCommunityOpen(false);
      setInviteStatus("success");
      setMessage("Invite accepted.");

      const newestCommunity = nextCommunities.communities.find((community) => community.rooms.length > 0);
      const defaultRoom = newestCommunity?.rooms.find((room) => room.isDefault) ?? newestCommunity?.rooms[0];
      if (newestCommunity && defaultRoom) navigateToRoom(newestCommunity, defaultRoom.slug);
    } catch (error) {
      setInviteStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to redeem invite.");
    }
  }

  return (
    <nav aria-label="Communities and rooms" className={`community-nav${collapsed ? " community-nav-collapsed" : ""}`}>
      <div className="community-nav__rail">
        <button
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="community-nav__toggle"
          onClick={() => setCollapsed((current) => !current)}
          type="button"
        >
          {collapsed ? ">" : "<"}
        </button>
        <button
          className={`community-nav__add${addCommunityOpen ? " community-nav__add-active" : ""}`}
          onClick={() => {
            setCollapsed(false);
            setAddCommunityOpen((current) => !current);
          }}
          type="button"
          aria-label="Add community"
        >
          +
        </button>
      </div>
      <div className="community-nav__panel">
        <div className="community-nav__header">
          <p className="section-kicker">Joined</p>
          <h2>Communities</h2>
        </div>
        <div className="community-nav__sections">
          {communities.communities.length === 0 ? <p className="muted">Redeem an invite code to unlock community rooms.</p> : null}
          {communities.communities.map((community) => (
            <section className="community-nav__section" key={community.community.id}>
              <p>{community.community.name}</p>
              {community.rooms.map((room) => (
                <button
                  className={`community-nav__room${community.community.slug === activeCommunitySlug && room.slug === activeRoomSlug ? " community-nav__room-active" : ""}`}
                  key={room.slug}
                  onClick={() => navigateToRoom(community, room.slug)}
                  type="button"
                >
                  <span>#</span>
                  {room.name}
                </button>
              ))}
            </section>
          ))}
        </div>
        {addCommunityOpen ? (
          <form className="community-nav__invite" onSubmit={submitInvite}>
            <label htmlFor="community-invite-code">Invite code</label>
            <div>
              <input
                autoFocus
                id="community-invite-code"
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="Paste invite code"
                value={inviteCode}
              />
              <button disabled={inviteStatus === "submitting" || inviteCode.trim() === ""} type="submit">
                Redeem
              </button>
            </div>
            {message ? <p className={inviteStatus === "error" ? "form-message form-message-error" : "form-message"}>{message}</p> : null}
          </form>
        ) : message ? (
          <p className={inviteStatus === "error" ? "form-message form-message-error" : "form-message"}>{message}</p>
        ) : null}
      </div>
    </nav>
  );
}
