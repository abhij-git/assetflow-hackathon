"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotMsg, setForgotMsg] = useState("");

  useEffect(() => {
    // If token exists, redirect to dashboard
    if (localStorage.getItem("token")) {
      router.push("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.auth.login({ email, password });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMsg("");
    if (!forgotEmail) {
      setError("Please enter your email");
      return;
    }
    // Simulate forgot password token dispatch
    setForgotMsg(`A password reset link has been sent to ${forgotEmail} (Mocked).`);
    setForgotEmail("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#090d16] relative overflow-hidden">
      {/* Decorative Gradients */}
      <div className="absolute w-96 h-96 -top-40 -left-40 bg-indigo-500/10 rounded-full blur-3xl"></div>
      <div className="absolute w-96 h-96 -bottom-40 -right-40 bg-emerald-500/10 rounded-full blur-3xl"></div>

      <div className="w-full max-w-md glass p-8 rounded-2xl shadow-2xl relative z-10">
        {/* Brand Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 items-center justify-center text-indigo-400 text-3xl font-black mb-3">
            AF
          </div>
          <h2 className="text-3xl font-extrabold text-white">Asset<span className="text-indigo-400">Flow</span></h2>
          <p className="text-gray-400 mt-2 text-sm">Enterprise Asset & Resource Management</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        {!showForgot ? (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Password</label>
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-all"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <div className="pt-6 mt-6">
              <div className="relative flex py-4 items-center">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink mx-4 text-xs font-bold text-gray-500 uppercase tracking-wider">New here?</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              <div className="border border-white/10 bg-[#161c2c]/40 rounded-xl p-4 text-xs text-gray-300 text-center space-y-1 mb-4 leading-normal">
                <p className="font-semibold">Sign up creates an employee account</p>
                <p className="text-gray-400">admin roles assigned later</p>
              </div>

              <Link 
                href="/signup" 
                className="block w-full border border-white/10 hover:bg-white/5 text-white text-center font-bold py-3 rounded-xl active:scale-[0.98] transition-all"
              >
                Create Account
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-5">
            <h3 className="text-xl font-bold text-white mb-2">Reset Password</h3>
            <p className="text-gray-400 text-xs leading-relaxed mb-4">
              Enter your corporate email address. If an account is found, we will dispatch a password recovery token link.
            </p>

            {forgotMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-3 rounded-lg text-sm mb-6">
                {forgotMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Corporate Email</label>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setShowForgot(false);
                  setForgotMsg("");
                }}
                className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-3 rounded-xl transition-all"
              >
                Back to Login
              </button>
              <button
                type="submit"
                className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
              >
                Send Link
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
