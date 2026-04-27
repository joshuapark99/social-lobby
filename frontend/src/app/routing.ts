export type AppRoute =
  | { name: "login" }
  | { name: "invite"; code: string }
  | { name: "lobby" }
  | { name: "room"; roomId: string }
  | { name: "not-found" };

export function parseRoute(pathname: string): AppRoute {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return { name: "lobby" };
  }

  if (segments.length === 1 && segments[0] === "login") {
    return { name: "login" };
  }

  if (segments.length === 1 && segments[0] === "lobby") {
    return { name: "lobby" };
  }

  if (segments.length === 2 && segments[0] === "invite") {
    return { name: "invite", code: decodeURIComponent(segments[1]) };
  }

  if (segments.length === 2 && segments[0] === "rooms") {
    return { name: "room", roomId: decodeURIComponent(segments[1]) };
  }

  return { name: "not-found" };
}
