"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { api } from "@/lib/api";
import { 
  Bell, 
  Check, 
  Trash2, 
  Activity, 
  FileText, 
  AlertTriangle, 
  ShieldAlert, 
  History, 
  UserCheck, 
  RefreshCw 
} from "lucide-react";

export default function NotificationsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Tab Controls: "notifs" or "audit_logs" (Admin only)
  const [viewTab, setViewTab] = useState<"notifs" | "audit_logs">("notifs");
  
  // Notification Filter Tab: All / Alerts / Approvals / Bookings
  const [notifFilter, setNotifFilter] = useState<"All" | "Alerts" | "Approvals" | "Bookings">("All");

  // Data lists
  const [notifications, setNotifications] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const user = api.auth.getCurrentUser();
    setCurrentUser(user);

    loadNotificationsAndLogs();
  }, [router]);

  async function loadNotificationsAndLogs() {
    setLoading(true);
    setError("");
    try {
      const list = await api.notifications.list(false); // Fetch both read and unread
      setNotifications(list);

      const user = api.auth.getCurrentUser();
      if (user && user.role === "Admin") {
        const logs = await api.notifications.listLogs();
        setActivityLogs(logs);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch notification feed.");
    } finally {
      setLoading(false);
    }
  }

  const handleMarkRead = async (id: number) => {
    try {
      await api.notifications.markRead(id);
      setSuccess("Notification cleared.");
      await loadNotificationsAndLogs();
    } catch (err: any) {
      setError(err.message || "Failed to mark as read.");
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setSuccess("All notifications dismissed.");
      await loadNotificationsAndLogs();
    } catch (err: any) {
      setError(err.message || "Failed to clear notifications.");
    }
  };

  const getRelativeTime = (dtStr: string) => {
    const d = new Date(dtStr);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case "AssetAssigned": return <UserCheck className="text-emerald-400" size={16} />;
      case "OverdueReturnAlert": return <ShieldAlert className="text-red-400" size={16} />;
      case "MaintenanceUpdate": return <WrenchIcon className="text-rose-400" size={16} />;
      case "BookingConfirmed": return <CalendarCheckIcon className="text-blue-400" size={16} />;
      case "BookingReminder": return <CalendarCheckIcon className="text-indigo-400" size={16} />;
      case "TransferRequested": return <RefreshCw className="text-amber-400" size={16} />;
      default: return <Bell className="text-indigo-300" size={16} />;
    }
  };

  // Safe fallback wrapper for icons that might loop name
  const WrenchIcon = ({ className, size }: any) => <Activity className={className} size={size} />;
  const CalendarCheckIcon = ({ className, size }: any) => <History className={className} size={size} />;

  // Filter Notification List based on category:
  // Alerts: OverdueReturnAlert, AuditDiscrepancy
  // Approvals: TransferRequested, TransferApproved, TransferRejected, MaintenanceUpdate
  // Bookings: BookingConfirmed, BookingCancelled, BookingReminder
  const filteredNotifications = notifications.filter(notif => {
    if (notifFilter === "All") return true;
    if (notifFilter === "Alerts") {
      return ["OverdueReturnAlert", "AuditDiscrepancy", "AssetAssigned", "AssetReturned"].includes(notif.type);
    }
    if (notifFilter === "Approvals") {
      return ["TransferRequested", "TransferApproved", "TransferRejected", "MaintenanceUpdate"].includes(notif.type);
    }
    if (notifFilter === "Bookings") {
      return ["BookingConfirmed", "BookingCancelled", "BookingReminder"].includes(notif.type);
    }
    return true;
  });

  if (loading) {
    return (
      <Sidebar>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
          <div className="w-12 h-12 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
          <span className="text-gray-400 text-sm">Loading alerts and notification feeds...</span>
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
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Notification Center</h1>
            <p className="text-gray-400 text-sm mt-1">Review alerts, pending task reminders, and security audit trails</p>
          </div>
          {viewTab === "notifs" && notifications.some(n => !n.is_read) && (
            <button 
              onClick={handleMarkAllRead}
              className="flex items-center space-x-2 bg-[#0e1424] hover:bg-white/5 px-4 py-2 border border-white/10 rounded-xl text-sm font-bold text-white transition-all"
            >
              <Check size={16} />
              <span>Dismiss All Alerts</span>
            </button>
          )}
        </div>

        {/* View Toggle (Admin only) */}
        {currentUser?.role === "Admin" && (
          <div className="flex space-x-2 bg-[#0e1424] p-1.5 rounded-xl border border-white/5 w-fit">
            <button 
              onClick={() => setViewTab("notifs")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${viewTab === "notifs" ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/20" : "text-gray-400 hover:text-white"}`}
            >
              <Bell size={16} />
              <span>My Notifications</span>
            </button>
            <button 
              onClick={() => setViewTab("audit_logs")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${viewTab === "audit_logs" ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/20" : "text-gray-400 hover:text-white"}`}
            >
              <Activity size={16} />
              <span>Immutable Trace Log</span>
            </button>
          </div>
        )}

        {/* Alert Notifications */}
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
        {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm">{success}</div>}

        {/* --- NOTIFICATIONS TAB VIEW --- */}
        {viewTab === "notifs" && (
          <div className="space-y-6">
            
            {/* Filter buttons */}
            <div className="flex flex-wrap gap-2">
              {["All", "Alerts", "Approvals", "Bookings"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setNotifFilter(filter as any)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${notifFilter === filter ? "bg-indigo-600/30 text-white border-indigo-500" : "bg-white/5 border-white/5 text-gray-400 hover:text-white"}`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="glass p-6 rounded-2xl space-y-4">
              {filteredNotifications.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm">
                  No notifications found for category "{notifFilter}".
                </div>
              ) : (
                <div className="divide-y divide-white/5 space-y-4">
                  {filteredNotifications.map((notif) => (
                    <div 
                      key={notif.id} 
                      className={`flex items-start justify-between pt-4 first:pt-0 ${notif.is_read ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="p-2 bg-white/5 rounded-lg border border-white/5 mt-0.5">
                          {getNotifIcon(notif.type)}
                        </div>
                        <div>
                          <p className="text-sm text-gray-200 font-medium">
                            {notif.message}
                          </p>
                          <p className="text-[10px] text-gray-500 mt-1">
                            {getRelativeTime(notif.created_at)}
                          </p>
                        </div>
                      </div>

                      {!notif.is_read && (
                        <button
                          onClick={() => handleMarkRead(notif.id)}
                          title="Mark as Read"
                          className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-emerald-400 transition-all ml-4 shrink-0"
                        >
                          <Check size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* --- IMMUTABLE TRACE LOGS VIEW (ADMIN ONLY) --- */}
        {viewTab === "audit_logs" && currentUser?.role === "Admin" && (
          <div className="glass p-6 rounded-2xl space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-4">
              <Activity size={18} className="text-indigo-400" />
              <span>Trace Audit Trail</span>
            </h3>

            <div className="space-y-4">
              {activityLogs.length === 0 ? (
                <p className="text-center py-10 text-gray-500 text-sm">No activity logs recorded.</p>
              ) : (
                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  {activityLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className="p-4 bg-white/5 border border-white/5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-indigo-900/30 text-indigo-300 rounded-lg flex items-center justify-center font-bold text-sm shrink-0">
                          {log.actor_user_name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs text-gray-300">
                            <span className="font-bold text-white">{log.actor_user_name}</span>{" "}
                            triggered <span className="font-mono text-indigo-400 font-semibold bg-indigo-900/30 px-1 py-0.5 rounded text-[10px] uppercase border border-indigo-500/10">{log.action}</span> on {log.entity_type} #{log.entity_id}
                          </p>
                          {Object.keys(log.details).length > 0 && (
                            <p className="text-[10px] text-gray-500 font-mono mt-1">
                              Payload: {JSON.stringify(log.details)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-[10px] text-gray-600 shrink-0 md:text-right">
                        <span>🕒 {new Date(log.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </Sidebar>
  );
}
