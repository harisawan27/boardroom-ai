import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, updateProfile } from "../api/client";
import { useAuthStore } from "../store/authStore";

export default function Settings() {
  const navigate = useNavigate();
  const { token, user, setUser } = useAuthStore();
  
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    company: "",
    industry: "",
    bio: ""
  });

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }
    
    // Load existing profile
    const loadProfile = async () => {
      try {
        const data = await getMe();
        setUser(data);
        if (data.profile_data) {
          setFormData({
            name: data.profile_data.name || "",
            role: data.profile_data.role || "",
            company: data.profile_data.company || "",
            industry: data.profile_data.industry || "",
            bio: data.profile_data.bio || ""
          });
        }
      } catch (err) {
        console.error("Failed to load profile", err);
      }
    };
    
    loadProfile();
  }, [token, navigate, setUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const response = await updateProfile(formData);
      setUser({ ...user, profile_data: response.profile_data });
      setSuccessMsg("Profile updated successfully! Your board is now personalized.");
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Failed to update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative bg-[#06080f] text-white">
      {/* Global Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-[radial-gradient(ellipse,rgba(99,102,241,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 dot-pattern opacity-30" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto p-6 sm:p-10 pt-20">
        
        <button 
          onClick={() => navigate("/")}
          className="mb-8 flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </button>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Profile & Settings</h1>
          <p className="text-slate-400">
            Customize your profile so the executive board can tailor their advice specifically to your industry, role, and company goals.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {successMsg && (
            <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm animate-fade-in">
              {successMsg}
            </div>
          )}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
              {errorMsg}
            </div>
          )}

          <div className="glass-elevated rounded-2xl p-6 sm:p-8 space-y-6">
            <h2 className="text-lg font-semibold border-b border-white/5 pb-4 mb-6">Personal Details</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all"
                  placeholder="e.g. Elon Musk"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Your Role</label>
                <input
                  type="text"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all"
                  placeholder="e.g. CEO, Founder"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Company Name</label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all"
                  placeholder="e.g. SpaceX"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Industry</label>
                <input
                  type="text"
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all"
                  placeholder="e.g. Aerospace, SaaS"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Company Goals / Bio</label>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                rows={4}
                className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all resize-none"
                placeholder="What is your company trying to achieve? (e.g. We are building reusable rockets to make life multi-planetary)"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 px-8 rounded-xl shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[150px]"
            >
              {loading ? (
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                "Save Profile"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
