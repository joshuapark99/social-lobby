package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
)

type OIDCProvider struct {
	AuthURL      string
	TokenURL     string
	UserInfoURL  string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	ProviderName string
	Scopes       []string
	HTTPClient   *http.Client
}

type OIDCIdentity struct {
	Provider string
	Subject  string
	Email    string
	Name     string
}

func (p OIDCProvider) AuthorizationURL(state string) (string, error) {
	if state == "" {
		return "", errors.New("oidc state is required")
	}
	if p.AuthURL == "" {
		return "", errors.New("oidc auth url is required")
	}

	authURL, err := url.Parse(p.AuthURL)
	if err != nil {
		return "", err
	}

	scopes := p.Scopes
	if len(scopes) == 0 {
		scopes = []string{"openid", "email", "profile"}
	}

	query := authURL.Query()
	query.Set("response_type", "code")
	query.Set("client_id", p.ClientID)
	query.Set("redirect_uri", p.RedirectURL)
	query.Set("scope", strings.Join(scopes, " "))
	query.Set("state", state)
	authURL.RawQuery = query.Encode()
	return authURL.String(), nil
}

func (p OIDCProvider) Exchange(ctx context.Context, code string) (OIDCIdentity, error) {
	if code == "" {
		return OIDCIdentity{}, errors.New("oidc code is required")
	}
	if p.TokenURL == "" {
		return OIDCIdentity{}, errors.New("oidc token url is required")
	}
	if p.UserInfoURL == "" {
		return OIDCIdentity{}, errors.New("oidc userinfo url is required")
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("client_id", p.ClientID)
	form.Set("client_secret", p.ClientSecret)
	form.Set("redirect_uri", p.RedirectURL)

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, p.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return OIDCIdentity{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := p.httpClient()
	response, err := client.Do(request)
	if err != nil {
		return OIDCIdentity{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return OIDCIdentity{}, errors.New("oidc token exchange failed")
	}

	var tokenResponse struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(response.Body).Decode(&tokenResponse); err != nil {
		return OIDCIdentity{}, err
	}
	if tokenResponse.AccessToken == "" {
		return OIDCIdentity{}, errors.New("oidc access token is required")
	}

	userInfoRequest, err := http.NewRequestWithContext(ctx, http.MethodGet, p.UserInfoURL, nil)
	if err != nil {
		return OIDCIdentity{}, err
	}
	userInfoRequest.Header.Set("Authorization", "Bearer "+tokenResponse.AccessToken)

	userInfoResponse, err := client.Do(userInfoRequest)
	if err != nil {
		return OIDCIdentity{}, err
	}
	defer userInfoResponse.Body.Close()
	if userInfoResponse.StatusCode < 200 || userInfoResponse.StatusCode > 299 {
		return OIDCIdentity{}, errors.New("oidc userinfo request failed")
	}

	var userInfo struct {
		Subject string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
	}
	if err := json.NewDecoder(userInfoResponse.Body).Decode(&userInfo); err != nil {
		return OIDCIdentity{}, err
	}

	identity := OIDCIdentity{
		Provider: p.providerName(),
		Subject:  userInfo.Subject,
		Email:    userInfo.Email,
		Name:     userInfo.Name,
	}
	if err := identity.Validate(); err != nil {
		return OIDCIdentity{}, err
	}
	return identity, nil
}

func (i OIDCIdentity) Validate() error {
	if i.Provider == "" {
		return errors.New("oidc provider is required")
	}
	if i.Subject == "" {
		return errors.New("oidc subject is required")
	}
	if i.Email == "" {
		return errors.New("oidc email is required")
	}
	return nil
}

func (p OIDCProvider) httpClient() *http.Client {
	if p.HTTPClient != nil {
		return p.HTTPClient
	}
	return http.DefaultClient
}

func (p OIDCProvider) providerName() string {
	if p.ProviderName != "" {
		return p.ProviderName
	}
	return "google"
}
