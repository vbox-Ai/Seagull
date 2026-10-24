# Reverse Task Report

## Current Stage

- stage: `Observe`
- status: `<active|blocked|partial|pass>`

## Goal

- `<本任务要解决什么>`

## Confirmed

- `<已确认的目标请求 / 关键脚本 / 触发动作>`

## Unconfirmed

- `<仍未确认的函数、输入边界、环境缺口>`

## Target Request

- method: `<GET|POST>`
- url: `<https://target.example/api>`
- request shape: `<query/body/header 概要>`

## Target Context

- page: `<https://target.example/page>`
- trigger action: `<点击 / 输入 / 导航 / 页面初始化>`
- initiator hint: `<script / function / requestId>`

## Runtime Evidence Summary

- `<目前已拿到哪些 hook / 中间值 / 对象字段证据>`

## Local Rebuild Status

- entry: `env/entry.js`
- env patch: `env/env.js`
- polyfills: `env/polyfills.js`
- capture: `env/capture.json`
- current result: `<未开始|报错|可运行|已通过一次>`

## First Divergence

- `<当前 first divergence；若还没有则写 N/A>`

## Browser Alignment

- sample source: `<browser request|hook output|fixture|N/A>`
- aligned fields: `<最终参数 / 关键中间值 / 固定输出 / N/A>`
- status: `<unknown|partial|pass>`
- notes: `<哪里一致，哪里还不一致>`

## Acceptance

- local rebuild: `<unknown|partial|pass>`
- server acceptance: `<unknown|partial|pass>`
- browser alignment: `<unknown|partial|pass>`

## Next Step

- `<下一步只写一个最小动作>`

## Recommended Minimal Filled Example

以下示例只演示“第一次接手任务时，如何把报告写到可续做”，不是站点真值：

```md
# Reverse Task Report

## Current Stage

- stage: `Observe`
- status: `active`

## Goal

- 确认目标请求、触发动作和候选脚本，为后续最小侵入采样做准备

## Confirmed

- 目标页面会在用户点击提交后发起一个候选请求
- 已定位到该请求的 initiator，确认由某个业务 bundle 触发
- 已知道页面上的最小触发动作

## Unconfirmed

- 具体签名函数名仍未确认
- 请求里哪些字段属于算法输入仍未确认
- 当前还没有 runtime hook 样本

## Target Request

- method: `POST`
- url: `https://target.example/api`
- request shape: `body 含时间戳、nonce、sign 等字段`

## Target Context

- page: `https://target.example/page`
- trigger action: `点击提交按钮`
- initiator hint: `bundle.js + request initiator stack`

## Runtime Evidence Summary

- 暂无 hook 样本
- 已确认下一步应优先对 fetch / xhr 或候选函数做最小采样

## Local Rebuild Status

- entry: `env/entry.js`
- env patch: `env/env.js`
- polyfills: `env/polyfills.js`
- capture: `env/capture.json`
- current result: `未开始`

## First Divergence

- `N/A`

## Browser Alignment

- sample source: `N/A`
- aligned fields: `N/A`
- status: `unknown`
- notes: `当前还没有浏览器真值样本，下一步先补最小 hook 或请求样本`

## Acceptance

- local rebuild: `unknown`
- server acceptance: `unknown`
- browser alignment: `unknown`

## Next Step

- 对目标请求链路做第一轮最小 hook，并把结果写入 `runtime-evidence.jsonl`
```
