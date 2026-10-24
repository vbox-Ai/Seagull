import { X, Check } from "lucide-react";

interface ToolMonitorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ToolMonitorDrawer({ isOpen, onClose }: ToolMonitorDrawerProps) {
  if (!isOpen) return null;

  const mcpServers = [
    { name: "pe-reverse", status: "ready", tools: 32, label: "Windows PE" },
    { name: "apk-reverse", status: "ready", tools: 28, label: "Android APK" },
    { name: "ctf-website", status: "ready", tools: 34, label: "Web CTF" },
    { name: "general", status: "ready", tools: 15, label: "Crypto / Firmware" },
  ];

  const hostBinaries = [
    { name: "Ghidra Headless", path: "tools/ghidra/support/analyzeHeadless.bat" },
    { name: "Frida CLI / Server", path: "frida (16.2.1)" },
    { name: "x64dbg", path: "tools/x64dbg/x64dbg.exe" },
    { name: "Python 3", path: "A:\\DevEnv\\SDKs\\Miniconda\\python.exe" },
    { name: "DiE", path: "tools/die/diec.exe" },
  ];

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-[#121215]/95 border-l border-zinc-800 backdrop-blur-xl shadow-2xl z-40 flex flex-col p-5 animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-300">
          Environment & Tools
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pt-4 pr-1">
        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
            MCP Servers (109 tools)
          </div>
          <div className="space-y-1.5">
            {mcpServers.map((s, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs text-zinc-200">{s.label}</div>
                  <div className="text-[10px] font-mono text-zinc-500">{s.tools} tools</div>
                </div>
                <Check className="w-3.5 h-3.5 text-zinc-400" />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
            Host Toolchain
          </div>
          <div className="space-y-1.5">
            {hostBinaries.map((b, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <div className="text-xs text-zinc-200">{b.name}</div>
                  <div className="text-[10px] font-mono text-zinc-500 truncate">{b.path}</div>
                </div>
                <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
