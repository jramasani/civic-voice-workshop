import { useState } from "react";
import { Header } from "./components/Header";
import { AdminPage } from "./pages/AdminPage";
import { CitizenPage } from "./pages/CitizenPage";
import { LoginPage } from "./pages/LoginPage";

export default function App() {
  const [session, setSession] = useState(null);
  return (
    <>
      <Header user={session?.user} onLogout={() => setSession(null)} />
      {!session && <LoginPage onLogin={setSession} />}
      {session?.user.role === "citizen" && <CitizenPage user={session.user} />}
      {session?.user.role === "admin" && <AdminPage user={session.user} />}
    </>
  );
}
