import { useState } from "react";
import { X, Check, Key, Sliders, ShieldCheck, AlertCircle, Loader2, Globe } from "lucide-react";
import { llmService } from "../../services";
import { useI18n } from "../../core";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function SettingsModal({ isOpen, onClose, onSaved }: SettingsModalProps) {
  const { t, locale, setLocale } = useI18n();
  const [apiKey, setApiKey] = useState(llmService.getApiKey());
  const [model, setModel] = useState(llmService.getModel());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; latencyMs?: number; error?: string } | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    llmService.setApiKey(apiKey);
    llmService.setModel(model);
    const res = await llmService.checkHealth();
    setTesting(false);
    setTestResult(res);
  };

  const handleSave = () => {
    llmService.setApiKey(apiKey);
    llmService.setModel(model);
    onSaved?.();
    onClose();
  };

  const modelOptions = [
    { id: "qwen3.8-flash", name: "qwen3.8-flash" },
    { id: "qwen3.8-27b", name: "qwen3.8-27b" },
    { id: "qwen3.8-max", name: "qwen3.8-max" },
    { id: "deepseek-v4-flash-0731", name: "deepseek-v4-flash-0731" },
    { id: "glm-5.3-flash", name: "glm-5.3-flash" },
    { id: "mimo-v2.6-flash", name: "mimo-v2.6-flash" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#121215] border border-zinc-800 rounded-2xl shadow-2xl p-5 flex flex-col gap-4 select-none font-sans text-zinc-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold tracking-wide">{t.settings.title}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3.5 text-xs">
          {/* Language Switcher */}
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 font-mono text-[11px] flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-zinc-500" />
              <span>{t.settings.language}</span>
            </span>
            <div className="flex items-center p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setLocale("zh")}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  locale === "zh" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => setLocale("en")}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  locale === "en" ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-zinc-400">{t.settings.model}</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono text-xs focus:outline-none focus:border-zinc-700"
            >
              {modelOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div className="space-y-1">
            <label className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
              <Key className="w-3 h-3 text-zinc-500" />
              <span>{t.settings.apiKey}</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk_..."
              className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 font-mono text-xs focus:outline-none focus:border-zinc-700"
            />
          </div>

          {/* Test Status Banner */}
          {testResult && (
            <div
              className={`p-2 rounded-lg border text-xs font-mono flex items-center gap-2 ${
                testResult.ok
                  ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-400"
                  : "bg-rose-950/40 border-rose-800/60 text-rose-400"
              }`}
            >
              {testResult.ok ? (
                <>
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>
                    {t.settings.connected} ({testResult.latencyMs}ms)
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span className="truncate">{testResult.error || t.settings.disconnected}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-300 transition cursor-pointer disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            <span>{testing ? t.common.testing : t.settings.test}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-mono text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-medium transition cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t.common.save}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
