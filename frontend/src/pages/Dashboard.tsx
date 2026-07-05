import { useState, useRef, useEffect } from "react";
import { streamChat, getSession, createSession, sendStandardMessage, type RoleInfo } from "../api/client";
import MeetingCanvas from "../components/MeetingCanvas";
import AuthModal from "../components/AuthModal";
import Sidebar from "../components/Sidebar";
import { useAuthStore } from "../store/authStore";
import { TEMPLATES } from "../types/meeting";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  is_agentic?: boolean;
  meeting?: any;
}

interface ActiveMeetingData {
  id?: string;
  template: string;
  decisionTitle: string;
  report?: any;
  streams?: Record<string, { status: "idle" | "thinking" | "done"; thinking: string; text: string }>;
  rolesInfo?: RoleInfo[];
}

export default function Dashboard() {
  const token = useAuthStore((state) => state.token);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("STARTUP_BOARD");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Canvas State
  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [activeMeetingData, setActiveMeetingData] = useState<ActiveMeetingData | null>(null);

  const endOfChatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadSession = async (sessionId: string) => {
    try {
      const data = await getSession(sessionId);
      setMessages(data.messages || []);
      setActiveSessionId(sessionId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectSession = (session: any | null) => {
    if (!session) {
      setActiveSessionId(undefined);
      setMessages([]);
      setInput("");
      setIsProcessing(false);
      return;
    }
    loadSession(session.id);
  };

  const handleStandardChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userText = input.trim();
    setInput("");
    setIsProcessing(true);

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const newSession = await createSession();
        sessionId = newSession.id;
        setActiveSessionId(sessionId);
      }

      // Optimistic update
      const tempId = Date.now().toString();
      setMessages(prev => [...prev, { id: tempId, role: "user", content: userText }]);

      const responseMsg = await sendStandardMessage(sessionId as string, userText);
      setMessages(prev => [...prev, responseMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConveneBoard = async () => {
    if (!input.trim() || isProcessing) return;

    const userText = input.trim();
    setInput("");
    setIsProcessing(true);

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const newSession = await createSession();
        sessionId = newSession.id;
        setActiveSessionId(sessionId);
      }

      const tempUserId = Date.now().toString();
      setMessages(prev => [...prev, { id: tempUserId, role: "user", content: userText }]);

      const newMeetingData: ActiveMeetingData = {
        template: selectedTemplate,
        decisionTitle: "Live Board Meeting",
        streams: {},
      };
      
      setActiveMeetingData(newMeetingData);
      setIsCanvasOpen(true);

      await streamChat(
        sessionId as string,
        selectedTemplate,
        userText,
        // onRoles
        (roles) => {
          setActiveMeetingData(prev => {
            if (!prev) return prev;
            const initialStreams: any = {};
            roles.forEach(r => {
              if (r.key !== "Moderator") {
                initialStreams[r.key] = { text: "", thinking: "", status: "idle" };
              }
            });
            return { ...prev, rolesInfo: roles, streams: initialStreams };
          });
        },
        // onThinking
        (agent, text) => {
          setActiveMeetingData(prev => {
            if (!prev || !prev.streams?.[agent]) return prev;
            return {
              ...prev,
              streams: {
                ...prev.streams,
                [agent]: { ...prev.streams[agent], thinking: prev.streams[agent].thinking + text, status: "thinking" }
              }
            };
          });
        },
        // onChunk
        (agent, text) => {
          setActiveMeetingData(prev => {
            if (!prev || !prev.streams?.[agent]) return prev;
            return {
              ...prev,
              streams: {
                ...prev.streams,
                [agent]: { ...prev.streams[agent], text: prev.streams[agent].text + text, status: "thinking" }
              }
            };
          });
        },
        // onReport
        (reportData) => {
          setActiveMeetingData(prev => {
            if (!prev) return prev;
            const updatedStreams = { ...(prev.streams || {}) };
            for (const a in updatedStreams) {
              updatedStreams[a].status = "done";
            }
            return { ...prev, streams: updatedStreams, report: reportData };
          });
        },
        // onError
        (err) => {
          console.error("Board error:", err);
        },
        // onComplete
        () => {
          setIsProcessing(false);
          // Reload session to get the saved messages with the meeting attached
          loadSession(sessionId as string);
        }
      );

    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  };

  const openPastMeeting = (meeting: any) => {
    setActiveMeetingData({
      template: meeting.template,
      decisionTitle: meeting.prompt,
      report: meeting.report_data,
    });
    setIsCanvasOpen(true);
  };

  if (!token) return <AuthModal />;

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-slate-50 dark:bg-[#06080f] transition-colors">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-[radial-gradient(ellipse,rgba(99,102,241,0.08)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse,rgba(99,102,241,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 dot-pattern opacity-60 dark:opacity-30" />
      </div>

      <Sidebar 
        onSelectSession={handleSelectSession} 
        selectedSessionId={activeSessionId} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col relative z-10 h-screen w-full md:w-auto">
        <nav className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between glass">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
            <span className="font-bold text-slate-900 dark:text-white">Boardroom AI</span>
          </div>
        </nav>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar relative">
          <div className="max-w-3xl mx-auto space-y-6 pb-40">
            {messages.length === 0 && (
              <div className="text-center mt-20 animate-fade-in px-4">
                <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/30 items-center justify-center text-3xl mb-6 shadow-xl shadow-indigo-500/10">🏛️</div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Welcome to your Workspace</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto text-sm sm:text-base">
                  Brainstorm with your Chief of Staff, and when you're ready, convene the full executive board to analyze your decision.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                  {["Should we raise a Series A now?", "Fire underperforming contractor?", "Pivot target audience to Enterprise?"].map((q, i) => (
                    <button key={i} onClick={() => setInput(q)} className="px-4 py-2 rounded-full border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all shadow-sm dark:shadow-none bg-white dark:bg-transparent">
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up`}>
                {msg.role === "user" ? (
                  <div className="max-w-[85%]">
                    <div className="bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-4 sm:px-5 py-3 sm:py-3.5 shadow-lg text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[85%] flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center flex-shrink-0 text-xs shadow-sm">
                      {msg.is_agentic ? "🏛️" : "💼"}
                    </div>
                    <div>
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-sm px-4 sm:px-5 py-3 sm:py-3.5 shadow-sm text-sm leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                      {msg.is_agentic && msg.meeting && (
                        <button 
                          onClick={() => openPastMeeting(msg.meeting)}
                          className="mt-3 flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20 rounded-xl text-sm font-medium transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          Open Board Report
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={endOfChatRef} />
          </div>
        </main>

        {/* Input Command Center */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-slate-50 via-slate-50/90 dark:from-[#06080f] dark:via-[#06080f]/90 to-transparent z-20">
          <div className="max-w-3xl mx-auto relative">
            <div className="bg-white dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-2xl shadow-lg dark:shadow-none overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50 focus-within:border-transparent transition-all">
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleStandardChat(e);
                  }
                }}
                placeholder="Message Chief of Staff or convene the board..."
                className="w-full bg-transparent border-none py-3.5 sm:py-4 px-4 sm:px-5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-0 resize-none max-h-48 custom-scrollbar text-sm sm:text-base"
                rows={Math.min(input.split("\n").length, 5) || 1}
                style={{ minHeight: '56px' }}
              />

              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-white/5">
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  disabled={isProcessing}
                  className="text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-lg py-1.5 pl-2 pr-8 focus:ring-0 focus:border-indigo-500 max-w-[140px] sm:max-w-[200px] disabled:opacity-50 text-slate-700 dark:text-slate-300 shadow-sm dark:shadow-none appearance-none"
                  title={TEMPLATES[selectedTemplate as keyof typeof TEMPLATES]?.description}
                >
                  {Object.keys(TEMPLATES).map((key) => (
                    <option key={key} value={key}>
                      {TEMPLATES[key as keyof typeof TEMPLATES].name}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStandardChat}
                    disabled={!input.trim() || isProcessing}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Discuss
                  </button>
                  <button
                    onClick={handleConveneBoard}
                    disabled={!input.trim() || isProcessing}
                    className="px-4 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-md shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isProcessing && isCanvasOpen ? (
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      "🏛️ Convene Board"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Meeting Canvas Slide-over */}
        {activeMeetingData && (
          <MeetingCanvas
            isOpen={isCanvasOpen}
            onClose={() => setIsCanvasOpen(false)}
            report={activeMeetingData.report}
            streams={activeMeetingData.streams}
            isProcessing={isProcessing}
            template={activeMeetingData.template}
            decisionTitle={activeMeetingData.decisionTitle}
          />
        )}
      </div>
    </div>
  );
}
