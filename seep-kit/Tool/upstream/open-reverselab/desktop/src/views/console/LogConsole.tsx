import { useState, useMemo, useRef, useEffect } from "react";
import { LogEntry, LogLevel } from "../../core";
import { Search, Trash2, Copy, Check, ChevronDown, ChevronRight, Terminal, ArrowDown } from "lucide-react";

interface LogConsoleProps {
  logs: LogEntry[];
  onClear: () => void;
}

export function LogConsole({ logs, onClear }: LogConsoleProps) {
  const [filterLevel, setFilterLevel] = useState<"all" | LogLevel>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterLevel !== "all" && log.level !== filterLevel) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const msgMatch = log.message.toLowerCase().includes(q);
        const agentMatch = log.agentId.toLowerCase().includes(q);
        const cmdMatch = log.command?.toLowerCase().includes(q);
        return msgMatch || agentMatch || cmdMatch;
      }
      return true;
    });
  }, [logs, filterLevel, searchQuery]);

  useEffect(() => {
    if (autoScroll) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, autoScroll]);

  const handleCopyAll = () => {
    const text = filteredLogs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] [${l.agentId}] ${l.message}${
            l.command ? `\nCommand: ${l.command}` : ""
          }${l.payload ? `\nPayload: ${JSON.stringify(l.payload, null, 2)}` : ""}`
      )
      .join("\n\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case "tool":
        return <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300">TOOL</span>;
      case "evidence":
        return <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-900/60">EVID</span>;
      case "error":
        return <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-900/60">ERR</span>;
      case "warn":
        return <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-900/60">WARN</span>;
      default:
        return <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-500">INFO</span>;
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#09090b] text-zinc-200 select-none overflow-hidden font-mono text-xs">
      <div className="h-10 px-4 border-b border-zinc-900 bg-[#0d0d10] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1">
          {(["all", "tool", "evidence", "error", "info"] as const).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-2 py-0.5 rounded text-[11px] font-mono uppercase transition cursor-pointer ${
                filterLevel === lvl
                  ? "bg-zinc-800 text-zinc-100 font-semibold"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="flex-1 max-w-xs relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-8 pr-2 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            title="Auto-scroll toggle"
            className={`p-1 rounded text-xs transition cursor-pointer ${
              autoScroll ? "text-zinc-200 bg-zinc-800" : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopyAll}
            title="Copy logs"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClear}
            title="Clear logs"
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-rose-400 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
            <Terminal className="w-6 h-6 text-zinc-700" />
            <span className="text-[11px]">No log entries matching filter</span>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const hasExtra = Boolean(log.command || log.payload);
            const isExpanded = expandedIds.has(log.id);

            return (
              <div
                key={log.id}
                className="group p-1.5 rounded-lg hover:bg-zinc-900/60 border border-transparent hover:border-zinc-800/60 transition"
              >
                <div className="flex items-start gap-2.5 leading-snug">
                  {hasExtra ? (
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="mt-0.5 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                  ) : (
                    <span className="w-3" />
                  )}

                  <span className="text-zinc-600 shrink-0 text-[11px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>

                  <div className="shrink-0">{getLevelBadge(log.level)}</div>

                  <span className="text-zinc-400 shrink-0 text-[11px]">
                    [{log.agentId}]
                  </span>

                  <div className="flex-1 text-zinc-300 break-words text-[11px]">
                    {log.message}
                    {log.durationMs !== undefined && (
                      <span className="ml-2 text-zinc-500 text-[10px]">
                        ({log.durationMs}ms)
                      </span>
                    )}
                  </div>
                </div>

                {isExpanded && hasExtra && (
                  <div className="mt-2 ml-7 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-2 text-[11px]">
                    {log.command && (
                      <div>
                        <div className="text-[10px] uppercase text-zinc-500 mb-0.5">CLI Command</div>
                        <div className="text-zinc-200 bg-zinc-900 p-1.5 rounded text-xs select-text">
                          {log.command}
                        </div>
                      </div>
                    )}
                    {log.payload && (
                      <div>
                        <div className="text-[10px] uppercase text-zinc-500 mb-0.5">Structured Data</div>
                        <pre className="text-zinc-300 bg-zinc-900 p-2 rounded overflow-x-auto text-[10px] select-text">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
