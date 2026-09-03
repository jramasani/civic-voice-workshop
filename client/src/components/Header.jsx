export function Header({ user, onLogout }) {
  return (
    <header className="site-header">
      <a className="brand" href="/">
        <span className="brand-mark">C</span>
        <span>CivicVoice</span>
      </a>
      <div className="header-actions">
        {user && <span className="signed-in">Signed in as {user.name}</span>}
        {user && <button className="text-button" onClick={onLogout}>Sign out</button>}
      </div>
    </header>
  );
}
