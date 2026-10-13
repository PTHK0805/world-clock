import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { NotificationCard } from "./components/NotificationCard";
import "./styles/global.css";

const params = new URLSearchParams(window.location.search);
const isNotification = params.get("view") === "notification";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isNotification ? (
      <NotificationCard
        title={params.get("title") ?? "Meeting"}
        body={params.get("body") ?? ""}
        sound={params.get("sound") !== "0"}
      />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
