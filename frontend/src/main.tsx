import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { loadInjectedAppProps } from "./app/testHarness";
import "./app/App.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App {...loadInjectedAppProps()} />
  </StrictMode>,
);
