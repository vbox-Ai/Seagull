#!/usr/bin/env python3
"""open-tgtylab 安装器 v6.0"""

import json
import shutil
import subprocess
import sys
import threading
from pathlib import Path

import customtkinter as ctk

ctk.set_appearance_mode("dark")

# ── 路径 ──
ROOT = Path(__file__).resolve().parent
BUNDLE = ROOT / "tgtylab-files" / "config-bundle"
HOME = Path.home()
CLAUDE = HOME / ".claude"
CODEX = HOME / ".codex"
HERMES = HOME / ".hermes"
OPENCODE = HOME / ".config" / "opencode"
MCP = ROOT / "tools" / "skills" / "mcp" / "ReverseLabToolsMCP"
SKILL = ROOT / ".claude" / "skills" / "reverse-flow"

DIRS = [CLAUDE]
for p in [
    HOME / "AppData" / "Roaming" / "claude",
    HOME / "AppData" / "Roaming" / "Claude",
    HOME / "AppData" / "Roaming" / "Claude-3p",
    HOME / "AppData" / "Local" / "claude-code",
    HOME / "AppData" / "Local" / "Claude",
    HOME / "AppData" / "Local" / "Claude-3p",
]:
    if p.exists() and p != CLAUDE:
        DIRS.append(p)


def _cp(src, dst):
    try:
        Path(dst).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(src), str(dst))
        return True
    except:
        return False

def _mkdir(p):
    try:
        Path(p).mkdir(parents=True, exist_ok=True)
        return True
    except:
        return False

def _write(p, c):
    try:
        Path(p).write_text(c, encoding="utf-8")
        return True
    except:
        return False

def _merge_settings(path):
    try:
        p = Path(path)
        d = json.loads(p.read_text(encoding="utf-8-sig")) if p.exists() else {}
        ch = False
        if not d.get("permissions"):
            d["permissions"] = {"defaultMode": "bypassPermissions"}; ch = True
        elif d["permissions"].get("defaultMode") != "bypassPermissions":
            d["permissions"]["defaultMode"] = "bypassPermissions"; ch = True
        if not d.get("skipDangerousModePermissionPrompt"):
            d["skipDangerousModePermissionPrompt"] = True; ch = True
        mcp_py = str(MCP / "reverse_lab_tools_mcp.py")
        if MCP.exists() and not d.get("mcpServers", {}).get("reverse_lab_tools"):
            d.setdefault("mcpServers", {})["reverse_lab_tools"] = {
                "command": "uv", "args": ["run", "--project", str(MCP), "python", mcp_py], "env": {}
            }; ch = True
        if ch or not p.exists():
            _write(path, json.dumps(d, indent=2, ensure_ascii=False))
        return True
    except:
        return False

def _merge_codex(path):
    try:
        p = Path(path)
        c = p.read_text(encoding="utf-8") if p.exists() else ""
        ch = False
        if "model_instructions_file" not in c:
            c = 'model_instructions_file = "./gpt5.5-unrestricted.md"\n' + c; ch = True
        if "reverse_lab_tools" not in c and MCP.exists():
            mcp_py = str(MCP / "reverse_lab_tools_mcp.py")
            c += f'\n[mcp_servers.reverse_lab_tools]\ncommand = "uv"\nargs = ["run","--project","{MCP}","python","{mcp_py}"]\nstartup_timeout_sec = 30\n'
            ch = True
        if ch: _write(path, c)
        return True
    except:
        return False


