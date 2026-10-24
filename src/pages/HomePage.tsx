import type { Target } from "../data/targets";
import type { Overview } from "../lib/hs";
import { cx } from "../lib/cx";

type Props = {
  targets: Target[];
  overview: Overview | null;
  onOpen: (id: string) => void;
  onOpenTutorial: () => void;
};

/** 首页：九平台卡片 + 使用教程卡，卡片统一尺寸，右上角注入状态圆点。 */
export function HomePage({ targets, overview, onOpen, onOpenTutorial }: Props) {
  const statusOf = (id: string) => {
    const t = overview?.targets.find((x) => x.id === id);
    return t?.installed ?? false;
  };

  return (
    <div className="sg-home">
      <div className="sg-home-head">
        <div>
          <h1 className="sg-home-title">破甲目标</h1>
          <p className="sg-home-sub">点击任意平台卡片，直接进入该平台的注入向导</p>
        </div>
      </div>

      <div className="sg-hint">
        <span>圆点绿 = 已注入，圆点灰 = 未注入；状态随注入 / 还原实时刷新。</span>
      </div>

      <div className="sg-grid">
        {targets.map((t) => {
          const on = statusOf(t.id);
          return (
            <button
              key={t.id}
              type="button"
              className="sg-card"
              onClick={() => onOpen(t.id)}
            >
              <span className="sg-card-top">
                <span className="sg-card-icon">{t.icon}</span>
                <span className={cx("sg-dot", on ? "on" : "off")} aria-hidden="true" />
              </span>
              <span>
                <span className="sg-card-name">{t.nav}</span>
                <span className={cx("sg-card-status", on && "on")}>
                  {on ? "已注入" : "未注入"}
                </span>
              </span>
            </button>
          );
        })}

        {/* 使用教程：海鸥青实心卡，尺寸与其他卡一致 */}
        <button type="button" className="sg-card tutorial" onClick={onOpenTutorial}>
          <span className="sg-card-top">
            <span className="sg-card-icon">?</span>
          </span>
          <span>
            <span className="sg-card-name">使用教程</span>
            <span className="sg-card-status">三步装好，立刻开用</span>
          </span>
        </button>
      </div>
    </div>
  );
}
