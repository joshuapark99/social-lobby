import { type FormEvent, useEffect, useState } from "react";
import { ApiError, type ApiClient } from "../shared/apiClient";
import type { CommunityInvite, CommunityMember, CommunityRoomsResponse, RoomListResponse } from "./api";

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
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [membersStatus, setMembersStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [managedInvites, setManagedInvites] = useState<CommunityInvite[]>([]);
  const [inviteManagementStatus, setInviteManagementStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [inviteTargetEmail, setInviteTargetEmail] = useState("");
  const [inviteMaxRedemptions, setInviteMaxRedemptions] = useState("1");
  const [inviteExpiresOn, setInviteExpiresOn] = useState(() => dateInputValue(addDays(new Date(), 14)));
  const [generatedInviteCode, setGeneratedInviteCode] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [createStatus, setCreateStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [roomName, setRoomName] = useState("");
  const [roomCreateStatus, setRoomCreateStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
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
    if ((!settingsOpen && !membersOpen) || !selectedCommunity) return;

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
  }, [apiClient, membersOpen, selectedCommunity, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen || !selectedCommunity || !canManageSelectedCommunity) return;

    let active = true;
    setInviteManagementStatus("loading");
    apiClient
      .listCommunityInvites(selectedCommunity.community.id)
      .then((response) => {
        if (!active) return;
        setManagedInvites(response.invites);
        setInviteManagementStatus("idle");
        setMessage("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setManagedInvites([]);
        setInviteManagementStatus("error");
        setMessage(error instanceof Error ? error.message : "Unable to load invites.");
      });

    return () => {
      active = false;
    };
  }, [apiClient, canManageSelectedCommunity, selectedCommunity, settingsOpen]);

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

  async function createManagedInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCommunity) return;

    setInviteManagementStatus("saving");
    setGeneratedInviteCode("");
    setMessage("");

    try {
      const createdInvite = await apiClient.createCommunityInvite(selectedCommunity.community.id, {
        targetEmail: inviteTargetEmail.trim() || null,
        maxRedemptions: inviteMaxRedemptions.trim() === "" ? null : Number(inviteMaxRedemptions),
        expiresAt: inviteExpiresOn ? `${inviteExpiresOn}T23:59:59.999Z` : null
      });
      const refreshedInvites = await apiClient.listCommunityInvites(selectedCommunity.community.id);
      setManagedInvites(refreshedInvites.invites);
      setInviteTargetEmail("");
      setInviteMaxRedemptions("1");
      setInviteExpiresOn(dateInputValue(addDays(new Date(), 14)));
      setGeneratedInviteCode(createdInvite.code);
      setInviteManagementStatus("idle");
      setMessage("Invite created.");
    } catch (error) {
      setInviteManagementStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to create invite.");
    }
  }

  async function revokeManagedInvite(inviteId: string) {
    if (!selectedCommunity) return;

    setInviteManagementStatus("saving");
    setMessage("");

    try {
      await apiClient.revokeCommunityInvite(selectedCommunity.community.id, inviteId);
      const refreshedInvites = await apiClient.listCommunityInvites(selectedCommunity.community.id);
      setManagedInvites(refreshedInvites.invites);
      setInviteManagementStatus("idle");
      setMessage("Invite revoked.");
    } catch (error) {
      setInviteManagementStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to revoke invite.");
    }
  }

  async function submitCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = communityName.trim();
    if (!name) return;

    setCreateStatus("submitting");
    setMessage("");

    try {
      const createdCommunity = await apiClient.createCommunity(name);
      setCommunities((current) => ({
        communities: [
          ...current.communities.filter((community) => community.community.id !== createdCommunity.community.id),
          createdCommunity
        ]
      }));
      setCommunityName("");
      setAddCommunityOpen(false);
      setCreateStatus("success");
      setSelectedCommunitySlug(createdCommunity.community.slug);
      setMessage("Community created.");

      const defaultRoom = createdCommunity.rooms.find((room) => room.isDefault) ?? createdCommunity.rooms[0];
      if (defaultRoom) navigateToRoom(createdCommunity, defaultRoom.slug);
    } catch (error) {
      setCreateStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to create community.");
    }
  }

  async function submitRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCommunity) return;
    const name = roomName.trim();
    if (!name) return;

    setRoomCreateStatus("submitting");
    setMessage("");

    try {
      const updatedCommunity = await apiClient.createCommunityRoom(selectedCommunity.community.id, name);
      setCommunities((current) => ({
        communities: current.communities.map((community) =>
          community.community.id === updatedCommunity.community.id ? updatedCommunity : community
        )
      }));
      setRoomName("");
      setRoomCreateStatus("success");
      setMessage("Room created.");
      const createdRoom =
        updatedCommunity.rooms.find((room) => room.name === name) ?? updatedCommunity.rooms[updatedCommunity.rooms.length - 1];
      if (createdRoom) navigateToRoom(updatedCommunity, createdRoom.slug);
    } catch (error) {
      setRoomCreateStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to create room.");
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
                setMembersOpen(false);
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
            setMembersOpen(false);
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
              <button
                className={`community-nav__members-toggle${membersOpen ? " community-nav__members-toggle-active" : ""}`}
                onClick={() => {
                  setAddCommunityOpen(false);
                  setSettingsOpen(false);
                  setMembersOpen((current) => !current);
                }}
                type="button"
              >
                {membersOpen ? "Hide members" : "Show all members"}
              </button>
              {canManageSelectedCommunity ? (
                <button
                  aria-label="Community settings"
                  className={`community-nav__settings-toggle${settingsOpen ? " community-nav__settings-toggle-active" : ""}`}
                  onClick={() => {
                    setAddCommunityOpen(false);
                    setMembersOpen(false);
                    setSettingsOpen((current) => !current);
                  }}
                  type="button"
                >
                  {settingsOpen ? "Hide settings" : "Community settings"}
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
        {membersOpen && selectedCommunity ? (
          <section className="community-nav__settings-panel" aria-label={`${selectedCommunity.community.name} members`}>
            <h3>Members</h3>
            {membersStatus === "loading" ? <p className="muted">Loading members...</p> : null}
            {members.map((member) => (
              <div className="community-nav__member" key={member.userId}>
                <div>
                  <strong>{member.username ?? member.displayName}</strong>
                  <span>{member.email ?? member.displayName}</span>
                </div>
                <span className="community-nav__role">{roleLabel(member.role)}</span>
              </div>
            ))}
          </section>
        ) : null}
        {settingsOpen && selectedCommunity && canManageSelectedCommunity ? (
          <section className="community-nav__settings-panel" aria-label={`${selectedCommunity.community.name} settings`}>
            <h3>Member settings</h3>
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
            <div className="community-nav__settings-divider" />
            <h3>Rooms</h3>
            <form className="community-nav__invite" onSubmit={submitRoom}>
              <label htmlFor="room-name">Create room</label>
              <div>
                <input
                  id="room-name"
                  maxLength={80}
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder="Room name"
                  value={roomName}
                />
                <button disabled={roomCreateStatus === "submitting" || roomName.trim() === ""} type="submit">
                  Create room
                </button>
              </div>
            </form>
            <div className="community-nav__settings-divider" />
            <h3>Invites</h3>
            <form className="community-nav__invite" onSubmit={createManagedInvite}>
              <label htmlFor="managed-invite-email">Create invite</label>
              <div>
                <input
                  id="managed-invite-email"
                  onChange={(event) => setInviteTargetEmail(event.target.value)}
                  placeholder="Email optional"
                  type="email"
                  value={inviteTargetEmail}
                />
                <input
                  aria-label="Max uses"
                  min={1}
                  onChange={(event) => setInviteMaxRedemptions(event.target.value)}
                  placeholder="Max uses"
                  type="number"
                  value={inviteMaxRedemptions}
                />
                <input
                  aria-label="Expiry date"
                  onChange={(event) => setInviteExpiresOn(event.target.value)}
                  type="date"
                  value={inviteExpiresOn}
                />
                <button disabled={inviteManagementStatus === "saving"} type="submit">
                  Create invite
                </button>
              </div>
            </form>
            {generatedInviteCode ? (
              <div className="community-nav__invite-code" aria-label="New invite code">
                <strong>{generatedInviteCode}</strong>
                <span>Share this code now. It will not be shown again.</span>
              </div>
            ) : null}
            {inviteManagementStatus === "loading" ? <p className="muted">Loading invites...</p> : null}
            <div className="community-nav__invite-list">
              {managedInvites.map((invite) => (
                <div className="community-nav__managed-invite" key={invite.id}>
                  <div>
                    <strong>{invite.targetEmail ?? "General invite"}</strong>
                    <span>ID {shortInviteId(invite.id)}</span>
                    <span>
                      {inviteStatusLabel(invite.status)} · {invite.redemptionCount}
                      {invite.maxRedemptions === null ? "" : `/${invite.maxRedemptions}`} used
                    </span>
                    <span>
                      Created {formatInviteDate(invite.createdAt)} · Expires {invite.expiresAt ? formatInviteDate(invite.expiresAt) : "Never"}
                    </span>
                  </div>
                  {invite.status === "active" ? (
                    <button
                      disabled={inviteManagementStatus === "saving"}
                      onClick={() => revokeManagedInvite(invite.id)}
                      type="button"
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="community-nav__role">{inviteStatusLabel(invite.status)}</span>
                  )}
                </div>
              ))}
              {inviteManagementStatus !== "loading" && managedInvites.length === 0 ? <p className="muted">No invites yet.</p> : null}
            </div>
          </section>
        ) : null}
        {addCommunityOpen ? (
          <section className="community-nav__add-panel" aria-label="Add community">
            <form className="community-nav__invite" onSubmit={submitCommunity}>
              <label htmlFor="community-name">Create community</label>
              <div>
                <input
                  autoFocus
                  id="community-name"
                  maxLength={80}
                  onChange={(event) => setCommunityName(event.target.value)}
                  placeholder="Community name"
                  value={communityName}
                />
                <button disabled={createStatus === "submitting" || communityName.trim() === ""} type="submit">
                  Create
                </button>
              </div>
            </form>
            <form className="community-nav__invite" onSubmit={submitInvite}>
              <label htmlFor="community-invite-code">Join with invite</label>
              <div>
                <input
                  id="community-invite-code"
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="Paste invite code"
                  value={inviteCode}
                />
                <button disabled={inviteStatus === "submitting" || inviteCode.trim() === ""} type="submit">
                  Redeem
                </button>
              </div>
            </form>
            {message ? (
              <p
                className={
                  createStatus === "error" ||
                  inviteStatus === "error" ||
                  inviteManagementStatus === "error" ||
                  roomCreateStatus === "error"
                    ? "form-message form-message-error"
                    : "form-message"
                }
              >
                {message}
              </p>
            ) : null}
          </section>
        ) : message ? (
          <p
            className={
              createStatus === "error" ||
              inviteStatus === "error" ||
              inviteManagementStatus === "error" ||
              roomCreateStatus === "error"
                ? "form-message form-message-error"
                : "form-message"
            }
          >
            {message}
          </p>
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

function inviteStatusLabel(status: CommunityInvite["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "used":
      return "Used";
  }
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatInviteDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function shortInviteId(id: string): string {
  return id.length > 12 ? id.slice(0, 8) : id;
}
