import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installWebShim } from "./shim";
import App from "./App";
import "./styles.css";

// 浏览器模式下注入 web shim（替代 Electron preload）
installWebShim();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
