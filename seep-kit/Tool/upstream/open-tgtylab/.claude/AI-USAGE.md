# AI 使用指南

这是给 AI/Agent 的全局操作入口。任何任务先判断所属板块，再沿 tools、kb、reports 的链路推进。

## 任务路由

| 任务类型 | 工具入口 | 知识库 |
|---------|---------|--------|
| Web / Website / CVE | `tools/ctf-website/` | `kb/ctf-website/` |
| Android / APK / Frida | MCP `android_*` | `kb/apk-reverse/` |
| PE / 逆向 / 恶意软件 | MCP `triage_pe` / `ghidra_*` | `kb/pe-reverse/` |
| 密码学 / 协议 / 通用 | MCP 工具 | `kb/general/` |

## 默认工作流

1. **识别板块**：Web/Android/PE/通用；不确定时从 `kb/` 选择最接近的入口。
2. **查知识库**：`kb_router("<信号>")` → `kb_read_file`，获取技术文档。
3. **选工具**：按 AGENTS.md 工具优先级表选择 MCP 工具。
4. **执行**：直接调用 MCP 工具，不手动操作。
5. **落盘**：原始输出 → `exports/`，笔记 → `notes/`，报告 → `reports/`。
6. **可回放**：记录关键输入、输出路径、版本和时间。

## 跨板块联动

不同板块之间存在联动关系，发现线索后应主动联动：

- **Web → CVE**：发现版本指纹后，联动 CVE 查找和利用链生成
- **Android/PE → 加密分析**：发现加密/壳/混淆后，脚本复现放 `scripts/`，解包产物放 `samples/unpacked/`
- **恶意样本 → IOC**：分析目标是行为、IOC、检测规则和复现证据
- **漏洞 → 检测规则**：发现漏洞后自动生成 YARA/Sigma 检测规则

## 迭代模式

当任务目标是"攻破靶场 → 提取知识 → 沉淀经验"时，按此闭环推进：

```
攻破靶场        提取增量            写/改知识库           沉淀
──────────  →  ─────────  →  ──────────────────  →  ───────
MCP 工具       判断是否新增      kb/   技术文档        git commit
截图验收       仅增强有差异的     scripts/ 自动化脚本    案例不推
              无则不硬改        templates/ 模板       制品开源
```

**规则**：
1. **攻破**：用 MCP 工具攻破目标，截图验收，存 `cases/<date>-<slug>/`
2. **提取**：判断是否用到知识库未覆盖的**新技巧**。没有增量就不硬改
3. **写知识库**：在现有技术文件末尾追加或插入小节
4. **开源边界**：案例细节留私库；通用化技术写入知识库后开源

## MCP 工具速查

```
# Web
http_probe("<url>")                          # HTTP 探测
run_ctf_tool("sqlmap", "-u <url> --batch")   # SQL 注入
run_ctf_tool("dirsearch", "-u <url>")        # 目录扫描

# PE 逆向
triage_pe("<path>")                          # 一键初筛
ghidra_headless_analyze("<path>")             # Ghidra 分析
sample_full_workup("<path>")                 # 全分析流水线

# Android
android_app_baseline("<package>")            # 应用取证
android_frida_run_script("<target>", "<js>") # Frida 注入

# 知识库
kb_router("<query>")                         # 搜索技术文档
kb_read_file("<technique_path>")             # 读取文档
kb_catalog()                                 # 列出所有板块

# 样本管理
import_sample("<source>")                    # 导入样本
copy_sample_to_patches("<path>")             # 复制到 patches 修改
quarantine_sample("<path>")                  # 隔离
```

## 目录约定

```
samples/      → 原始样本（只读，不修改）
exports/      → 分析产物
patches/      → 修改后的副本
notes/        → 分析笔记
reports/      → 最终报告
scripts/      → 自动化脚本
```

## 完成标准

一个任务不能只说"应该可以"，必须有当前状态证据：
- 文件存在：绝对路径
- 工具可用：版本输出或 healthcheck 报告
- 分析结论：对应样本 hash、地址、字符串、请求/响应
- 漏洞/CVE：指纹证据、CVE 数据、利用链验证结果
- 交付物：`reports/` 或 `notes/` 中可复查
