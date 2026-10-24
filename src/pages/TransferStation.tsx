import { RELAY_LINK } from "../data/targets";

/** 满血中转站：内嵌 WebView 加载目标网址（第一版为百度）。 */
export function TransferStation() {
  return (
    <div className="sg-wizard" style={{ maxWidth: "none", height: "calc(100vh - 140px)" }}>
      <h1 className="settings-section-title">满血中转站</h1>
      <div
        style={{
          flex: 1,
          minHeight: 480,
          border: "1px solid var(--ds-border-default)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          background: "var(--ds-bg-inset)",
        }}
      >
        <webview
          src={RELAY_LINK}
          style={{ width: "100%", height: "100%" }}
          allowpopups={true}
        />
      </div>
    </div>
  );
}
