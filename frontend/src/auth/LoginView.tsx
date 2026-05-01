export function LoginView() {
  return (
    <section className="welcome-hero">
      <div className="welcome-hero__copy">
        <p className="section-kicker">Social Lobby</p>
        <h2>Welcome to Social Lobby</h2>
        <p className="section-copy">
          A live social world built around rooms, presence, and fast drop-in conversation. Sign in with Google, claim your room identity, then move through shared spaces, unlocked communities, and live room chat.
        </p>
        <div className="welcome-hero__actions">
          <a className="google-button" href="/api/auth/login">
            Continue with Google
          </a>
          <p className="section-footnote">New users pick a username after sign-in. Invites unlock shared rooms from inside the app.</p>
        </div>
      </div>
      <div aria-hidden="true" className="welcome-hero__art">
        <img src="/illustrations/welcome-atrium.svg" />
      </div>
    </section>
  );
}
