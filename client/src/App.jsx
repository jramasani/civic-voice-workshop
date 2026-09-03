import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { AdminPage } from "./pages/AdminPage";
import { CitizenPage } from "./pages/CitizenPage";
import { LoginPage } from "./pages/LoginPage";
const SESSION_KEY = "civicvoice-session", THEME_KEY = "civicvoice-theme";
export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem(SESSION_KEY) || "null"));
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme); }, [theme]);
  const login = (next) => { localStorage.setItem(SESSION_KEY, JSON.stringify(next)); setSession(next); };
  const logout = () => { localStorage.removeItem(SESSION_KEY); setSession(null); };
  return <><Header user={session?.user} onLogout={logout} theme={theme} onTheme={() => setTheme(theme === "light" ? "dark" : "light")} />
    {!session && <LoginPage onLogin={login} />}
    {session?.user.role === "citizen" && <CitizenPage session={session} />}
    {session?.user.role === "admin" && <AdminPage session={session} />}
  </>;
}
