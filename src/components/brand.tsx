import type { ReactElement, ReactNode, SVGProps } from "react";

/**
 * 平台品牌图标（首页卡片 / 向导页用，替代原来的两字母缩写）。
 * 全部是简化后的品牌识别形：单色 path，颜色由外层 .sg-card-icon 的 currentColor
 * 或各品牌主色决定，保持小尺寸下的可辨识度。
 */

type BrandProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 24, ...rest }: BrandProps, children: ReactNode, viewBox = "0 0 24 24") {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** OpenAI / Codex：简化六瓣结环。 */
export function BrandCodex(props: BrandProps) {
  return base(
    props,
    <path
      d="M12 3.2c1.5-1.2 3.7-1 4.9.5.4.5.7 1.2.7 1.8 1.8.5 2.9 2.3 2.4 4.1-.2.6-.5 1.2-1 1.6.9 1.6.4 3.6-1.2 4.6-.5.3-1.1.5-1.7.6-.5 1.8-2.3 2.9-4.1 2.4-.6-.2-1.2-.5-1.6-1-1.6.9-3.6.4-4.6-1.2-.3-.5-.5-1.1-.6-1.7-1.8-.5-2.9-2.3-2.4-4.1.2-.6.5-1.2 1-1.6-.9-1.6-.4-3.6 1.2-4.6.5-.3 1.1-.5 1.7-.6.5-1.8 2.3-2.9 4.1-2.4.4.1.8.3 1.2.6Zm0 3.1-4 2.3v4.6l4 2.3 4-2.3V8.6l-4-2.3Z"
      fill="currentColor"
    />,
  );
}

/** ZCode：代码括号 + Z。 */
export function BrandZcode(props: BrandProps) {
  return base(
    props,
    <>
      <path
        d="M8.5 6.5 4.5 12l4 5.5M15.5 6.5l4 5.5-4 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M13.6 8.4h-3.4l3.4 3.4h-3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>,
  );
}

/** Cursor：等距立方体。 */
export function BrandCursor(props: BrandProps) {
  return base(
    props,
    <>
      <path d="M12 2.8 21 7.5v9L12 21.2 3 16.5v-9L12 2.8Z" fill="currentColor" opacity="0.18" />
      <path
        d="M12 2.8 21 7.5 12 12 3 7.5l9-4.7ZM21 7.5v9L12 21v-9M3 7.5v9l9 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </>,
  );
}

/** OpenCode：终端提示符。 */
export function BrandOpencode(props: BrandProps) {
  return base(
    props,
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M7 9.5 9.8 12 7 14.5M12 15h5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
  );
}

/** Claude / Anthropic：放射星芒。 */
export function BrandClaude(props: BrandProps) {
  return base(
    props,
    <path
      d="M12 2.6v7.1m0 4.6v7.1M3.9 7.3l6.1 3.6m4 2.2 6.1 3.6m0-9.4-6.1 3.6m-4 2.2-6.1 3.6"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
    />,
  );
}

/** WorkBuddy：圆角工作徽章 + 对勾。 */
export function BrandWorkbuddy(props: BrandProps) {
  return base(
    props,
    <>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" fill="currentColor" opacity="0.16" />
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="m8.2 12.3 2.6 2.6 5-5.4"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
  );
}

/** DeepSeek：简化鲸形。 */
export function BrandDeepseek(props: BrandProps) {
  return base(
    props,
    <path
      d="M20.8 8.2c-1.2-.9-2.6-1.2-4-1l-1.9-2.5c-.2-.3-.6-.2-.7.1l-.9 2.2c-2.7.4-5.2 1.9-6.8 4.2l-3 1.2c-.3.1-.4.5-.1.7l2.4 1.5c.3 3.4 3.1 6 6.5 6.1 3.9.1 7.2-3 7.3-6.9v-.5c0-1.2.5-2.3 1.4-3.1l.4-.4c.2-.2.2-.6 0-.8l-.6-.8Zm-5.1 4.3a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"
      fill="currentColor"
    />,
  );
}

/** 豆包：豆形 + 高光。 */
export function BrandDoubao(props: BrandProps) {
  return base(
    props,
    <>
      <path
        d="M12 3.4c4.6 0 8.2 3.2 8.2 7.4 0 4.9-3.9 9.8-8.2 9.8s-8.2-4.9-8.2-9.8c0-4.2 3.6-7.4 8.2-7.4Z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M12 3.4c4.6 0 8.2 3.2 8.2 7.4 0 4.9-3.9 9.8-8.2 9.8s-8.2-4.9-8.2-9.8c0-4.2 3.6-7.4 8.2-7.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8.6 8.2c.9-.7 2-1 3-1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>,
  );
}

/** 使用教程 / 兜底：海鸥翼。 */
export function BrandSeagull(props: BrandProps) {
  return base(
    props,
    <path
      d="M3 14.5c3-4.5 6.5-6.8 9-6.8 1.6 0 2.4.9 2.9 2.2.5-2.5 2-4.4 4.4-5.4-1.2 1.6-1.7 3.4-1.6 5.5 1.4-.6 2.9-.7 4.3-.3-2 .8-3.4 2.1-4.3 4-1 2.2-2.7 3.4-4.9 3.4-1.8 0-3.2-.8-4.2-2.3-1.7.9-3.6 1-5.6-.3Z"
      fill="currentColor"
    />,
  );
}

/** 图标键 → 组件映射；targets.ts 的 icon 字段存键名。 */
export const BRAND_ICONS: Record<string, (p: BrandProps) => ReactElement> = {
  codex: BrandCodex,
  zcode: BrandZcode,
  cursor: BrandCursor,
  opencode: BrandOpencode,
  claude: BrandClaude,
  workbuddy: BrandWorkbuddy,
  "workbuddy-cn": BrandWorkbuddy,
  dsh: BrandDeepseek,
  doubao: BrandDoubao,
  tutorial: BrandSeagull,
};

/** 按键取品牌图标；未知键回退海鸥翼。 */
export function BrandIcon({ id, ...rest }: BrandProps & { id: string }) {
  const C = BRAND_ICONS[id] || BrandSeagull;
  return <C {...rest} />;
}
