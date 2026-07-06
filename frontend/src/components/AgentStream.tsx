/**
 * AgentStream — Displays a single agent's live streaming output
 * with a collapsible thinking dropdown and analysis content.
 */

import { useEffect, useRef, useState } from "react";
import type { RoleInfo } from "../api/client";

interface AgentStreamProps {
  role: RoleInfo;
  thinking: string;
  text: string;
  status: "idle" | "thinking" | "done";
}

export default function AgentStream({ role, thinking, text, status }: AgentStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);

  // Auto-scroll when new text arrives
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, thinking, isExpanded]);

  // Auto-open thinking while agent is still thinking
  useEffect(() => {
    if (status === "thinking" && thinking && !text) {
      setIsThinkingOpen(true);
    }
    if (text) {
      setIsThinkingOpen(false);
    }
  }, [status, thinking, text]);

  if (status === "idle") return null;

  return (
    <div className="glass-elevated rounded-xl border border-slate-200 dark:border-white/5 animate-slide-up mb-4 overflow-hidden">
      {/* Header (Click to toggle) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-md bg-gradient-to-br ${role.color} flex items-center justify-center text-sm`}>
            {role.icon}
          </div>
          <div className="text-left">
            <span className="text-sm font-semibold text-slate-900 dark:text-white block">{role.key}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-500">{role.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {status === "thinking" ? (
            <span className="flex items-center gap-2 text-xs text-blue-400">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Thinking...
            </span>
          ) : (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Complete
            </span>
          )}

          <svg
            className={`w-4 h-4 text-slate-500 dark:text-slate-500 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Content */}
      <div
        className={`transition-all duration-300 ease-in-out ${isExpanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="p-4 pt-0 border-t border-slate-200 dark:border-white/5">
          {/* Thinking Dropdown */}
          {thinking && (
            <div className="mt-3 mb-2">
              <button
                onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                className="flex items-center gap-2 text-[11px] text-slate-500 hover:text-slate-400 transition-colors group"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${isThinkingOpen ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Thought process
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${isThinkingOpen ? "max-h-[200px] opacity-100 mt-2" : "max-h-0 opacity-0"}`}
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-500 italic whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-white/[0.02] rounded-lg p-3 max-h-[180px] overflow-y-auto custom-scrollbar border border-slate-200 dark:border-white/[0.03]">
                  {thinking}
                </div>
              </div>
            </div>
          )}

          {/* Main Analysis Text */}
          <div
            ref={scrollRef}
            className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed opacity-90 dark:opacity-80 max-h-[250px] overflow-y-auto custom-scrollbar mt-3 pr-2"
          >
            {text || (thinking ? "" : "Initializing analysis...")}
          </div>
        </div>
      </div>
    </div>
  );
}
