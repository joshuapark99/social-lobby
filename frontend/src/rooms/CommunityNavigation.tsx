import { type FormEvent, useEffect, useState } from "react";
import { ApiError, type ApiClient } from "../shared/apiClient";
import type { CommunityMember, CommunityRoomsResponse, RoomListResponse } from "./api";

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
  const [selectedCommunitySlug, setSelectedCommunitySlug] = useState(activeCommunitySlug ?? "");
  const [addCommunityOpen, setAddCommunityOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [membersStatus, setMembersStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
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
        setSelectedCommunitySlug((current) => {
          if (activeCommunitySlug && response.communities.some((community) => community.community.slug === activeCommunitySlug)) {
            return activeCommunitySlug;
          }
          if (current && response.communities.some((community) => community.community.slug === current)) return current;
          return response.communities[0]?.community.slug ?? "";
        });
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

  useEffect(() => {
    if (activeCommunitySlug) setSelectedCommunitySlug(activeCommunitySlug);
  }, [activeCommunitySlug]);

  const selectedCommunity =
    communities.communities.find((community) => community.community.slug === selectedCommunitySlug) ?? communities.communities[0] ?? null;
  const canManageSelectedCommunity =
    selectedCommunity?.community.viewerRole === "owner" || selectedCommunity?.community.viewerRole === "admin";
  const canAssignRoles = selectedCommunity?.community.viewerRole === "owner";

  useEffect(() => {
    if (!settingsOpen || !selectedCommunity) return;

    let active = true;
    setMembersStatus("loading");
    apiClient
      .listCommunityMembers(selectedCommunity.community.id)
      .then((response) => {
        if (!active) return;
        setMembers(response.members);
        setMembersStatus("idle");
        setMessage("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMembers([]);
        setMembersStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to load community members.");
      });

    return () => {
      active = false;
    };
  }, [apiClient, selectedCommunity, settingsOpen]);

  function navigateToRoom(community: RoomListResponse, roomSlug: string) {
    const pathname = `/community/${encodeURIComponent(community.community.slug)}/rooms/${encodeURIComponent(roomSlug)}`;
    window.history.pushState({}, "", pathname);
    onNavigate?.(pathname);
  }

  async function updateMemberRole(member: CommunityMember, role: "admin" | "member") {
    if (!selectedCommunity || member.role === "owner") return;

    setMembersStatus("saving");
    setMessage("");
    try {
      await apiClient.updateCommunityMemberRole(selectedCommunity.community.id, member.userId, role);
      setMembers((current) => current.map((candidate) => (candidate.userId === member.userId ? { ...candidate, role } : candidate)));
      setMembersStatus("idle");
    } catch (error) {
      setMembersStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to update member role.");
    }
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
        <div className="community-nav__switcher" aria-label="Community switcher">
          {communities.communities.map((community) => (
            <button
              aria-label={community.community.name}
              className={`community-nav__community${community.community.slug === selectedCommunity?.community.slug ? " community-nav__community-active" : ""}`}
              key={community.community.id}
              onClick={() => {
                setCollapsed(false);
                setAddCommunityOpen(false);
                setSettingsOpen(false);
                setSelectedCommunitySlug(community.community.slug);
              }}
              title={community.community.name}
              type="button"
            >
              {communityInitials(community.community.name)}
            </button>
          ))}
        </div>
        <button
          className={`community-nav__add${addCommunityOpen ? " community-nav__add-active" : ""}`}
          onClick={() => {
            setCollapsed(false);
            setSettingsOpen(false);
            setAddCommunityOpen((current) => !current);
          }}
          type="button"
          aria-label="Add community"
        >
          +
        </button>
        {selectedCommunity ? (
          <button
            aria-label="Community settings"
            className={`community-nav__settings${settingsOpen ? " community-nav__settings-active" : ""}`}
            onClick={() => {
              setCollapsed(false);
              setAddCommunityOpen(false);
              setSettingsOpen((current) => !current);
            }}
            type="button"
          >
            Settings
          </button>
        ) : null}
      </div>
      <div className="community-nav__panel">
        <div className="community-nav__header">
          <h2>{selectedCommunity?.community.name ?? "Communities"}</h2>
        </div>
        <div className="community-nav__sections">
          {communities.communities.length === 0 ? <p className="muted">Redeem an invite code to unlock community rooms.</p> : null}
          {selectedCommunity ? (
            <section className="community-nav__section" key={selectedCommunity.community.id}>
              {selectedCommunity.rooms.map((room) => (
                <button
                  className={`community-nav__room${selectedCommunity.community.slug === activeCommunitySlug && room.slug === activeRoomSlug ? " community-nav__room-active" : ""}`}
                  key={room.slug}
                  onClick={() => navigateToRoom(selectedCommunity, room.slug)}
                  type="button"
                >
                  <span>#</span>
                  {room.name}
                </button>
              ))}
            </section>
          ) : null}
        </div>
        {settingsOpen && selectedCommunity ? (
          <section className="community-nav__settings-panel" aria-label={`${selectedCommunity.community.name} settings`}>
            <h3>Members</h3>
            {membersStatus === "loading" ? <p className="muted">Loading members...</p> : null}
            {members.map((member) => (
              <div className="community-nav__member" key={member.userId}>
                <div>
                  <strong>{member.username ?? member.displayName}</strong>
                  <span>{member.email ?? member.displayName}</span>
                </div>
                {member.role === "owner" || !canAssignRoles ? (
                  <span className="community-nav__role">{roleLabel(member.role)}</span>
                ) : (
                  <button
                    disabled={membersStatus === "saving"}
                    onClick={() => updateMemberRole(member, member.role === "admin" ? "member" : "admin")}
                    type="button"
                  >
                    {member.role === "admin" ? "Remove admin" : "Make admin"}
                  </button>
                )}
              </div>
            ))}
          </section>
        ) : null}
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

function communityInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : name.slice(0, 2)).toUpperCase();
}

function roleLabel(role: CommunityMember["role"]): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "member":
      return "Member";
  }
}
