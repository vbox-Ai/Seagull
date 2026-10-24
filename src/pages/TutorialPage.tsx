import { TUTORIAL_TEXT } from "../data/targets";

export function TutorialPage() {
  return (
    <>
      <h1 className="settings-section-title">使用教程</h1>

      <div className="settings-card-block">
        <div className="settings-card-heading-row">
          <div>
            <h2 className="settings-card-heading">说明</h2>
            <p className="settings-card-description">
              填提示词 → 点安装 → 输入 lab： 就能用。不想要了点卸载，自动还原回去。
            </p>
          </div>
          <span className="badge badge-neutral">3 步上手</span>
        </div>

        <div className="panel-card" style={{ padding: "16px 18px" }}>
          <div className="app-prose">{TUTORIAL_TEXT}</div>
        </div>
      </div>
    </>
  );
}
