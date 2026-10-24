"use strict";
const { contextBridge, ipcRenderer } = require("electron");

// 渲染进程唯一的对外通道；不开 nodeIntegration。
contextBridge.exposeInMainWorld("hs", {
  state: () => ipcRenderer.invoke("tool:state"),
  memory: () => ipcRenderer.invoke("tool:memory"),
  // 功能1：一键注入状态总览
  overview: () => ipcRenderer.invoke("tool:overview"),
  // 功能2：注入任务历史
  history: () => ipcRenderer.invoke("tool:history"),
  // 功能3：提示词管理
  promptsList: () => ipcRenderer.invoke("tool:prompts:list"),
  promptsImport: (sourcePath) => ipcRenderer.invoke("tool:prompts:import", sourcePath),
  promptsDelete: (name) => ipcRenderer.invoke("tool:prompts:delete", name),
  promptsSelect: (name) => ipcRenderer.invoke("tool:prompts:select", name),
  // 功能5：依赖检测/修复
  depsCheck: () => ipcRenderer.invoke("tool:deps:check"),
  depsFix: () => ipcRenderer.invoke("tool:deps:fix"),
  // 功能4：引擎管理（双引擎）
  enginesState: () => ipcRenderer.invoke("tool:engines:state"),
  reaInstall: () => ipcRenderer.invoke("tool:rea:install"),
  reaUninstall: () => ipcRenderer.invoke("tool:rea:uninstall"),
  // 功能7：故障诊断报告
  diagnose: () => ipcRenderer.invoke("tool:diagnose"),
  // 功能6：远程配置热更新
  remoteFetch: (url) => ipcRenderer.invoke("tool:remote:fetch", url),
  install: (targetId) => ipcRenderer.invoke("tool:install", targetId),
  uninstall: (targetId) => ipcRenderer.invoke("tool:uninstall", targetId),
  // 装回原始记忆：还原安装前的记忆档案，保留技能库（仅 WorkBuddy）
  restoreMemory: (targetId) => ipcRenderer.invoke("tool:restoreMemory", targetId),
  restartCodex: () => ipcRenderer.invoke("tool:restartCodex"),
  // 随包分发的 Seep 逆向工作台
  seepState: () => ipcRenderer.invoke("seep:state"),
  seepInstall: () => ipcRenderer.invoke("seep:install"),
  seepUninstall: () => ipcRenderer.invoke("seep:uninstall"),
  seepVerify: () => ipcRenderer.invoke("seep:verify"),
  listSkills: () => ipcRenderer.invoke("tool:skills:list"),
  skillLayers: () => ipcRenderer.invoke("tool:skills:layers"),
  saveSkills: (disabled) => ipcRenderer.invoke("tool:skills:save", disabled),
  openQQ: (url) => ipcRenderer.invoke("tool:openQQ", url),
  quit: () => ipcRenderer.invoke("tool:quit"),
  win: (action) => ipcRenderer.invoke("tool:win", action),

  onLog: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on("tool:log", h);
    return () => ipcRenderer.removeListener("tool:log", h);
  },
  onStatus: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on("tool:status", h);
    return () => ipcRenderer.removeListener("tool:status", h);
  },
  onNotify: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on("tool:notify", h);
    return () => ipcRenderer.removeListener("tool:notify", h);
  },
  onReaProgress: (cb) => {
    const h = (_e, payload) => cb(payload);
    ipcRenderer.on("tool:rea:progress", h);
    return () => ipcRenderer.removeListener("tool:rea:progress", h);
  },
});
