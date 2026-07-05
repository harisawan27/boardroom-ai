import { useEffect, useState } from "react";
import { fetchMeetings } from "../api/client";
import { useAuthStore } from "../store/authStore";

interface MeetingInfo {
  id: string;
  template: string;
  prompt: string;
  report_data: any;
  created_at: string;
}

interface SidebarProps {
  onSelectMeeting: (meeting: MeetingInfo | null) => void;
  selectedMeetingId?: string;
}

export default function Sidebar({ onSelectMeeting, selectedMeetingId }: SidebarProps) {
  const [meetings, setMeetings] = useState<MeetingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const logout = useAuthStore((state) => state.logout);

  const loadMeetings = async () => {
    try {
      const data = await fetchMeetings();
      setMeetings(data);
    } catch (err) {
      console.error("Failed to fetch meetings", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, []);

  return (
    <div className="w-64 h-screen border-r border-white/5 bg-[#06080f]/90 backdrop-blur-xl flex flex-col flex-shrink-0 z-20">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
            B
          </div>
          <span className="text-sm font-semibold text-white tracking-tight">
            Boardroom<span className="gradient-text"> AI</span>
          </span>
        </div>
      </div>

      {/* New Meeting Button */}
      <div className="p-4">
        <button
          onClick={() => onSelectMeeting(null)}
          className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium py-2.5 rounded-xl transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Meeting
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        <div className="px-3 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-widest">
          History
        </div>
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="w-5 h-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
          </div>
        ) : meetings.length === 0 ? (
          <div className="text-center p-4 text-xs text-slate-500">
            No past meetings found.
          </div>
        ) : (
          <div className="space-y-1">
            {meetings.map((m) => (
              <button
                key={m.id}
                onClick={() => onSelectMeeting(m)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-3 ${
                  selectedMeetingId === m.id
                    ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                    : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"
                }`}
              >
                <div className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center flex-shrink-0 text-xs">
                  🏛️
                </div>
                <div className="truncate flex-1">
                  <div className="truncate font-medium">{m.prompt}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {new Date(m.created_at).toLocaleDateString()} • {m.template.replace("_BOARD", "")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer / User Area */}
      <div className="p-4 border-t border-white/5 space-y-2">
        <div className="px-3 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Account
        </div>
        
        <button
          onClick={() => window.location.href = "/settings"}
          className="w-full flex items-center gap-3 text-sm text-slate-300 hover:text-white transition-colors py-2 px-3 rounded-xl hover:bg-white/5"
        >
          <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
            {useAuthStore.getState().user?.profile_data?.name?.charAt(0) || "U"}
          </div>
          <div className="truncate text-left flex-1">
            <div className="truncate font-medium">{useAuthStore.getState().user?.profile_data?.name || "Profile Settings"}</div>
          </div>
        </button>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 text-sm text-slate-400 hover:text-red-400 transition-colors py-2 px-3 rounded-xl hover:bg-red-500/10 mt-2"
        >
          <svg className="w-5 h-5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  );
}
