"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { api } from "@/lib/api";
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from "recharts";
import { 
  BarChart3, 
  Download, 
  RefreshCw, 
  Cpu, 
  AlertOctagon, 
  CalendarClock,
  AlertTriangle 
} from "lucide-react";

export default function ReportsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Data lists for reports
  const [utilization, setUtilization] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState<any[]>([]);
  const [mostUsed, setMostUsed] = useState<any[]>([]);
  const [idleAssets, setIdleAssets] = useState<any[]>([]);
  const [retirement, setRetirement] = useState<any[]>([]);
  const [heatmap, setHeatmap] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const user = api.auth.getCurrentUser();
    setCurrentUser(user);

    if (user && user.role !== "Admin" && user.role !== "AssetManager") {
      router.push("/dashboard");
      return;
    }

    loadReportData();
  }, [router]);

  async function loadReportData() {
    setLoading(true);
    setError("");
    try {
      const [util, maint, used, idle, ret, heat] = await Promise.all([
        api.reports.getUtilizationByDept(),
        api.reports.getMaintenanceFrequency(),
        api.reports.getMostUsedAssets(),
        api.reports.getIdleAssets(),
        api.reports.getNearingRetirement(),
        api.reports.getBookingHeatmap()
      ]);
      setUtilization(util);
      setMaintenance(maint);
      setMostUsed(used);
      setIdleAssets(idle);
      setRetirement(ret);
      setHeatmap(heat);
    } catch (err: any) {
      setError(err.message || "Failed to compile analytical reports.");
    } finally {
      setLoading(false);
    }
  }

  const handleExportSummary = () => {
    const url = api.reports.exportSummaryUrl();
    window.open(url, "_blank");
  };

  // Render heat grid cells
  const getHeatmapColor = (count: number) => {
    if (count === 0) return "bg-white/5 text-gray-600";
    if (count < 3) return "bg-indigo-900/40 text-indigo-300 border border-indigo-500/25";
    if (count < 6) return "bg-indigo-600/40 text-indigo-200 border border-indigo-500/50";
    return "bg-indigo-500/80 text-white font-bold";
  };

  const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hoursOfDay = [9, 10, 11, 12, 13, 14, 15, 16, 17]; // Core business hours for heatmap display

  if (loading) {
    return (
      <Sidebar>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
          <div className="w-12 h-12 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
          <span className="text-gray-400 text-sm">Compiling department utilization metrics...</span>
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Reports & Analytics</h1>
            <p className="text-gray-400 text-sm mt-1">Review organizational asset statistics, maintenance trends, and resource booking heatmaps</p>
          </div>
          <button 
            onClick={handleExportSummary}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-all"
          >
            <Download size={16} />
            <span>Export report</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* First Row: Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Dept Utilization Chart */}
          <div className="glass p-6 rounded-2xl space-y-4">
            <h3 className="text-md font-bold text-white flex items-center space-x-2">
              <Cpu size={16} className="text-indigo-400" />
              <span>Asset Allocation by Department</span>
            </h3>
            <div className="w-full h-80 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={utilization}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="department" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                  <Legend />
                  <Bar dataKey="allocated_assets" name="Allocated Assets" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Maintenance frequency line chart */}
          <div className="glass p-6 rounded-2xl space-y-4">
            <h3 className="text-md font-bold text-white flex items-center space-x-2">
              <BarChart3 size={16} className="text-indigo-400" />
              <span>Maintenance Requests Over Time</span>
            </h3>
            <div className="w-full h-80 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={maintenance}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="period" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "rgba(255,255,255,0.1)", borderRadius: "8px" }} />
                  <Legend />
                  <Line type="monotone" dataKey="requests_count" name="Maintenance Count" stroke="#ec4899" strokeWidth={2} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Second Row: Heatmap & Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Peak Booking Heatmap - 2 cols */}
          <div className="lg:col-span-2 glass p-6 rounded-2xl space-y-6">
            <h3 className="text-md font-bold text-white flex items-center space-x-2">
              <CalendarClock size={16} className="text-indigo-400" />
              <span>Resource Booking Heatmap (Peak hours)</span>
            </h3>
            
            <div className="overflow-x-auto">
              <div className="min-w-[500px] grid grid-cols-10 gap-2 text-center text-xs">
                {/* Headers */}
                <div className="font-bold text-gray-500 py-1">Day</div>
                {hoursOfDay.map(hour => (
                  <div key={hour} className="font-bold text-gray-500 py-1">{hour}:00</div>
                ))}

                {/* Grid Rows */}
                {daysOfWeek.map(day => (
                  <React.Fragment key={day}>
                    <div className="font-semibold text-gray-300 py-2 self-center">{day}</div>
                    {hoursOfDay.map(hour => {
                      const match = heatmap.find(h => h.day === day && h.hour === hour);
                      const val = match ? match.bookings_count : 0;
                      return (
                        <div 
                          key={hour}
                          title={`${val} bookings at ${hour}:00 on ${day}`}
                          className={`py-2 rounded-lg text-xs font-semibold ${getHeatmapColor(val)}`}
                        >
                          {val}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-4 text-[10px] text-gray-500 pt-2 border-t border-white/5">
              <span>Color indicators:</span>
              <span className="flex items-center space-x-1"><span className="w-3.5 h-3.5 rounded bg-white/5 border border-white/5 inline-block"></span> <span>Idle</span></span>
              <span className="flex items-center space-x-1"><span className="w-3.5 h-3.5 rounded bg-indigo-900/40 border border-indigo-500/20 inline-block"></span> <span>Low</span></span>
              <span className="flex items-center space-x-1"><span className="w-3.5 h-3.5 rounded bg-indigo-600/40 border border-indigo-500/40 inline-block"></span> <span>Medium</span></span>
              <span className="flex items-center space-x-1"><span className="w-3.5 h-3.5 rounded bg-indigo-500/80 inline-block"></span> <span>Peak</span></span>
            </div>
          </div>

          {/* Idle Assets & Retirement Lists - 1 col */}
          <div className="space-y-6">
            
            {/* Nearing Retirement */}
            <div className="glass p-5 rounded-2xl space-y-4">
              <h3 className="text-xs uppercase tracking-wider text-rose-400 font-bold flex items-center space-x-2">
                <AlertTriangle size={14} />
                <span>Nearing Retirement (Age &gt; 5y)</span>
              </h3>
              {retirement.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No assets require aging retirement reviews.</p>
              ) : (
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {retirement.map(a => (
                    <div key={a.id} className="flex justify-between items-center text-xs p-2 bg-white/5 rounded-lg border border-white/5">
                      <div>
                        <span className="font-mono text-rose-400 font-bold block">{a.tag}</span>
                        <span className="text-white font-medium">{a.name}</span>
                      </div>
                      <span className="text-[10px] text-gray-500">Cost: ${a.cost.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Idle Assets */}
            <div className="glass p-5 rounded-2xl space-y-4">
              <h3 className="text-xs uppercase tracking-wider text-indigo-400 font-bold flex items-center space-x-2">
                <RefreshCw size={14} />
                <span>Idle Assets (&gt; 30 days unused)</span>
              </h3>
              {idleAssets.length === 0 ? (
                <p className="text-xs text-gray-500 italic">All available assets have active booking histories.</p>
              ) : (
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {idleAssets.map(a => (
                    <div key={a.id} className="flex justify-between items-center text-xs p-2 bg-white/5 rounded-lg border border-white/5">
                      <div>
                        <span className="font-mono text-indigo-400 font-bold block">{a.tag}</span>
                        <span className="text-white font-medium">{a.name}</span>
                      </div>
                      <span className="text-[10px] text-gray-500 truncate max-w-[80px]">📍 {a.location}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
    </Sidebar>
  );
}
