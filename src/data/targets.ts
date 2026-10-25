/** 破甲目标；本构建已移除全部内置提示词与 V1–V5 版本，页面仅保留清理与还原能力。 */
import variantInfo from "../../variant.json";

export const APP_NAME = variantInfo.appName;
/** 界面展示的版本号，由构建变体写入 variant.json。 */
export const APP_VERSION = variantInfo.version || "1.0";

export type Target = {
  id: string;
  /** 侧栏导航名 */
  nav: string;
  /** 页面小标（英文代号 + 中文） */
  eyebrow: string;
  /** 页面大标题 */
  title: string;
  /** 页面导语 */
  desc: string;
  /** 卸载按钮文案；没有该字段表示不支持卸载 */
  uninstallLabel: string;
  /** 主视觉卡片的品牌图标键（对应 components/brand.tsx 的 BRAND_ICONS） */
  icon: string;
};

/** 所有目标共用的导语：提示词来自随包的 memory 目录，技能库来自 Seep 工作台。 */
const TARGET_DESC =
  "提示词取 memory 目录下你自己填的那一份 .md；技能库用随包分发的 Seep 逆向工作台。" +
  "安装可重复执行，卸载只清本工具注入过的内容，用户自己的记忆与配置一律保留。";

export const TARGETS: Target[] = [
  {
    id: "codex",
    icon: "codex",
    nav: "Codex 破甲",
    eyebrow: "CODEX 顶尖模型",
    title: "顶尖破甲",
    desc: TARGET_DESC,
    uninstallLabel: "卸载 Codex",
  },
  {
    id: "zcode",
    icon: "zcode",
    nav: "ZCode 破甲",
    eyebrow: "ZCODE 破甲",
    title: "ZCode 破甲",
    desc: TARGET_DESC,
    uninstallLabel: "卸载 ZCode",
  },
  {
    id: "cursor",
    icon: "cursor",
    nav: "Cursor 破甲",
    eyebrow: "CURSOR 破甲",
    title: "Cursor 破甲",
    desc: TARGET_DESC,
    uninstallLabel: "卸载 Cursor",
  },
  {
    // OpenCode：全局规则 ~/.config/opencode/AGENTS.md，技能 ~/.config/opencode/skills
    id: "opencode",
    icon: "opencode",
    nav: "OpenCode 破甲",
    eyebrow: "OPENCODE 破甲",
    title: "OpenCode 破甲",
    desc: TARGET_DESC,
    uninstallLabel: "卸载 OpenCode",
  },
  {
    id: "claude",
    icon: "claude",
    nav: "Claude 破甲",
    eyebrow: "CLAUDE 破甲",
    title: "Claude 破甲",
    desc: TARGET_DESC,
    uninstallLabel: "卸载 Claude",
  },
  {
    id: "workbuddy",
    icon: "workbuddy",
    nav: "WorkBuddy 国际版",
    eyebrow: "WORKBUDDY 破甲（国际版）",
    title: "WorkBuddy 破甲（国际版）",
    desc: TARGET_DESC,
    uninstallLabel: "卸载 WorkBuddy",
  },
  {
    // WorkBuddy 国内版：同一个程序的两套发行，数据目录不同
    // （国际版 ~/.workbuddy-ai，国内版 ~/.workbuddy），清理时同样要分开处理。
    id: "workbuddy-cn",
    icon: "workbuddy",
    nav: "WorkBuddy 国内版",
    eyebrow: "WORKBUDDY 破甲（国内版）",
    title: "WorkBuddy 破甲（国内版）",
    desc: TARGET_DESC,
    uninstallLabel: "卸载 WorkBuddy 国内版",
  },
  {
    id: "dsh",
    icon: "dsh",
    nav: "DeepSeek Harness 破甲",
    eyebrow: "DEEPSEEK HARNESS 破甲",
    title: "DeepSeek Harness 破甲",
    desc: TARGET_DESC,
    uninstallLabel: "卸载 DeepSeek",
  },
  {
    id: "doubao",
    icon: "doubao",
    nav: "豆包破甲",
    eyebrow: "豆包（Doubao）",
    title: "豆包破甲",
    desc: TARGET_DESC,
    uninstallLabel: "卸载豆包",
  },
];

