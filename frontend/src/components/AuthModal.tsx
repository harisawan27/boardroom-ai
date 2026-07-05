import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { login, register } from "../api/client";

export default function AuthModal() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((state) => state.setToken);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      let token;
      if (isLogin) {
        token = await login(email, password);
      } else {
        token = await register(email, password);
      }
      setToken(token);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Background with blur */}
      <div className="absolute inset-0 bg-[#06080f]/80 backdrop-blur-md"></div>
      
      {/* Auth Card */}
      <div className="relative glass-elevated rounded-3xl w-full max-w-md p-8 shadow-2xl animate-scale-in">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 items-center justify-center text-white font-bold text-2xl mb-4 shadow-lg shadow-indigo-500/20">
            B
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Welcome to Boardroom<span className="gradient-text"> AI</span>
          </h2>
          <p className="text-sm text-slate-400">
            {isLogin ? "Sign in to access your executive board." : "Create an account to build your board."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all"
              placeholder="ceo@startup.com"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center h-[52px]"
          >
            {loading ? (
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              isLogin ? "Sign In" : "Create Account"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
