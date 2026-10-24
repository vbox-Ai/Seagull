import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import { GraphStep } from "../../../core";

export interface HarnessNodeData extends Record<string, unknown> {
  step: GraphStep;
  isSelected?: boolean;
  onSelect?: (step: GraphStep) => void;
}

export const HarnessNode = memo(({ data }: { data: HarnessNodeData }) => {
  const { step, isSelected, onSelect } = data;

  const getStatusIndicator = () => {
    switch (step.status) {
      case "running":
        return <Loader2 className="w-3 h-3 text-zinc-300 animate-spin" />;
      case "done":
        return <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>;
      case "failed":
        return <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>;
      default:
        return <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>;
    }
  };

  const getBorder = () => {
    if (isSelected) return "border-zinc-300 shadow-lg ring-1 ring-zinc-400";
    if (step.status === "running") return "border-zinc-500";
    return "border-zinc-800/80 hover:border-zinc-700";
  };

  return (
    <div
      onClick={() => onSelect?.(step)}
      className={`relative w-64 rounded-xl bg-[#121215] border p-3 cursor-pointer transition-all duration-150 ${getBorder()}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-zinc-700 !border !border-zinc-900"
      />

      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-zinc-900">
        <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
          {step.agentId}
        </span>
        <div className="flex items-center gap-1.5">
          {getStatusIndicator()}
          <span className="text-[10px] font-mono uppercase text-zinc-500">
            {step.status}
          </span>
        </div>
      </div>

      <div className="text-xs font-medium text-zinc-100 mb-1 leading-snug line-clamp-1">
        {step.title}
      </div>

      <div className="text-[11px] text-zinc-400 font-mono line-clamp-2 leading-relaxed">
        {step.detail}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 !bg-zinc-600 !border !border-zinc-900"
      />
    </div>
  );
});

HarnessNode.displayName = "HarnessNode";
