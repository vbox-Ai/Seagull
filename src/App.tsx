import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  APP_NAME,
  APP_VERSION,
  TARGETS,
  DISCLAIMER_TEXT,
  DISCLAIMER_TITLE,
  QQ_LINK,
} from "./data/targets";
import {
  hs,
  type DepsResult,
  type EnginesState,
  type InstalledMap,
  type MemoryPrompt,
  type Overview,
  type PromptFile,
  type ReaProgress,
  type SeepState,
  type Skill,
} from "./lib/hs";
import { cx } from "./lib/cx";
import {
  IconCheck,
  IconCircleAlert,
  IconDatabase,
  IconFileText,
  IconGlobe,
  IconHome,
  IconListChecks,
} from "./components/icons";
import { HomePage } from "./pages/HomePage";
import { Wizard } from "./pages/Wizard";
import { EnginesPage } from "./pages/EnginesPage";
import { SkillsPage } from "./pages/SkillsPage";
import { TutorialPage } from "./pages/TutorialPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PromptsPage } from "./pages/PromptsPage";
import { TransferStation } from "./pages/TransferStation";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";

type ViewId = "home" | "prompts" | "seep" | "skills" | "transfer" | "profile" | "tutorial" | "diag";
export type StatusLevel = "idle" | "busy" | "ok" | "err";

