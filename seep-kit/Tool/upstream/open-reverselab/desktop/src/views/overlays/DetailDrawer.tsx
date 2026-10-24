import { X, Clock } from "lucide-react";
import { GraphStep } from "../../core";

interface DetailDrawerProps {
  step: GraphStep | null;
  onClose: () => void;
}

export function DetailDrawer({ step, onClose }: DetailDrawerProps) {
  if (!step) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-[#121215]/95 border-l border-zinc-800 backdrop-blur-xl shadow-2xl z-40 flex flex-col p-5 animate-in slide-in-from-right duration-200">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300">
            {step.agentId}
          </span>
          <span className="text-[11px] font-mono text-zinc-500">#{step.id}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="my-4">
        <h3 className="text-sm font-medium text-zinc-100 mb-1">{step.title}</h3>
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
          <span className="uppercase text-zinc-400 font-semibold">{step.status}</span>
          <span className="text-zinc-600">·</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(step.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">
            Details
          </div>
          <div className="text-xs text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap">
            {step.detail}
          </div>
        </div>

        {step.kbRef && (
          <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">
              Knowledge Base
            </div>
            <div className="text-xs text-zinc-400 font-mono break-all">
              {step.kbRef}
            </div>
          </div>
        )}

        {step.evidence && (
          <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-1.5">
              Evidence
            </div>
            <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-900/80 p-2.5 rounded border border-zinc-800/80 overflow-x-auto">
              {JSON.stringify(step.evidence, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
