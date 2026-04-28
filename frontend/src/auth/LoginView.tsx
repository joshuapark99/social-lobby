export function LoginView() {
  return (
    <section className="stack">
      <h2>Welcome to Social Lobby</h2>
      <p>Sign in with Google to enter the lobby and join rooms.</p>
      <p>
        <a href="/api/auth/login">Continue with Google</a>
      </p>
    </section>
  );
}
