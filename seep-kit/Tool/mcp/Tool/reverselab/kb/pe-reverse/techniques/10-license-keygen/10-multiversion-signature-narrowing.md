---
id: "pe-reverse/10-license-keygen/10-multiversion-signature-narrowing"
title: "多版本特征码收窄与数据段填充漂移陷阱"
title_en: "Multi-Version Signature Narrowing & .data Padding-Drift Pitfall"
summary: >
  当把跨版本 AOB 特征码从 3 个版本扩展到 5 个版本时，会遇到两个结构性陷阱：一是
  「共同稳定区收窄」——参与版本越多，逐字节一致区域越小，特征码急剧变短；二是
  「数据段非均匀填充漂移」——常量池前方新增零填充字节会让滑动汉明距离锁定到早若干字节的
  近邻位置，且汉明距离极小（看起来是完美匹配）。本文给出两者的成因、判据与修正流程：
  模糊匹配只产生候选，必须经「期望字节精确匹配 + 精确锚点重定位 + capstone 反汇编语义对照」
  三重确认，并断言既有版本产物哈希零变化。
summary_en: >
  Two structural pitfalls appear when extending cross-version AOB signatures from three to five
  releases. First, "common stable-region narrowing": the more versions participate, the smaller the
  byte-identical region becomes, shrinking signatures sharply. Second, ".data non-uniform padding
  drift": newly inserted zero-padding ahead of a constant pool makes sliding Hamming-distance
  matching lock onto a near-miss position a few bytes early — with a suspiciously small distance
  that looks like a perfect match. This note covers causes, decision criteria and the corrective
  workflow: fuzzy matching only produces candidates, which must pass triple confirmation (exact
  expected-byte match, exact-anchor relocation, capstone semantic cross-check) plus a
  zero-regression assertion on existing versions' output hashes.
board: "pe-reverse"
category: "10-license-keygen"
signals:
  - "多版本特征码"
  - "特征码收窄"
  - "共同稳定区"
  - "数据段漂移"
  - "填充漂移"
  - "对齐填充"
  - "常量池位移"
  - "滑动汉明距离"
  - "汉明距离极小但位置错误"
  - "模糊匹配误命中"
  - "近邻偏移"
  - "精确锚点定位"
  - "字符串锚定"
  - "跨版本迁移翻车"
  - "零回归断言"
  - "特征码唯一性"
  - "双态唯一性"
mcp_tools:
  - triage_pe
  - ghidra_headless_analyze
  - ghidra_summary_functions
keywords:
  - "signature narrowing"
  - "padding drift"
  - "Hamming distance false positive"
  - "exact anchor relocation"
  - "multi-version signature"
  - "zero regression"
difficulty: "advanced"
tags:
  - "aob"
  - "cross-version"
  - "patch-migration"
  - "data-section"
  - "verification-discipline"
---

# 多版本特征码收窄与数据段填充漂移陷阱

## 1. 适用场景

把一套**跨版本 AOB 特征码补丁表**从 N 个版本扩展到 N+1 个版本时，
尤其是新增版本属于**较大重编译**（而非微修订）的情况。

典型信号：

- 新增版本上部分特征码零命中，引擎按 fail-closed 熔断；
- 把新版本加入生成器后，所有特征码长度**急剧变短**；
- 某个数据段位点的模糊匹配给出「距离很小」但**期望字节不符**的结果。

---

## 2. 陷阱一：共同稳定区收窄（结构性，无法规避）

### 2.1 成因

特征码生成器的核心约束是「**只保留在所有已采集版本中逐字节一致的字节**」，
以便天然排除编译器重定位指针、绝对地址常量、版本相关字面量。

因此向左右扩展时，只要**任一版本**在该位置不同，扩展即停止：

```python
def grow(offs, plen):
    left = 0
    while left < MAXLEN:
        vals = [data[i][offs[i] - left - 1] for i in range(NV)]
        if len(set(vals)) != 1: break      # 任一版本不同 -> 停止
        left += 1
    ...
```

版本越多，**交集越小**，特征码越短。

### 2.2 实测数据（3 版本 → 5 版本）

| 位点 | 3 版本 | 5 版本 | 收窄 |
|---|---|---|---|
| 授权分支检测 | 118 B | **24 B** | −80% |
| 试用期最大值 | 90 B | **13 B** | −86% |
| 守护线程 F | 80 B | **29 B** | −64% |
| 特征码总字节 | ~1,050 B | **378 B** | −64% |
| 平均长度 | ~70 B | **25.2 B** | −64% |

### 2.3 判据与权衡

**不要**为了「保持特征码长度」而放松共同稳定区约束 ——
那会把版本相关字节纳入特征码，导致新版本必然失效（这正是单版本特征码的老毛病）。

正确的安全边界是**运行时双保险**：

| 保障 | 作用 |
|---|---|
| 特征码在目标版本中**唯一命中**（命中数 == 1） | 防止短特征码误命中 |
| 命中位置处**期望字节精确匹配** | 防止位置正确但内容不符 |
| 任一**必需**位点未命中 → 零字节写入 | fail-closed，绝不写坏 |

> **结论**：短特征码在工程上安全，前提是「唯一性 + 期望字节」两道闸门都在。

---