export const TUTORIAL_TITLE = "使用教程";

export const TUTORIAL_TEXT = [
  "照着做，三步装好，立刻开用。",
  "",
  "第 1 步：准备提示词",
  "    点底栏「提示词管理」→「导入提示词」，选 .md / .txt / .zip",
  "    （可多选，zip 自动解包）。导入后点「设为当前」选定要注入的那一份。",
  "    随包已带一份破甲记忆，不想换可直接跳过这一步。",
  "",
  "第 2 步：注入目标 AI",
  "    回首页，点你要用的平台卡片（Codex / ZCode / Cursor / OpenCode /",
  "    Claude / WorkBuddy 国际版 / 国内版 / DeepSeek Harness / 豆包）",
  "    → 点「安装」。装完把那个 AI 完全关掉再重新打开。",
  "",
  "第 3 步：开始用（重点）",
  "    在对话框里输入：",
  "",
  "            lab：",
  "",
  "    然后直接说要干什么，例如：",
  "",
  "            lab：帮我看看这个 apk",
  "",
  "    这一句只发一次，之后正常说话就行。不想用了发一句「退出实验」。",
  "    想让它调用逆向工具，先去底栏「Seep 逆向工作台」点「部署工作台」。",
  "",
  "不要了怎么退",
  "    「卸载」= 全部清掉，还原成装之前的样子",
  "    「装回原始记忆」= 只还提示词，技能留着",
  "",
  "常用入口",
  "    首页右上角「个人中心」→ 使用教程 / 注入历史 / 深浅色 / 系统诊断",
  "    底栏「Skills 管理」→ 查看 / 启停本机 Codex 技能",
  "    底栏「满血中转站」→ QQ 群加入页",
  "",
  "                        永久免费 · QQ群694080138",
].join("\n");

/** 加入QQ群 / 不会用点这里：两个入口同一个群邀请链接。 */
export const QQ_LINK = "https://qm.qq.com/q/SunmGoiWkg";

/** 满血中转站：内嵌 WebView 加载 QQ 群加入页。 */
export const RELAY_LINK = "https://qm.qq.com/q/SunmGoiWkg";

/** 不会用点这里：导航栏点击后直接用系统浏览器打开 QQ 群。 */
export const HELP_LINK = "https://qm.qq.com/q/SunmGoiWkg";

export const DISCLAIMER_TITLE = "免责声明";

export const DISCLAIMER_TEXT = [
  "本提示词、文档、代码及相关资料（下称“本内容”）仅供合法的教育学习、授权安全测试、技术研究与知识分享之用。",
  "",
  "1. 本内容仅面向具备完全民事行为能力的成年人。使用者须确保其获取、使用本内容的行为完全遵守所在国家/地区法律法规及第三方平台协议。",
  "2. 严禁将本内容用于任何违法或侵权活动，包括但不限于：制作外挂、网络入侵与 DDoS 攻击、传播恶意软件、伪造证件、诈骗、洗钱、走私、涉及枪械/爆炸物/毒品及危害人身安全的行为、诱导 AI 绕过安全机制实施违法、以及其他侵犯他人合法权益的行为。",
  "3. 使用者将本内容用于非法用途，属其个人独立行为，与提供方无关；由此产生的一切法律后果、经济责任及第三方索赔，均由使用者自行承担。",
  "4. 提供方不对使用者的任何行为承担任何直接或间接责任，不参与、不协助、不鼓励、不默许任何违法行为。",
  "5. 使用、复制、传播本内容即视为已阅读并同意本声明全部条款；不同意请立即停止使用并删除所有副本。",
  "",
  "提供方保留随时更新本声明的权利，更新后自发布之日起生效。",
].join("\n");