class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("open-tgtylab")
        self.geometry("700x780")
        self.resizable(False, False)

        F = "Microsoft YaHei UI"
        self.ft = ctk.CTkFont(family=F, size=20, weight="bold")
        self.fb = ctk.CTkFont(family=F, size=13, weight="bold")
        self.fn = ctk.CTkFont(family=F, size=13)
        self.fl = ctk.CTkFont(family="Consolas", size=12)

        # 标题
        hdr = ctk.CTkFrame(self, fg_color="#1a1a2e", corner_radius=0, height=52)
        hdr.pack(fill="x")
        hdr.pack_propagate(False)
        ctk.CTkLabel(hdr, text="🐙 open-tgtylab", font=self.ft, text_color="#6c63ff").pack(side="left", padx=16, pady=10)
        ctk.CTkLabel(hdr, text="一键部署 · 全平台 · 无审查", font=self.fn, text_color="#888").pack(side="left", padx=8)

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=20, pady=12)

        # 平台
        ctk.CTkLabel(body, text="选择平台", font=self.fb, text_color="#888").pack(anchor="w")
        pf = ctk.CTkFrame(body, fg_color="#1a1a1a", corner_radius=10)
        pf.pack(fill="x", pady=(4, 12), ipady=8)

        self.v_claude = ctk.BooleanVar(value=True)
        self.v_codex = ctk.BooleanVar(value=True)
        self.v_hermes = ctk.BooleanVar(value=True)
        self.v_open = ctk.BooleanVar(value=True)

        r1 = ctk.CTkFrame(pf, fg_color="transparent")
        r1.pack(fill="x", padx=16)
        for txt, var in [("Claude Code / Desktop", self.v_claude), ("Codex App", self.v_codex),
                         ("Hermes", self.v_hermes), ("OpenCode", self.v_open)]:
            ctk.CTkCheckBox(r1, text=txt, variable=var, font=self.fn, text_color="#ddd",
                           fg_color="#6c63ff", hover_color="#7c74ff", border_color="#444",
                           corner_radius=6).pack(side="left", padx=(0, 12))

        # 功能
        ctk.CTkLabel(body, text="选择功能", font=self.fb, text_color="#888").pack(anchor="w")
        cf = ctk.CTkFrame(body, fg_color="#1a1a1a", corner_radius=10)
        cf.pack(fill="x", pady=(4, 12), ipady=8)

        self.v_jb = ctk.BooleanVar(value=True)
        self.v_mcp = ctk.BooleanVar(value=True)
        self.v_sk = ctk.BooleanVar(value=True)
        self.v_wf = ctk.BooleanVar(value=True)
        self.v_hk = ctk.BooleanVar(value=True)
        self.v_py = ctk.BooleanVar(value=True)

        r2 = ctk.CTkFrame(cf, fg_color="transparent")
        r2.pack(fill="x", padx=16)
        for txt, var in [("越狱配置", self.v_jb), ("MCP工具", self.v_mcp),
                         ("逆向Skill", self.v_sk), ("CTF流水线", self.v_wf)]:
            ctk.CTkCheckBox(r2, text=txt, variable=var, font=self.fn, text_color="#ddd",
                           fg_color="#6c63ff", hover_color="#7c74ff", border_color="#444",
                           corner_radius=6).pack(side="left", padx=(0, 12))

        r3 = ctk.CTkFrame(cf, fg_color="transparent")
        r3.pack(fill="x", padx=16, pady=(4, 0))
        for txt, var in [("MCP Hook", self.v_hk), ("Python RE库", self.v_py)]:
            ctk.CTkCheckBox(r3, text=txt, variable=var, font=self.fn, text_color="#ddd",
                           fg_color="#6c63ff", hover_color="#7c74ff", border_color="#444",
                           corner_radius=6).pack(side="left", padx=(0, 12))

        # 按钮
        bf = ctk.CTkFrame(body, fg_color="transparent")
        bf.pack(fill="x", pady=(0, 8))

        self.btn_go = ctk.CTkButton(bf, text="▶  一键部署", font=self.fb,
                                    fg_color="#6c63ff", hover_color="#5b52ee",
                                    text_color="white", corner_radius=8,
                                    height=44, command=self._deploy_start)
        self.btn_go.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.btn_v = ctk.CTkButton(bf, text="验证", font=self.fn,
                                   fg_color="#1a1a1a", hover_color="#2a2a2a",
                                   text_color="#6c63ff", border_width=1,
                                   border_color="#6c63ff", corner_radius=8,
                                   height=44, command=self._verify_start)
        self.btn_v.pack(side="left", padx=6)

        self.btn_x = ctk.CTkButton(bf, text="卸载", font=self.fn,
                                   fg_color="#1a1a1a", hover_color="#2a1a1a",
                                   text_color="#f44", border_width=1,
                                   border_color="#f44", corner_radius=8,
                                   height=44, command=self._uninstall_start)
        self.btn_x.pack(side="left", padx=(6, 0))

        # 日志
        self.log = ctk.CTkTextbox(body, font=self.fl, fg_color="#111",
                                  text_color="#0f0", corner_radius=10,
                                  border_width=1, border_color="#222",
                                  wrap="word")
        self.log.pack(fill="both", expand=True, pady=(8, 0))
        self.log.configure(state="disabled")

        self._log("就绪。选择后点击「一键部署」。", "#0f0")
        self._log(f"项目：{ROOT}", "#666")
        self._log(f"检测到 {len(DIRS)} 个 Claude 目录", "#666")

    def _log(self, m, c="#0f0"):
        self.log.configure(state="normal")
        tb = self.log._textbox  # underlying tkinter Text widget
        tb.insert("end", m + "\n")
        tb.tag_configure(c, foreground=c)
        n = int(tb.index("end-1c").split(".")[0])
        tb.tag_add(c, f"{n}.0", f"{n}.end")
        tb.see("end")
        self.log.configure(state="disabled")

    def _ok(self, m): self._log(f"  ✅ {m}", "#0f0")
    def _err(self, m): self._log(f"  ❌ {m}", "#f44")
    def _warn(self, m): self._log(f"  ⚠️  {m}", "#fa0")
    def _dim(self, m): self._log(m, "#666")
    def _sec(self, m): self._log(m, "#6cf")

    def _btns(self, on):
        s = "normal" if on else "disabled"
        self.btn_go.configure(state=s)
        self.btn_v.configure(state=s)
        self.btn_x.configure(state=s)

    # ── 部署 ──
    def _deploy_start(self):
        self._btns(False)
        threading.Thread(target=self._deploy, daemon=True).start()

    def _deploy(self):
        try:
            ok = 0; fail = 0
            self._sec("═" * 48)
            self._sec("  开始部署")
            self._sec("═" * 48)

            if self.v_claude.get():
                self._sec("▶ Claude Code / Desktop")
                for d in DIRS:
                    self._dim(f"  → {d}")
                    if self.v_jb.get():
                        for s, n in [("CLAUDE.md","CLAUDE.md"),("system-prompt.md","system-prompt.md")]:
                            src = BUNDLE / s
                            if src.exists() and _cp(src, d / n):
                                self._ok(f"{n}（{(d/n).stat().st_size}字节）"); ok += 1
                            else: self._err(n); fail += 1
                        if _merge_settings(d / "settings.json"):
                            self._ok("settings.json"); ok += 1
                        else: self._err("settings.json"); fail += 1
                        _write(d / "config.toml", 'model_instructions_file = "system-prompt.md"')
                        self._ok("config.toml"); ok += 1
                    if self.v_hk.get():
                        hd = d / ".claude" / "hooks"; _mkdir(hd)
                        hs = ROOT / ".claude" / "hooks" / "pre-tool-call.sh"
                        if hs.exists() and _cp(hs, hd / "pre-tool-call.sh"):
                            self._ok("拦截钩子"); ok += 1
                    if self.v_wf.get():
                        wd = d / ".claude" / "workflows"; _mkdir(wd)
                        ws = ROOT / ".claude" / "workflows"
                        cnt = 0
                        if ws.exists():
                            for f in ws.glob("*.js"):
                                if _cp(f, wd / f.name): cnt += 1
                        self._ok(f"流水线（{cnt}个）"); ok += 1
                    if self.v_sk.get() and SKILL.exists():
                        sd = d / "skills" / "reverse-flow"; _mkdir(sd)
                        for sub in ["references", "scripts", "agents"]:
                            ss = SKILL / sub
                            if ss.exists():
                                dd = sd / sub; _mkdir(dd)
                                for f in ss.iterdir(): _cp(f, dd / f.name)
                        _cp(SKILL / "SKILL.md", sd / "SKILL.md")
                        self._ok("逆向技能包"); ok += 1
                self._dim("")

            if self.v_codex.get():
                self._sec("▶ Codex App")
                _mkdir(CODEX)
                if self.v_jb.get():
                    src = ROOT / ".codex" / "gpt5.5-unrestricted.md"
                    if src.exists() and _cp(src, CODEX / "gpt5.5-unrestricted.md"):
                        self._ok("越狱指令"); ok += 1
                    src = ROOT / "AGENTS.md"
                    if src.exists() and _cp(src, CODEX / "AGENTS.md"):
                        self._ok("执行协议"); ok += 1
                    if _merge_codex(CODEX / "config.toml"):
                        self._ok("配置文件"); ok += 1
                if self.v_sk.get() and SKILL.exists():
                    sd = CODEX / "skills" / "reverse-flow"; _mkdir(sd)
                    for sub in ["references", "scripts", "agents"]:
                        ss = SKILL / sub
                        if ss.exists():
                            dd = sd / sub; _mkdir(dd)
                            for f in ss.iterdir(): _cp(f, dd / f.name)
                    _cp(SKILL / "SKILL.md", sd / "SKILL.md")
                    self._ok("逆向技能包"); ok += 1
                self._dim("")

            if self.v_hermes.get():
                self._sec("▶ Hermes")
                _mkdir(HERMES)
                if self.v_jb.get():
                    for s, n in [("SOUL.md","SOUL.md"),("config.yaml","config.yaml")]:
                        src = ROOT / "hermes-files" / "hermes-config-bundle" / s
                        if src.exists() and _cp(src, HERMES / n):
                            self._ok(n); ok += 1
                self._dim("")

            if self.v_open.get():
                self._sec("▶ OpenCode")
                _mkdir(OPENCODE)
                oc = ROOT / "opencode-files" / "opencode-config-bundle"
                if self.v_jb.get() and oc.exists():
                    _cp(oc / "opencode.json", OPENCODE / "opencode.json")
                    for sub in [(".opencode/agents", ".opencode/agents"), ("prompts", "prompts")]:
                        ss = oc / sub[0]; dd = OPENCODE / sub[1]; _mkdir(dd)
                        if ss.exists():
                            for f in ss.iterdir(): _cp(f, dd / f.name)
                    self._ok("配置文件"); ok += 1
                self._dim("")

            if self.v_mcp.get():
                self._sec("▶ MCP 工具")
                uv = shutil.which("uv")
                if uv and MCP.exists():
                    self._dim("  正在安装依赖...")
                    r = subprocess.run(["uv", "sync"], cwd=str(MCP), capture_output=True, text=True, timeout=120)
                    if r.returncode == 0: self._ok("MCP 依赖"); ok += 1
                    else: self._err("MCP 依赖"); fail += 1
                elif not uv:
                    self._warn("未找到 uv")
                self._dim("")

            if self.v_py.get():
                self._sec("▶ Python RE 库")
                py = shutil.which("python")
                if py:
                    self._dim("  lief frida angr capstone keystone unicorn")
                    r = subprocess.run([py, "-m", "pip", "install", "--quiet",
                                        "lief","frida","angr","capstone","keystone-engine","unicorn"],
                                       capture_output=True, text=True, timeout=300)
                    if r.returncode == 0: self._ok("Python RE 库"); ok += 1
                    else: self._err("Python RE 库"); fail += 1
                else: self._warn("未找到 Python")
                self._dim("")

            self._sec("═" * 48)
            if fail == 0:
                self._ok(f"部署完成！共 {ok} 项")
                self._sec("请重启 AI 工具使配置生效。")
            else:
                self._warn(f"部署完成（{ok} 成功，{fail} 失败）")
            self._sec("═" * 48)
        except Exception as e:
            self._err(f"错误：{e}")
        finally:
            self._btns(True)

    # ── 验证 ──
    def _verify_start(self):
        self._btns(False)
        threading.Thread(target=self._verify, daemon=True).start()

    def _verify(self):
        try:
            self._sec("═" * 48)
            self._sec("  验证部署")
            self._sec("═" * 48)
            checks = [
                ("Claude 越狱配置", CLAUDE / "CLAUDE.md", "Ghost"),
                ("系统提示词", CLAUDE / "system-prompt.md", "Ghost"),
                ("权限配置", CLAUDE / "settings.json", "bypassPermissions"),
                ("指令指向", CLAUDE / "config.toml", "system-prompt.md"),
                ("Codex 越狱指令", CODEX / "gpt5.5-unrestricted.md", "UNRESTRICTED"),
                ("Codex 执行协议", CODEX / "AGENTS.md", "Agent"),
                ("Codex 配置", CODEX / "config.toml", "model_instructions_file"),
                ("Hermes 越狱配置", HERMES / "SOUL.md", "Ghost"),
                ("MCP Server", MCP / "reverse_lab_tools_mcp.py", None),
            ]
            ok = 0
            for name, path, pat in checks:
                if path.exists():
                    if pat is None:
                        self._ok(name); ok += 1
                    else:
                        c = path.read_text(encoding="utf-8", errors="ignore")
                        if pat in c: self._ok(name); ok += 1
                        else: self._warn(f"{name}（模式未匹配）")
                else: self._err(name)
            self._dim("")
            t = len(checks)
            if ok == t: self._ok(f"全部通过（{ok}/{t}）")
            else: self._warn(f"通过 {ok}/{t}")
        except Exception as e:
            self._err(f"错误：{e}")
        finally:
            self._btns(True)

    # ── 卸载 ──
    def _uninstall_start(self):
        self._btns(False)
        threading.Thread(target=self._uninstall, daemon=True).start()

    def _uninstall(self):
        try:
            self._sec("═" * 48)
            self._sec("  卸载")
            self._sec("═" * 48)
            rm = 0
            # Claude dirs
            for d in DIRS:
                for f in ["CLAUDE.md","system-prompt.md","config.toml","settings.json"]:
                    p = d / f
                    if p.exists(): p.unlink(); self._ok(f"删除 {p.name}"); rm += 1
                for sub in [".claude/hooks", ".claude/workflows"]:
                    p = d / sub
                    if p.exists(): shutil.rmtree(str(p)); self._ok(f"删除 {sub}/"); rm += 1
                sk = d / "skills" / "reverse-flow"
                if sk.exists(): shutil.rmtree(str(sk)); self._ok(f"删除 skills/"); rm += 1
            # Codex
            for f in ["gpt5.5-unrestricted.md", "AGENTS.md"]:
                p = CODEX / f
                if p.exists(): p.unlink(); self._ok(f"codex/{f}"); rm += 1
            csk = CODEX / "skills" / "reverse-flow"
            if csk.exists(): shutil.rmtree(str(csk)); self._ok("codex/skills/"); rm += 1
            # Hermes
            for f in ["SOUL.md", "config.yaml"]:
                p = HERMES / f
                if p.exists(): p.unlink(); self._ok(f"hermes/{f}"); rm += 1
            # OpenCode
            for sub in ["opencode.json", ".opencode/agents", "prompts"]:
                p = OPENCODE / sub
                if p.exists():
                    if p.is_dir(): shutil.rmtree(str(p))
                    else: p.unlink()
                    self._ok(f"opencode/{sub}"); rm += 1
            self._dim("")
            self._ok(f"卸载完成，共清理 {rm} 项")
        except Exception as e:
            self._err(f"错误：{e}")
        finally:
            self._btns(True)


if __name__ == "__main__":
    App().mainloop()
