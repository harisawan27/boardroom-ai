import { useState, useRef, useEffect } from "react";
import { streamChat, type RoleInfo } from "../api/client";
import AgentStream from "../components/AgentStream";
import ReportBanner from "../components/ReportBanner";
import AuthModal from "../components/AuthModal";
import Sidebar from "../components/Sidebar";
import { useAuthStore } from "../store/authStore";
import { TEMPLATES, type MeetingReport } from "../types/meeting";

interface AgentStreamData {
  text: string;
  thinking: string;
  status: "idle" | "thinking" | "done";
}

interface Message {
  id: string;
  role: "user" | "board";
  text?: string;
  template?: string;
  rolesInfo?: RoleInfo[];
  streams?: Record<string, AgentStreamData>;
  report?: MeetingReport | null;
  error?: string;
}

export default function Dashboard() {
  const token = useAuthStore((state) => state.token);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("STARTUP_BOARD");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeMeetingId, setActiveMeetingId] = useState<string | undefined>();
  const endOfChatRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle meeting selection from Sidebar
  const handleSelectMeeting = (meeting: any | null) => {
    if (!meeting) {
      // New meeting
      setActiveMeetingId(undefined);
      setMessages([]);
      setInput("");
      setIsProcessing(false);
      return;
    }

    // Load past meeting
    setActiveMeetingId(meeting.id);
    setSelectedTemplate(meeting.template);
    
    const userMsg: Message = { id: meeting.id + "_u", role: "user", text: meeting.prompt };
    const boardMsg: Message = {
      id: meeting.id + "_b",
      role: "board",
      template: meeting.template,
      rolesInfo: [], // Optional: We could reconstruct roles or just show the report
      streams: {},
      report: meeting.report_data,
    };
    
    setMessages([userMsg, boardMsg]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    setActiveMeetingId(undefined); // Reset active meeting ID since it's new
    const userMsg: Message = { id: Date.now().toString(), role: "user", text: input.trim() };
    const boardMsgId = (Date.now() + 1).toString();
    const boardMsg: Message = {
      id: boardMsgId,
      role: "board",
      template: selectedTemplate,
      rolesInfo: [],
      streams: {},
      report: null,
    };

    setMessages([userMsg, boardMsg]); // Clear past messages and start new
    setInput("");
    setIsProcessing(true);

    await streamChat(
      selectedTemplate,
      userMsg.text!,
      // onRoles
      (roles) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === boardMsgId) {
              const initialStreams: Record<string, AgentStreamData> = {};
              roles.forEach(r => {
                if (r.key !== "Moderator") {
                  initialStreams[r.key] = { text: "", thinking: "", status: "idle" };
                }
              });
              return { ...m, rolesInfo: roles, streams: initialStreams };
            }
            return m;
          })
        );
      },
      // onThinking
      (agent, text) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === boardMsgId && m.streams?.[agent]) {
              const currentThinking = m.streams[agent].thinking;
              return {
                ...m,
                streams: {
                  ...m.streams,
                  [agent]: { ...m.streams[agent], thinking: currentThinking + text, status: "thinking" },
                },
              };
            }
            return m;
          })
        );
      },
      // onChunk
      (agent, text) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === boardMsgId && m.streams?.[agent]) {
              const currentText = m.streams[agent].text;
              return {
                ...m,
                streams: {
                  ...m.streams,
                  [agent]: { ...m.streams[agent], text: currentText + text, status: "thinking" },
                },
              };
            }
            return m;
          })
        );
      },
      // onReport
      (reportData) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id === boardMsgId) {
              const updatedStreams = { ...(m.streams || {}) };
              for (const a in updatedStreams) {
                updatedStreams[a].status = "done";
              }
              return { ...m, streams: updatedStreams, report: reportData };
            }
            return m;
          })
        );
      },
      // onError
      (err) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === boardMsgId ? { ...m, error: err } : m))
        );
      },
      // onComplete
      () => {
        setIsProcessing(false);
      }
    );
  };

  // Require Login
  if (!token) {
    return <AuthModal />;
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-[#06080f]">
      {/* Global Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-[radial-gradient(ellipse,rgba(99,102,241,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 dot-pattern opacity-30" />
      </div>

      {/* Sidebar */}
      <Sidebar onSelectMeeting={handleSelectMeeting} selectedMeetingId={activeMeetingId} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10 h-screen">
        {/* Navbar */}
        <nav className="p-4 border-b border-white/5 flex items-center justify-end glass">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 uppercase tracking-widest hidden sm:inline-block">Board Context</span>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              disabled={!!activeMeetingId || isProcessing}
              className="text-xs bg-slate-900 border-slate-800 rounded-lg py-1.5 focus:ring-0 focus:border-indigo-500 max-w-[150px] disabled:opacity-50"
            >
              {Object.keys(TEMPLATES).map((key) => (
                <option key={key} value={key}>
                  {TEMPLATES[key as keyof typeof TEMPLATES].name}
                </option>
              ))}
            </select>
          </div>
        </nav>

        {/* Chat Feed */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar relative">
          <div className="max-w-4xl mx-auto space-y-8 pb-32">
            
            {messages.length === 0 && (
              <div className="text-center mt-20 animate-fade-in">
                <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 items-center justify-center text-3xl mb-6 shadow-xl shadow-indigo-500/10">
                  🏛️
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Welcome to the Boardroom</h2>
                <p className="text-slate-400 mb-8 max-w-md mx-auto">
                  Describe your decision, problem, or plan. The executive board will analyze it from 6 different perspectives and vote.
                </p>
                
                <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                  {["Should we raise a Series A now?", "Fire underperforming contractor?", "Pivot target audience to Enterprise?"].map((q, i) => (
                    <button 
                      key={i} 
                      onClick={() => setInput(q)}
                      className="px-4 py-2 rounded-full border border-white/10 text-xs text-slate-400 hover:text-white hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all"
                    >
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up`}>
                
                {/* User Message */}
                {msg.role === "user" && (
                  <div className="max-w-[85%] sm:max-w-[70%]">
                    <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-lg text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  </div>
                )}

                {/* Board Message */}
                {msg.role === "board" && (
                  <div className="w-full max-w-4xl">
                    {/* Agent Streams */}
                    {msg.streams && Object.entries(msg.streams).length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                        {Object.entries(msg.streams).map(([agentKey, stream]) => {
                          const roleInfo = msg.rolesInfo?.find(r => r.key === agentKey);
                          if (!roleInfo) return null;
                          return (
                            <AgentStream 
                              key={agentKey} 
                              role={roleInfo}
                              text={stream.text} 
                              thinking={stream.thinking}
                              status={stream.status} 
                            />
                          );
                        })}
                      </div>
                    )}

                    {/* Error State */}
                    {msg.error && (
                      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
                        ⚠️ {msg.error}
                      </div>
                    )}

                    {/* Final Report */}
                    {msg.report && (
                      <div className="animate-scale-in">
                        <ReportBanner
                          decision={msg.report.final_decision}
                          confidence={msg.report.confidence_score}
                          decisionTitle={msg.report.decision_title}
                          templateName={TEMPLATES[msg.template as keyof typeof TEMPLATES]?.name || msg.template || "Board Report"}
                        />

                        {/* If viewing history without rolesInfo streams, we mock VoteCards using standard board structure, or omit them.
                            For simplicity, we'll just display the report data. */}
                        <div className="mt-6 glass-elevated rounded-2xl p-6">
                          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-4">Board Consensus</h3>
                          <p className="text-sm text-slate-300 leading-relaxed border-l-2 border-indigo-500/30 pl-4">
                            {msg.report.debate_summary}
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                          <div className="glass-elevated rounded-2xl p-5">
                            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-4">Key Risks</h3>
                            <ul className="space-y-2 text-sm text-slate-400">
                              {msg.report.key_risks?.map((risk: string, i: number) => <li key={i}>• {risk}</li>)}
                            </ul>
                          </div>
                          <div className="glass-elevated rounded-2xl p-5">
                            <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-4">Recommended Actions</h3>
                            <ul className="space-y-2 text-sm text-slate-400">
                              {msg.report.recommended_actions?.map((act: string, i: number) => <li key={i}>• {act}</li>)}
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Loading indicator */}
                    {isProcessing && (!msg.streams || Object.keys(msg.streams).length === 0) && (
                      <div className="flex items-center gap-3 text-slate-400 text-sm">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center animate-pulse">
                          🏛️
                        </div>
                        Calling the board to order...
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={endOfChatRef} />
          </div>
        </main>

        {/* Input Area (disabled if viewing past meeting) */}
        {!activeMeetingId && (
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-[#06080f] via-[#06080f]/90 to-transparent z-20">
            <div className="max-w-3xl mx-auto relative">
              <form onSubmit={handleSubmit} className="relative flex items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  placeholder="Ask the board..."
                  className="w-full bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-2xl py-4 pl-5 pr-14 text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent resize-none max-h-48 custom-scrollbar"
                  rows={Math.min(input.split("\n").length, 5) || 1}
                  style={{ minHeight: '56px' }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isProcessing}
                  className="absolute right-2 bottom-2 w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isProcessing ? (
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 translate-x-[1px] translate-y-[-1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </form>
              <div className="text-center mt-3">
                <span className="text-[10px] text-slate-600 font-medium">Shift + Enter for new line • Powered by Google Gemma & Gemini</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
