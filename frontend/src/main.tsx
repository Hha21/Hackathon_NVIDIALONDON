import React from "react";
import ReactDOM from "react-dom/client";
import { ConversationProvider } from "@elevenlabs/react";
import App from "./App";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* ElevenLabs voice session context — useConversation / client tools live under this */}
    <ConversationProvider>
      <App />
    </ConversationProvider>
  </React.StrictMode>
);
