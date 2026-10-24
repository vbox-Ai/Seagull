import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Terminal, ArrowUp, Square, Paperclip, UploadCloud } from "lucide-react";
import { HarnessMode, useI18n } from "../../core";
import { logger } from "../../services";

interface PromptConsoleProps {
  isRunning: boolean;
  onExecute: (target: string, prompt: string, mode: HarnessMode) => void;
  onStop?: () => void;
  defaultTarget?: string;
}

export function PromptConsole({
  isRunning,
  onExecute,
  onStop,
  defaultTarget = "samples/challenge_auth.exe",
}: PromptConsoleProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<HarnessMode>("wish");
  const [target, setTarget] = useState(defaultTarget);
  const [prompt, setPrompt] = useState("");
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultTarget) setTarget(defaultTarget);
  }, [defaultTarget]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isRunning) return;
    onExecute(target.trim(), prompt.trim(), mode);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      // Magic byte detection
      const uint8 = new Uint8Array(buffer.slice(0, 4));
      let fileType = "Unknown Binary";
      if (uint8[0] === 0x4d && uint8[1] === 0x5a) {
        fileType = "PE";
      } else if (uint8[0] === 0x50 && uint8[1] === 0x4b) {
        fileType = "APK/ZIP";
      } else if (uint8[0] === 0x7f && uint8[1] === 0x45 && uint8[2] === 0x4c && uint8[3] === 0x46) {
        fileType = "ELF";
      }

      setTarget(file.name);
      logger.info(
        "triage",
        `Sample: ${file.name} (${(file.size / 1024).toFixed(1)} KB) · ${fileType}`,
        { sha256, sizeBytes: file.size, fileType }
      );
    } catch (err: any) {
      logger.error("triage", `Read error: ${err.message}`);
    }
  };

  const quickChips = [
    { label: t.prompt.chipUpx, prompt: "Unpack and recover verification algorithm with python script" },
    { label: t.prompt.chipAntiDebug, prompt: "Bypass IsDebuggerPresent anti-debug branch and dump payload" },
    { label: t.prompt.chipNative, prompt: "Locate libsecurity.so exported symbols and recover encryption key" },
    { label: t.prompt.chipJwt, prompt: "Audit JWT auth token vulnerabilities and generate exploit" },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto p-4 z-20">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChosen}
        className="hidden"
      />

      <div className="rounded-2xl bg-[#121215]/95 border border-zinc-800 shadow-2xl backdrop-blur-xl p-3 flex flex-col gap-2.5 transition-all">
        {/* Top Control Bar: Mode Capsule + Target Pill */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-950/80 border border-zinc-900">
            <button
              type="button"
              onClick={() => setMode("wish")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition cursor-pointer ${
                mode === "wish"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Sparkles className="w-3 h-3 text-zinc-300" />
              <span>{t.prompt.wish}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("interactive")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-mono transition cursor-pointer ${
                mode === "interactive"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Terminal className="w-3 h-3 text-zinc-300" />
              <span>{t.prompt.interactive}</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {isEditingTarget ? (
              <input
                type="text"
                autoFocus
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                onBlur={() => setIsEditingTarget(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditingTarget(false)}
                className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-xs font-mono text-zinc-200 focus:outline-none"
              />
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsEditingTarget(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/80 text-[11px] font-mono text-zinc-300 transition cursor-pointer"
                >
                  <Paperclip className="w-3 h-3 text-zinc-500" />
                  <span className="text-zinc-500">{t.common.target}:</span>
                  <span className="truncate max-w-[200px]">{target}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Big Input Area */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === "wish" ? t.prompt.wishPlaceholder : t.prompt.interactivePlaceholder
            }
            className="w-full bg-transparent px-2 py-1 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none resize-none font-sans leading-relaxed"
          />
        </div>

        {/* Bottom Bar: Quick Chips + Run/Stop Action */}
        <div className="flex items-center justify-between gap-3 pt-1 border-t border-zinc-900/60">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {quickChips.map((chip, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => setPrompt(chip.prompt)}
                className="px-2 py-0.5 rounded bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800/60 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition whitespace-nowrap cursor-pointer"
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono text-zinc-600 hidden sm:inline">
              Ctrl + Enter
            </span>
            {isRunning ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800/60 text-rose-200 text-xs font-mono transition cursor-pointer"
              >
                <Square className="w-3 h-3 fill-rose-200" />
                <span>{t.common.stop}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium transition disabled:opacity-30 cursor-pointer"
              >
                <span>{t.common.run}</span>
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
