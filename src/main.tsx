import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/*
  样式表与加载顺序全部照搬 PI-Desktop 的 globals.css（去掉 Tailwind 的
  @import "tailwindcss"，因为它的 @theme 刻度已由 scale.css 提供）。
  顺序即层叠，重排会改变渲染结果。
*/
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/scale.css";
import "./styles/base.css";
import "./styles/chrome.css";
import "./styles/chat-shell.css";
import "./styles/composer.css";
import "./styles/sidebar-threads.css";
import "./styles/messages.css";
import "./styles/prose.css";
import "./styles/ui-kit.css";
import "./styles/overlays.css";
import "./styles/theme-overrides.css";
import "./styles/composer-menus.css";
import "./styles/settings.css";
import "./styles/destinations.css";
import "./styles/projects.css";
import "./styles/project-create-dialog.css";
import "./styles/sessions.css";
import "./styles/work-panel.css";
import "./styles/providers.css";
import "./styles/model-config.css";
import "./styles/chat-links.css";
import "./styles/composer-autocomplete.css";
import "./styles/plugins.css";
import "./styles/extensions.css";
import "./styles/plugin-launcher.css";
import "./styles/responsive.css";
import "./styles/app.css";
import "./styles/seagull.css";

import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
