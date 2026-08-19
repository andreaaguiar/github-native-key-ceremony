import React from "react";
import ReactDOM from "react-dom/client";

// Load the app via dynamic import so a config validation error (thrown while
// evaluating src/config.ts) is catchable here and shown as a readable message
// instead of a blank screen.
const root = ReactDOM.createRoot(document.getElementById("root")!);

import("./App")
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    root.render(
      <div style={{ maxWidth: 680, margin: "40px auto", fontFamily: "system-ui, sans-serif", padding: "0 16px", color: "#dc2626" }}>
        <h1 style={{ fontSize: 18 }}>Configuration error</h1>
        <p style={{ fontSize: 14 }}>{message}</p>
      </div>,
    );
  });
