
import AgentStream from "./AgentStream";
import ReportBanner from "./ReportBanner";

interface AgentStreamState {
  status: "idle" | "thinking" | "done" | "waiting";
  thinking: string;
  text: string;
}

interface MeetingCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  report?: any;
  streams?: Record<string, AgentStreamState>;
  isProcessing?: boolean;
  template: string;
  decisionTitle?: string;
  rolesInfo?: any[];
}

export default function MeetingCanvas({
  isOpen,
  onClose,
  report,
  streams,
  isProcessing,
  template,
  decisionTitle = "Board Meeting",
  rolesInfo,
}: MeetingCanvasProps) {
  
  if (!isOpen) return null;

  const roles = rolesInfo?.filter((r: any) => r.key !== "Moderator") || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Canvas Panel */}
      <div className="relative w-full md:w-[600px] lg:w-[800px] h-full bg-slate-50 dark:bg-[#06080f] shadow-2xl flex flex-col animate-slide-left border-l border-slate-200 dark:border-white/10">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-white/50 dark:bg-white/5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white shadow-md ring-1 ring-slate-900/5 flex items-center justify-center p-1.5">
              <img src="/boardroom-ai.svg" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Board Meeting</h2>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest">{template.replace("_BOARD", "")} Context</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors rounded-lg hover:bg-slate-200 dark:hover:bg-white/10"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          
          {/* Report Banner */}
          {report && (
            <div className="mb-8 animate-slide-down relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-[24px] blur-md opacity-20 dark:opacity-30 group-hover:opacity-40 transition-opacity duration-500"></div>
              <div className="relative bg-slate-50 dark:bg-[#06080f] rounded-2xl">
              <ReportBanner
                decision={report.final_decision as any}
                confidence={report.confidence_score}
                decisionTitle={report.decision_title || decisionTitle}
                templateName={report.template || template}
              />

              <div className="mt-6 glass-elevated rounded-2xl p-4 sm:p-6">
                <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-600 uppercase tracking-widest mb-4">Board Consensus</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed border-l-2 border-blue-500/30 pl-4 whitespace-pre-wrap">
                  {report.debate_summary}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                <div className="glass-elevated rounded-2xl p-4 sm:p-5">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-600 uppercase tracking-widest mb-4">Key Risks</h3>
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-400">
                    {report.key_risks?.map((risk: string, i: number) => <li key={i}>• {risk}</li>)}
                  </ul>
                </div>
                <div className="glass-elevated rounded-2xl p-4 sm:p-5">
                  <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-600 uppercase tracking-widest mb-4">Recommended Actions</h3>
                  <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-400">
                    {report.recommended_actions?.map((act: string, i: number) => <li key={i}>• {act}</li>)}
                  </ul>
                </div>
              </div>
              </div>
            </div>
          )}

          {/* Loading state before report finishes */}
          {!report && isProcessing && (!streams || Object.keys(streams).length === 0) && (
            <div className="flex items-center justify-center gap-3 text-slate-500 dark:text-slate-400 text-sm mt-10">
              <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center animate-pulse">
                🏛️
              </div>
              Calling the board to order...
            </div>
          )}

          {/* Agent Streams */}
          {streams && Object.keys(streams).length > 0 && (
            <div className="pb-20">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-600 uppercase tracking-widest mb-4 border-b border-slate-200 dark:border-white/5 pb-2">Live Board Deliberation</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {roles.map((role: any) => {
                const stream = streams[role.key];
                if (!stream || stream.status === "idle") return null;
                return (
                  <AgentStream
                    key={role.key}
                    role={role}
                    thinking={stream.thinking}
                    text={stream.text}
                    status={stream.status}
                    voteData={report?.board_votes?.[role.key]}
                  />
                );
              })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
