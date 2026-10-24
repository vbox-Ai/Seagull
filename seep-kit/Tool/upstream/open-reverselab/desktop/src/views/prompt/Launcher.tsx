import React, { useState } from "react";
import { ArrowUpRight, RotateCcw } from "lucide-react";

interface LauncherProps {
  isRunning: boolean;
  onLaunch: (target: string, wish: string) => void;
  onReset: () => void;
  activeCount: number;
}

export function Launcher({ isRunning, onLaunch, onReset, activeCount }: LauncherProps) {
  const [target, setTarget] = useState("samples/challenge_auth.exe");
  const [wish, setWish] = useState("脱壳并还原校验算法，生成解密脚本");
  const [isDragOver, setIsDragOver] = useState(false);

  const presets = [
    {
      title: "PE 样本分析",
      target: "samples/challenge_auth.exe",
      wish: "脱壳并还原校验算法，生成解密脚本",
    },
    {
      title: "CTF 靶场探测",
      target: "http://target.ctf.local:8080",
      wish: "自动探测并提取 Flag",
    },
    {
      title: "APK Native 逆向",
      target: "samples/mobile_banking.apk",
      wish: "定位 JNI 校验函数并提取密钥",
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!target.trim() || !wish.trim() || isRunning) return;
    onLaunch(target.trim(), wish.trim());
  };

  if (isRunning || activeCount > 0) {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-2xl z-30 transition-all duration-300">
        <div className="flex items-center justify-between gap-4 py-2.5 px-4 rounded-xl bg-zinc-900/90 border border-zinc-800/80 backdrop-blur-xl shadow-xl">
          <div className="min-w-0 flex items-center gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
            <div className="text-xs font-mono text-zinc-300 truncate">
              <span>{target}</span>
              <span className="mx-2 text-zinc-600">/</span>
              <span className="text-zinc-400">{wish}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <span className="text-[11px] font-mono text-zinc-400 tracking-wider">
                RUNNING · {activeCount}
              </span>
            ) : (
              <button
                onClick={onReset}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-30 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#121215] border border-zinc-800 shadow-2xl p-5 transition-all">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files?.[0]) {
                setTarget(e.dataTransfer.files[0].name);
              }
            }}
            className={`rounded-xl border px-3.5 py-2.5 transition-all ${
              isDragOver
                ? "border-zinc-400 bg-zinc-800/30"
                : "border-zinc-800/80 bg-zinc-950/40 hover:border-zinc-700"
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
              Target
            </div>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Path or URL"
              className="w-full bg-transparent text-sm text-zinc-100 font-mono placeholder-zinc-600 focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3.5 py-2.5 hover:border-zinc-700 transition">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
              Goal
            </div>
            <input
              type="text"
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              placeholder="Analysis objective"
              className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {presets.map((p, idx) => (
                <button
                  type="button"
                  key={idx}
                  onClick={() => {
                    setTarget(p.target);
                    setWish(p.wish);
                  }}
                  className="px-2 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800/60 text-[11px] text-zinc-400 hover:text-zinc-200 font-mono transition whitespace-nowrap cursor-pointer"
                >
                  {p.title}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={!target.trim() || !wish.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs shadow-sm transition disabled:opacity-40 cursor-pointer shrink-0"
            >
              <span>Run</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