export function App() {
  const [consent, setConsent] = useState(false);
  const [view, setView] = useState<ViewId>("home");
  const [wizardTarget, setWizardTarget] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledMap>({});
  const [skills, setSkills] = useState<Skill[]>([]);
  const [memory, setMemory] = useState<MemoryPrompt>(null);
  const [seep, setSeep] = useState<SeepState>({ kit: false, installed: false, version: "" });
  const [overview, setOverview] = useState<Overview | null>(null);
  const [prompts, setPrompts] = useState<PromptFile[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [engines, setEngines] = useState<EnginesState | null>(null);
  const [reaProgress, setReaProgress] = useState<ReaProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("就绪");
  const [level, setLevel] = useState<StatusLevel>("idle");
  const [logText, setLogText] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [toastLevel, setToastLevel] = useState<"success" | "error">("success");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem("seagull-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [jitterId, setJitterId] = useState<string | null>(null);

  // 依赖检测/修复状态提升到 App：切页不卸载，后台 PowerShell 进程继续时 UI 不丢。
  const [depsResult, setDepsResult] = useState<DepsResult | null>(null);
  const [depsChecking, setDepsChecking] = useState(false);
  const [depsFixRunning, setDepsFixRunning] = useState(false);
  const [depsFixLog, setDepsFixLog] = useState("");
  const [depsFixMsg, setDepsFixMsg] = useState("");
  const depsFixRunningRef = useRef(false);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("seagull-theme", theme);
    } catch {
      /* 无痕/受限环境忽略 */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const reloadOverview = useCallback(() => hs.overview().then(setOverview), []);
  const reloadPrompts = useCallback(() => {
    hs.promptsList().then((list) => {
      setPrompts(list);
      const cur = list.find((p) => p.current) || list[0];
      if (cur) {
        // 之前选中的还在 → 保持；不在了（被删/刚导入还没选）→ 跟随当前注入源
        setSelectedPrompt((prev) => (prev && list.some((p) => p.name === prev) ? prev : cur.name));
      }
    });
  }, []);

  useEffect(() => {
    hs.state().then((s) => setInstalled(s.installed || {}));
    hs.listSkills().then(setSkills);
    hs.memory().then(setMemory);
    hs.seepState().then(setSeep);
    reloadOverview();
    reloadPrompts();
    hs.enginesState().then(setEngines);
  }, [reloadOverview, reloadPrompts]);

  useEffect(() => {
    const offLog = hs.onLog((p) => {
      setLogText((prev) => (prev + p.text).slice(-20000));
      if (depsFixRunningRef.current) {
        setDepsFixLog((prev) => (prev + p.text).slice(-20000));
      }
    });
    const offStatus = hs.onStatus((p) => {
      setBusy(p.state === "running");
      setStatus(p.label);
      setLevel(p.state === "running" ? "busy" : "idle");
    });
    const offNotify = hs.onNotify((p) => setToast(p.text));
    const offRea = hs.onReaProgress((p) => {
      setReaProgress(p);
      // 部署完成 / 失败收尾：进度条短暂停留后立即消失，不再常驻
      if (p.done) {
        window.setTimeout(() => setReaProgress(null), 1200);
      }
    });
    return () => {
      offLog();
      offStatus();
      offNotify();
      offRea();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const reloadSkills = useCallback(() => {
    hs.listSkills().then(setSkills);
  }, []);

  const runUninstall = useCallback(
    async (targetId: string) => {
      setLogText("");
      setStatus("正在卸载 …");
      setLevel("busy");
      setBusy(true);
      const res = await hs.uninstall(targetId);
      setInstalled(res.installed || {});
      setStatus(res.ok ? "已卸载 · 技能已一并清除" : "卸载失败（退出码 " + res.code + "）");
      setLevel(res.ok ? "ok" : "err");
      setBusy(false);
      reloadSkills();
      reloadOverview();
    },
    [reloadSkills, reloadOverview],
  );

  const runInstall = useCallback(
    async (targetId: string) => {
      setLogText("");
      setStatus("正在安装 …");
      setLevel("busy");
      setBusy(true);
      const res = await hs.install(targetId);
      setInstalled(res.installed || {});
      if (res.ok) {
        setStatus("已安装 · 提示词与技能库已写入");
        setLevel("ok");
      } else {
        setStatus("安装失败（退出码 " + res.code + "）");
        setLevel("err");
        const reason = res.error || res.out || "";
        if (reason.includes("记忆文件为空")) {
          setToastLevel("error");
          setToast("记忆文件为空：请先把提示词粘进 memory 目录下的 .md 文件");
        }
      }
      setBusy(false);
      reloadSkills();
      reloadOverview();
    },
    [reloadSkills, reloadOverview],
  );

  const runSeep = useCallback(
    async (action: "install" | "uninstall" | "verify") => {
      setLogText("");
      const label = { install: "正在部署 Seep 工作台 …", uninstall: "正在卸载 Seep 工作台 …", verify: "正在自检 …" }[action];
      setStatus(label);
      setLevel("busy");
      setBusy(true);
      const res =
        action === "install"
          ? await hs.seepInstall()
          : action === "uninstall"
            ? await hs.seepUninstall()
            : await hs.seepVerify();
      if (res.ok) {
        setStatus(
          action === "install" ? "Seep 工作台已部署" : action === "uninstall" ? "Seep 工作台已卸载" : "自检完成",
        );
        setLevel("ok");
      } else {
        setStatus((action === "verify" ? "自检失败" : action === "install" ? "部署失败" : "卸载失败") + "（退出码 " + res.code + "）");
        setLevel("err");
      }
      setBusy(false);
      hs.seepState().then(setSeep);
      reloadSkills();
    },
    [reloadSkills],
  );

  const runRestoreMemory = useCallback(
    async (targetId: string) => {
      setLogText("");
      setStatus("正在装回原始记忆 …");
      setLevel("busy");
      setBusy(true);
      const res = await hs.restoreMemory(targetId);
      setInstalled(res.installed || {});
      setStatus(res.ok ? "原始记忆已装回 · 自动重注入已暂停" : "装回失败（退出码 " + res.code + "）");
      setLevel(res.ok ? "ok" : "err");
      setBusy(false);
    },
    [],
  );

  const runRestart = useCallback(async () => {
    setStatus("正在重启 Codex …");
    setLevel("busy");
    const res = await hs.restartCodex();
    if (res.ok) {
      setStatus("Codex 已重启");
      setLevel("ok");
    } else {
      setStatus("重启失败：" + (res.error || "未知错误"));
      setLevel("err");
    }
  }, []);

  const runRestartDsh = useCallback(async () => {
    setStatus("正在重启 DeepSeek Harness …");
    setLevel("busy");
    setBusy(true);
    const res = await hs.restartDsh();
    if (res.ok) {
      setStatus("DeepSeek Harness 已重启 · 全局记忆已重新加载");
      setLevel("ok");
      setToastLevel("success");
      setToast("DSH 已重启，注入的提示词现在生效");
    } else {
      setStatus("DSH 重启失败：" + (res.error || "未知错误"));
      setLevel("err");
    }
    setBusy(false);
  }, []);

  const runDepsCheck = useCallback(async () => {
    setDepsChecking(true);
    const r = await hs.depsCheck();
    setDepsResult(r);
    setDepsChecking(false);
  }, []);

  const runDepsFix = useCallback(async () => {
    if (depsFixRunningRef.current) return;
    depsFixRunningRef.current = true;
    setDepsFixRunning(true);
    setDepsFixMsg("正在修复依赖，请耐心等待（首次修复需要下载工具链，可能需要较长时间）…");
    setDepsFixLog("");
    try {
      const r = await hs.depsFix();
      if (r.partial && r.depsResults) {
        setDepsFixMsg(
          `部分修复完成：成功 ${r.depsResults.ok.length} 项，失败 ${r.depsResults.failed.length} 项（${r.depsResults.failed.join("、") || "无"}）。可重跑失败项。`,
        );
      } else if (r.ok) {
        setDepsFixMsg("依赖修复完成，正在重新检测 …");
      } else {
        setDepsFixMsg(
          "依赖修复失败：" + (r.error || r.out?.slice(-300) || "退出码 " + r.code),
        );
      }
    } finally {
      depsFixRunningRef.current = false;
      setDepsFixRunning(false);
      // 修复完成后刷新共享检测结果（切页后回来也能看到最新状态）
      await runDepsCheck();
    }
  }, [runDepsCheck]);

  const saveSkills = useCallback(
    async (disabled: string[]) => {
      const res = await hs.saveSkills(disabled);
      if (res.ok) {
        setStatus("Skills 配置已保存 — 重启 Codex 生效");
        setLevel("ok");
        setToastLevel("success");
        setToast("Skills 配置已保存 · 重启 Codex 生效");
        reloadSkills();
      } else {
        setStatus("保存失败：" + (res.error || "无法写入 config.toml"));
        setLevel("err");
        setToastLevel("error");
        setToast("保存失败：" + (res.error || "无法写入 config.toml"));
      }
    },
    [reloadSkills],
  );

  const currentTarget = useMemo(() => TARGETS.find((t) => t.id === wizardTarget), [wizardTarget]);

  // 个人中心里 导入/删除/设为当前 后，同步刷新注入向导那份提示词列表
  const handlePromptsChanged = useCallback(
    (selected?: string) => {
      if (selected) setSelectedPrompt(selected);
      reloadPrompts();
    },
    [reloadPrompts],
  );

  const openLink = (url: string) => hs.openQQ(url);
  const openQQ = () => openLink(QQ_LINK);

  const openWizard = (id: string) => {
    setWizardTarget(id);
    setLogText("");
  };

  const selectPrompt = async (name: string) => {
    setSelectedPrompt(name);
    await hs.promptsSelect(name);
    reloadPrompts();
  };

  const dockItem = (id: ViewId, Icon: typeof IconHome, label: string) => (
    <button
      key={id}
      type="button"
      className={cx("sg-dock-btn", view === id && "active", jitterId === id && "jitter")}
      aria-label={label}
      title={label}
      onClick={() => {
        setWizardTarget(null);
        setView(id);
        setJitterId(id);
        window.setTimeout(() => setJitterId((cur) => (cur === id ? null : cur)), 220);
      }}
    >
      <Icon size={18} />
    </button>
  );

  return (
    <div className="app-shell settings-mode">
      <div className="settings-shell-full">
        <div className="settings-content" style={{ padding: 0 }}>
          <div className="settings-content-inner">
            {currentTarget && wizardTarget ? (
              <Wizard
                target={currentTarget}
                prompts={prompts}
                selectedPrompt={selectedPrompt}
                onSelectPrompt={selectPrompt}
                engines={engines}
                reaProgress={reaProgress}
                busy={busy}
                status={status}
                level={level}
                logText={logText}
                onInstall={() => runInstall(currentTarget.id)}
                onRestore={() => runRestoreMemory(currentTarget.id)}
                onRestartDsh={runRestartDsh}
                onBack={() => {
                  setWizardTarget(null);
                  setView("home");
                }}
                onManagePrompts={() => {
                  setWizardTarget(null);
                  setView("profile");
                }}
              />
            ) : (
              <>
                {view === "home" && (
                  <HomePage
                    targets={TARGETS}
                    overview={overview}
                    onOpen={openWizard}
                    onOpenProfile={() => setView("profile")}
                  />
                )}

                {view === "prompts" && (
                  <PromptsPage onPromptsChanged={handlePromptsChanged} />
                )}

                {view === "seep" && (
                  <EnginesPage
                    seep={seep}
                    busy={busy}
                    status={status}
                    level={level}
                    logText={logText}
                    onSeepInstall={() => runSeep("install")}
                    onSeepVerify={() => runSeep("verify")}
                    onSeepUninstall={() => runSeep("uninstall")}
                    deps={depsResult?.deps ?? null}
                    depsError={depsResult && !depsResult.ok ? depsResult.error || "" : ""}
                    depsBusy={depsChecking}
                    depsMsg={depsFixMsg}
                    fixLog={depsFixLog}
                    fixing={depsFixRunning}
                    onDepsCheck={runDepsCheck}
                    onDepsFix={runDepsFix}
                  />
                )}

                {view === "skills" && (
                  <div className="sg-wizard">
                    <SkillsPage skills={skills} onSave={saveSkills} onReload={reloadSkills} />
                  </div>
                )}

                {view === "transfer" && <TransferStation />}

                {view === "tutorial" && (
                  <div className="sg-wizard">
                    <TutorialPage />
                  </div>
                )}

                {view === "profile" && (
                  <ProfilePage
                    version={APP_VERSION}
                    status={status}
                    level={level}
                    theme={theme}
                    onToggleTheme={toggleTheme}
                    onOpenQQ={openQQ}
                    onOpenTutorial={() => setView("tutorial")}
                    onQuit={() => hs.quit()}
                    onOpenDiag={() => setView("diag")}
                  />
                )}

                {view === "diag" && (
                  <DiagnosticsPage
                    depsResult={depsResult}
                    checking={depsChecking}
                    fixing={depsFixRunning}
                    fixMsg={depsFixMsg}
                    fixLog={depsFixLog}
                    onCheck={runDepsCheck}
                    onFix={runDepsFix}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* 悬浮胶囊底栏：五入口只显示图标 */}
        <nav className="sg-dock" aria-label="主导航">
          {dockItem("home", IconHome, "首页")}
          {dockItem("prompts", IconFileText, "提示词管理")}
          {dockItem("seep", IconDatabase, "Seep 逆向工作台")}
          {dockItem("skills", IconListChecks, "Skills 管理")}
          {dockItem("transfer", IconGlobe, "满血中转站")}
        </nav>
      </div>

      {toast && (
        <div
          className={cx("toast", toastLevel === "error" ? "toast-error-solid" : "toast-success-solid")}
          onClick={() => setToast(null)}
        >
          {toastLevel === "error" ? <IconCircleAlert size={16} /> : <IconCheck size={16} />}
          <span>{toast}</span>
        </div>
      )}

      {!consent && (
        <div className="overlay">
          <div className="dialog">
            <h2 className="settings-card-heading">{DISCLAIMER_TITLE}</h2>
            <div className="consent-body">{DISCLAIMER_TEXT}</div>
            <div className="app-inline-actions">
              <button type="button" className="btn btn-primary" onClick={() => setConsent(true)}>
                我同意 并接受所有条约
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => hs.quit()}>
                拒绝并退出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
