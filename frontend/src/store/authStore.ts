import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  user: any | null;
  setToken: (token: string) => void;
  setUser: (user: any) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: localStorage.getItem("token"),
      user: null,
      setToken: (token) => {
        localStorage.setItem("token", token);
        set({ token });
      },
      setUser: (user) => {
        set({ user });
      },
      logout: () => {
        localStorage.removeItem("token");
        set({ token: null, user: null });
      },
    }),
    {
      name: "auth-storage", // unique name for localStorage key
      partialize: (state) => ({ user: state.user }), // only persist user
    }
  )
);
