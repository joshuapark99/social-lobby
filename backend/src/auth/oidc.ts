export type OidcProviderOptions = {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUrl: string;
  providerName?: string;
  scopes?: string[];
  fetch?: typeof fetch;
};

export type OidcIdentity = {
  userId?: string;
  provider: string;
  subject: string;
  email: string;
  name?: string;
  username?: string;
};

export class OidcProvider {
  private readonly options: OidcProviderOptions;

  constructor(options: OidcProviderOptions) {
    this.options = options;
  }

  authorizationUrl(state: string): string {
    if (state === "") {
      throw new Error("oidc state is required");
    }
    if (this.options.authUrl === "") {
      throw new Error("oidc auth url is required");
    }

    const url = new URL(this.options.authUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.options.clientId);
    url.searchParams.set("redirect_uri", this.options.redirectUrl);
    url.searchParams.set("scope", (this.options.scopes ?? ["openid", "email", "profile"]).join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchange(code: string): Promise<OidcIdentity> {
    if (code === "") {
      throw new Error("oidc code is required");
    }

    const fetchImpl = this.options.fetch ?? fetch;
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      redirect_uri: this.options.redirectUrl
    });

    const tokenResponse = await fetchImpl(this.options.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form
    });
    if (!tokenResponse.ok) {
      throw new Error("oidc token exchange failed");
    }
    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      throw new Error("oidc access token is required");
    }

    const userInfoResponse = await fetchImpl(this.options.userInfoUrl, {
      headers: { authorization: `Bearer ${tokenJson.access_token}` }
    });
    if (!userInfoResponse.ok) {
      throw new Error("oidc userinfo request failed");
    }
    const userInfo = (await userInfoResponse.json()) as { sub?: string; email?: string; name?: string };
    const identity = {
      provider: this.options.providerName ?? "google",
      subject: userInfo.sub ?? "",
      email: userInfo.email ?? "",
      name: userInfo.name
    };
    validateIdentity(identity);
    return identity;
  }
}

export function validateIdentity(identity: OidcIdentity): void {
  if (identity.provider === "") throw new Error("oidc provider is required");
  if (identity.subject === "") throw new Error("oidc subject is required");
  if (identity.email === "") throw new Error("oidc email is required");
}
