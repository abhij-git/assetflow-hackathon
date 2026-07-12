"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { api } from "@/lib/api";
import { 
  PackageCheck, 
  Layers, 
  AlertTriangle, 
  CalendarClock, 
  Shuffle, 
  History, 
  PlusCircle, 
  BookMarked,
  Activity,
  ArrowRight,
  ShieldAlert
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    // Auth Check
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    
    const user = api.auth.getCurrentUser();
    setCurrentUser(user);

    async function loadStats() {
      try {
        const data = await api.reports.getDashboardStats();
        setStats(data);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
          <span className="text-gray-400 text-sm">Loading workspace dashboard...</span>
        </div>
      </div>
    );
  }

  const handleQuickAction = (route: string) => {
    router.push(route);
  };

  const getLogIcon = (action: string) => {
    switch (action) {
      case "ALLOCATE": return <PackageCheck className="text-emerald-400" size={16} />;
      case "RETURN": return <History className="text-indigo-400" size={16} />;
      case "TRANSFER_REQUEST": return <Shuffle className="text-amber-400" size={16} />;
      case "BOOKING_CREATE": return <CalendarClock className="text-blue-400" size={16} />;
      default: return <Activity className="text-slate-400" size={16} />;
    }
  };

  return (
    <Sidebar>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Today's Overview</h1>
            <p className="text-gray-400 text-sm mt-1">Operational snapshot for {currentUser?.name} ({currentUser?.role})</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {/* Quick Actions */}
            {(currentUser?.role === "Admin" || currentUser?.role === "AssetManager") && (
              <button 
                onClick={() => handleQuickAction("/assets?action=register")}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-all"
              >
                <PlusCircle size={16} />
                <span>+ register asset</span>
              </button>
            )}
            <button 
              onClick={() => handleQuickAction("/booking")}
              className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 px-4 py-2 border border-white/10 rounded-xl text-sm font-bold text-white transition-all"
            >
              <BookMarked size={16} />
              <span>Book resource</span>
            </button>
            <button 
              onClick={() => handleQuickAction("/maintenance?action=raise")}
              className="flex items-center space-x-2 bg-white/5 hover:bg-white/10 px-4 py-2 border border-white/10 rounded-xl text-sm font-bold text-white transition-all"
            >
              <AlertTriangle size={16} />
              <span>Raise requests</span>
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Overdue Returns Banner */}
        {stats?.overdue_returns > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center justify-between shadow-xl">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30">
                <ShieldAlert size={20} className="animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-red-200">
                  {stats.overdue_returns} assets overdue for return - flagged for follow-up
                </h4>
              </div>
            </div>
            <button 
              onClick={() => handleQuickAction("/allocation?tab=overdue")}
              className="flex items-center space-x-1 text-xs font-bold text-red-400 hover:text-red-300 transition-all"
            >
              <span>Follow up</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="glass p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-500 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Available</span>
              <Layers size={18} className="text-indigo-400" />
            </div>
            <h3 className="text-2xl font-bold text-white">{stats?.assets_available}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Ready for allocation</p>
          </div>

          <div className="glass p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-500 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Allocated</span>
              <PackageCheck size={18} className="text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold text-white">{stats?.assets_allocated}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Currently in use</p>
          </div>

          <div className="glass p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-500 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Available</span>
              <AlertTriangle size={18} className="text-rose-400" />
            </div>
            <h3 className="text-2xl font-bold text-rose-300">{stats?.maintenance_active}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Active tickets today</p>
          </div>

          <div className="glass p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-500 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Bookings</span>
              <CalendarClock size={18} className="text-blue-400" />
            </div>
            <h3 className="text-2xl font-bold text-white">{stats?.active_bookings}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Shared room/vehicle</p>
          </div>

          <div className="glass p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-500 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Transfers</span>
              <Shuffle size={18} className="text-amber-400" />
            </div>
            <h3 className="text-2xl font-bold text-white">{stats?.pending_transfers}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Awaiting approval</p>
          </div>

          <div className="glass p-5 rounded-2xl">
            <div className="flex justify-between items-center text-gray-500 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Upcoming returns</span>
              <History size={18} className="text-indigo-400" />
            </div>
            <h3 className="text-2xl font-bold text-white">{stats?.upcoming_returns}</h3>
            <p className="text-[10px] text-gray-500 mt-1">Due within 7 days</p>
          </div>
        </div>

        {/* Recent Activity Section */}
        <div className="glass p-6 rounded-2xl">
          <div className="flex items-center space-x-2 mb-6">
            <Activity className="text-indigo-400" size={18} />
            <h3 className="text-lg font-bold text-white">Recent Activity</h3>
          </div>

          {stats?.recent_activity.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No recent activity logs available.
            </div>
          ) : (
            <div className="divide-y divide-white/5 space-y-4">
              {stats?.recent_activity.map((log: any) => (
                <div key={log.id} className="flex items-start justify-between pt-4 first:pt-0">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-white/5 rounded-lg border border-white/5 mt-0.5">
                      {getLogIcon(log.action)}
                    </div>
                    <div>
                      <p className="text-sm text-gray-200">
                        <strong className="text-white font-medium">{log.actor_user_name}</strong>{" "}
                        performed action <span className="text-indigo-300 font-mono text-xs uppercase bg-indigo-900/30 px-1.5 py-0.5 rounded border border-indigo-500/20">{log.action}</span> on{" "}
                        <span className="text-gray-300">{log.entity_type}</span>
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {new Date(log.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 hidden md:block">
                    Entity ID: {log.entity_id}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sidebar>
  );
}