## 3. 陷阱二：数据段填充漂移（隐蔽，必须靠纪律兜住）

### 3.1 现象

同一常量池在两个版本中的**尾部**高度一致，但**头部填充**发生了变化：

```
b11.3/b12.3 : … 6E 74 73 40 40 │ 00 00 00       │ 01 00 00 00 │ 01 00 00 00 │ 1E 00 00 00 …
b15.3       : … 6E 74 73 40 40 │ 00 00 00 00 00 │ 01 00 00 00 │ 01 00 00 00 │ 1E 00 00 00 …
                                      ↑ 多出 2 个零填充字节
```

滑动汉明距离给出的结果是：

| 项 | 值 |
|---|---|
| 最佳位置 | **早 2 字节**的近邻位置 |
| 汉明距离 | **2**（在 64 字节窗口下，随机期望 ≈62） |
| 按「≤ 8 即命中」判据 | **完全合格** |
| 该位置的实际字节 | `01 00 00 00 01 00 00 00` |
| 期望字节 | `01 00 00 00 1E 00 00 00` |

**若只信汉明距离**，就会把补丁写到错误偏移，把常量池写坏 —— 而且因为
「距离只有 2」，人工复核时极易放过。

### 3.2 为什么汉明距离对此失效

汉明距离度量的是**整体相似度**，对**结构对齐**不敏感：

- 填充漂移只改变了**少数几个字节**（本例 2 个），对整体距离影响极小；
- 但位置偏移会导致**整个窗口的内容错位**，语义完全改变。

**填充、对齐、常量池重排**是汉明距离的天然盲区。

### 3.3 修正流程（三重确认）

```
① 模糊匹配（汉明距离）
      ↓  只产生「候选位置」
② 期望字节精确匹配
      ↓  不符 → 进入 ③
③ 精确锚点搜索
      · 用邻近的稳定字符串（如 "AVCDownloadComponents"）+ 常量对做精确 find
      · 或用邻近函数边界 / 节区特征做结构锚定
      ↓
④ capstone 反汇编语义对照
      · 与已知正确版本的基线逐条比对指令序列
      ↓
⑤ 端到端产物断言
      · 差异字节必须全部落在「补丁位点 ∪ PE 校验和 ∪ 签名目录」内
```

### 3.4 精确锚点示例

```python
# ❌ 只信模糊匹配
pos, dist, _ = fuzzy(sig)          # dist=2 看起来完美
patch_at = pos + poff              # -> 错误偏移

# ✅ 用稳定字符串做精确锚点
anchor = b"AVCDownloadComponents"
a = data.find(anchor)              # 唯一定位
sig_start = a - 8                  # 签名相对锚点的固定偏移
patch_at = sig_start + poff        # -> 正确偏移
assert data[patch_at:patch_at+8] == bytes.fromhex("010000001E000000")
```

---

## 4. 零回归断言（扩展版本时的强制动作）

扩展支持范围时，**必须**断言既有版本的产物哈希**逐字节不变**：

| 版本 | 产物 SHA256 | 断言 |
|---|---|---|
| build 10 | `712BD0D9…` | 与上一代引擎**一致** |
| build 11.2 | `3470B5B8…` | 与上一代引擎**一致** |
| build 11.3 | `641A6D97…` | 与上一代引擎**一致** |
| build 12.3 | `B9B6F951…` | 新增 |
| build 15.3 | `5005D219…` | 新增 |

> 若既有版本哈希发生变化，说明特征码或补丁语义被无意改动，
> 必须回查 `grow()` 的版本列表与位点偏移表。

---

## 5. 检查清单

| # | 检查项 | 通过判据 |
|:--:|---|---|
| 1 | 特征码由**全部已采集版本**交集生成 | 生成器 `VERSIONS` 列表完整 |
| 2 | 每个位点在所有版本**双态唯一命中** | 原始态 1/1、已补丁态 1/1 |
| 3 | 每个位点**期望字节精确匹配** | 全部版本逐字节一致 |
| 4 | 模糊匹配结果**经精确锚点复核** | 数据段位点尤其必查 |
| 5 | **capstone 语义对照**通过 | 与基线版本指令序列一致 |
| 6 | 端到端差异字节**白名单内** | 仅位点 ∪ 校验和 ∪ 签名目录 |
| 7 | 既有版本产物哈希**零变化** | 逐字节比对 |
| 8 | 负向用例**拒绝且零写入** | 截断 / 未知版本 / 空文件 / 非 PE |

---

## 6. 一句话结论

> **汉明距离只能告诉你「哪里像」，不能告诉你「哪里对」。**
> 跨版本定位必须「模糊候选 → 精确字节 → 反汇编语义」三重确认，
> 并对既有版本产物做零回归断言。

---

## MCP 工具映射

| 需求 | 工具 |
|---|---|
| PE 结构 / 节区解析 | `triage_pe` |
| 函数级反汇编对照 | `ghidra_headless_analyze` · `ghidra_summary_functions` |
| 特征码唯一性扫描 | 自建脚本（numpy 滑窗）或 `triage_pe` 的 pattern 扫描 |
| 位点语义比对 | capstone（`05_verify_disasm.py`） |
| 端到端验证 | `06_e2e_validate.py` |
