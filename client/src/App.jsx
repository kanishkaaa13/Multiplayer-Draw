import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import RoomPage from "./pages/RoomPage.jsx";

const defaultProfile = () => ({
  username: "Guest",
  color: "#7c3aed",
});

export default function App() {
  const [profile, setProfile] = useState(() => {
    try {
      const raw = localStorage.getItem("draw-profile");
      if (!raw) return defaultProfile();
      const p = JSON.parse(raw);
      return {
        username: p.username || defaultProfile().username,
        color: p.color || defaultProfile().color,
      };
    } catch {
      return defaultProfile();
    }
  });

  useEffect(() => {
    localStorage.setItem("draw-profile", JSON.stringify(profile));
  }, [profile]);

  return (
    <Routes>
      <Route
        path="/"
        element={<HomePage profile={profile} setProfile={setProfile} />}
      />
      <Route path="/room/:code" element={<RoomPage profile={profile} />} />
    </Routes>
  );
}
