"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { api } from "@/lib/api";
import { 
  ClipboardCheck, 
  Plus, 
  X, 
  Download, 
  Lock, 
  MapPin, 
  Briefcase, 
  Check, 
  FileWarning,
  AlertTriangle,
  History
} from "lucide-react";

export default function AuditPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Data lists
  const [cycles, setCycles] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [cycleDetail, setCycleDetail] = useState<any>(null);

  // Creation State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [scopeDept, setScopeDept] = useState("");
  const [scopeLoc, setScopeLoc] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedAuditorIds, setSelectedAuditorIds] = useState<number[]>([]);

  // Discrepancy flags
  const [discrepancyCount, setDiscrepancyCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
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

    loadInitialData();
  }, [router]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const user = api.auth.getCurrentUser();
      const canManage = user && (user.role === "Admin" || user.role === "AssetManager");
      
      let depts = [];
      let emps = [];
      if (canManage) {
        [depts, emps] = await Promise.all([
          api.org.listDepartments(),
          api.org.listEmployees()
        ]);
      } else {
        depts = await api.org.listDepartments();
      }
      
      setDepartments(depts);
      setEmployees(emps);
      await fetchCycles();
    } catch (err: any) {
      setError(err.message || "Failed to load audit settings.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchCycles() {
    try {
      const list = await api.audits.listCycles();
      setCycles(list);
      
      // Auto-select first cycle if none selected
      if (list.length > 0 && selectedCycleId === null) {
        handleCycleClick(list[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch audit cycles.");
    }
  }

  const handleCycleClick = async (id: number) => {
    setSelectedCycleId(id);
    setDetailLoading(true);
    setError("");
    try {
      const detail = await api.audits.getCycle(id);
      setCycleDetail(detail);

      // Count discrepancies
      const discs = detail.items.filter((it: any) => 
        it.verification_status === "Missing" || it.verification_status === "Damaged"
      );
      setDiscrepancyCount(discs.length);
    } catch (err: any) {
      setError(err.message || "Failed to load audit cycle checklist.");
    } finally {
      setDetailLoading(false);
    }
  };

  // --- CREATE CYCLE SUBMIT ---
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!startDate || !endDate || selectedAuditorIds.length === 0) {
      setError("Please specify dates and assign at least one auditor.");
      return;
    }

    try {
      const cycle = await api.audits.createCycle({
        scope_department_id: scopeDept ? parseInt(scopeDept) : null,
        scope_location: scopeLoc || null,
        date_range_start: startDate,
        date_range_end: endDate,
        auditor_ids: selectedAuditorIds
      });
      setSuccess(`Audit cycle #${cycle.id} launched successfully.`);
      setShowCreateModal(false);
      // Reset
      setScopeDept("");
      setScopeLoc("");
      setStartDate("");
      setEndDate("");
      setSelectedAuditorIds([]);
      
      await fetchCycles();
      await handleCycleClick(cycle.id);
    } catch (err: any) {
      setError(err.message || "Failed to start audit cycle.");
    }
  };

  const handleAuditorCheckbox = (id: number) => {
    if (selectedAuditorIds.includes(id)) {
      setSelectedAuditorIds(selectedAuditorIds.filter(x => x !== id));
    } else {
      setSelectedAuditorIds([...selectedAuditorIds, id]);
    }
  };

  // --- ITEM VERIFY SUBMIT ---
  const handleVerifyChange = async (itemId: number, newStatus: string, notesVal: string) => {
    setError("");
    setSuccess("");
    try {
      await api.audits.verifyItem(itemId, {
        verification_status: newStatus,
        notes: notesVal || null
      });
      
      // Reload cycle details
      if (selectedCycleId) {
        await handleCycleClick(selectedCycleId);
      }
    } catch (err: any) {
      setError(err.message || "Verification update failed.");
    }
  };

  // --- CLOSE CYCLE SUBMIT ---
  const handleCloseCycle = async () => {
    if (!selectedCycleId) return;
    setError("");
    setSuccess("");
    if (!confirm("Are you sure you want to close this audit cycle? This action locks all verifications and cascades Missing assets to Lost status.")) return;

    try {
      await api.audits.closeCycle(selectedCycleId);
      setSuccess("Audit cycle closed and locked. Asset directories updated.");
      await fetchCycles();
      await handleCycleClick(selectedCycleId);
    } catch (err: any) {
      setError(err.message || "Failed to close audit cycle.");
    }
  };

  const handleExportCSV = () => {
    if (!selectedCycleId) return;
    const url = api.audits.exportDiscrepanciesUrl(selectedCycleId);
    window.open(url, "_blank");
  };

  const getVerificationBadge = (status: string) => {
    switch (status) {
      case "Verified": return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/25";
      case "Missing": return "bg-red-500/20 text-red-400 border border-red-500/25";
      case "Damaged": return "bg-amber-500/20 text-amber-400 border border-amber-500/25";
      default: return "bg-gray-500/20 text-gray-400 border border-gray-500/25";
    }
  };

  if (loading) {
    return (
      <Sidebar>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
          <div className="w-12 h-12 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
          <span className="text-gray-400 text-sm">Loading audit checklists...</span>
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
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Physical Audits</h1>
            <p className="text-gray-400 text-sm mt-1">Run structured inventory cycles, dispatch auditors, and resolve discrepancies</p>
          </div>
          {(currentUser?.role === "Admin" || currentUser?.role === "AssetManager") && (
            <button 
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-all"
            >
              <Plus size={16} />
              <span>Create Audit Cycle</span>
            </button>
          )}
        </div>

        {/* Alert Notifications */}
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
        {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm">{success}</div>}

        {/* Layout split: Left (Cycle List) vs Right (Checklist detail) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* Cycle Selection Sidebar Panel - 1 col */}
          <div className="space-y-4">
            <div className="glass p-5 rounded-2xl space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <History size={16} className="text-indigo-400" />
                <span>Audit Cycles</span>
              </h3>
              
              {cycles.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No audit cycles started.</p>
              ) : (
                <div className="space-y-2">
                  {cycles.map((cyc) => {
                    const isSelected = cyc.id === selectedCycleId;
                    return (
                      <button
                        key={cyc.id}
                        onClick={() => handleCycleClick(cyc.id)}
                        className={`w-full text-left p-3 rounded-xl transition-all border ${isSelected ? "bg-indigo-600/30 text-white border-indigo-500" : "bg-white/5 border-white/5 hover:bg-white/10 text-gray-400 hover:text-white"}`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-xs">Cycle #{cyc.id}</span>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded uppercase ${cyc.status === "Open" ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"}`}>
                            {cyc.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {cyc.scope_department_name ? `🏢 ${cyc.scope_department_name}` : ""} {cyc.scope_location ? `📍 ${cyc.scope_location}` : ""}
                        </div>
                        <div className="text-[9px] text-gray-600 mt-2">
                          Ends: {new Date(cyc.date_range_end).toLocaleDateString()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Checklist Details - 3 cols */}
          <div className="lg:col-span-3 space-y-6">
            {detailLoading ? (
              <div className="glass p-12 rounded-2xl flex flex-col items-center justify-center space-y-3">
                <div className="w-10 h-10 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
                <span className="text-xs text-gray-500">Loading cycle checklist details...</span>
              </div>
            ) : cycleDetail ? (
              <div className="space-y-6">
                
                {/* 1. Cycle info box at the top */}
                <div className="bg-[#1b1515] border border-[#2d2222] p-5 rounded-2xl space-y-1">
                  <h3 className="text-sm font-bold text-white">
                    Cycle #{cycleDetail.id} audit: {cycleDetail.scope_department_name ? `${cycleDetail.scope_department_name} dept` : "All depts"} - {new Date(cycleDetail.date_range_start).toLocaleDateString("en-US", {day: "numeric", month: "short"})} to {new Date(cycleDetail.date_range_end).toLocaleDateString("en-US", {day: "numeric", month: "short"})}
                  </h3>
                  <p className="text-[11px] text-gray-400">
                    Auditors: {cycleDetail.auditor_names.join(", ") || "None assigned"}
                  </p>
                </div>

                {/* 2. Checklist panel */}
                <div className="glass p-6 rounded-2xl space-y-6">
                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-white/5 text-gray-500 uppercase tracking-wider font-semibold">
                          <th className="py-3 px-2">Asset</th>
                          <th className="py-3 px-2">Expected location</th>
                          <th className="py-3 px-2">Verification</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {cycleDetail.items.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="py-10 text-center text-gray-500 italic">No assets mapped to this cycle scope.</td>
                          </tr>
                        ) : (
                          cycleDetail.items.map((item: any) => {
                            const isReadOnly = cycleDetail.status === "Closed" || 
                              (!cycleDetail.auditor_names.includes(currentUser?.name) && 
                               currentUser?.role !== "Admin" && 
                               currentUser?.role !== "AssetManager");
                            return (
                              <tr key={item.id} className="hover:bg-white/5 transition-all">
                                <td className="py-3 px-2 font-medium text-white">
                                  <span className="font-mono font-bold text-indigo-400 mr-2">{item.asset_tag}</span>
                                  <span>{item.asset_name}</span>
                                </td>
                                <td className="py-3 px-2 text-gray-400">{item.expected_location}</td>
                                <td className="py-3 px-2">
                                  {isReadOnly ? (
                                    <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold border ${getVerificationBadge(item.verification_status)}`}>
                                      {item.verification_status}
                                    </span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      <button
                                        onClick={() => handleVerifyChange(item.id, "Verified", item.notes || "")}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                          item.verification_status === "Verified"
                                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                            : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white"
                                        }`}
                                      >
                                        Verified
                                      </button>
                                      <button
                                        onClick={() => handleVerifyChange(item.id, "Missing", item.notes || "")}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                          item.verification_status === "Missing"
                                            ? "bg-red-500/20 text-red-400 border-red-500/30"
                                            : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white"
                                        }`}
                                      >
                                        Missing
                                      </button>
                                      <button
                                        onClick={() => handleVerifyChange(item.id, "Damaged", item.notes || "")}
                                        className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                                          item.verification_status === "Damaged"
                                            ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                            : "bg-white/5 text-gray-400 border-white/5 hover:bg-white/10 hover:text-white"
                                        }`}
                                      >
                                        Damaged
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Horizontal separator */}
                  <div className="border-t border-white/5 my-4"></div>

                  {/* 3. Discrepancy banner at the bottom */}
                  {discrepancyCount > 0 && (
                    <div className="bg-[#241b12] border border-[#3c2a1a] p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-md text-amber-200 text-xs font-semibold">
                      <span>{discrepancyCount} assets flagged - discrepancy report generated automatically</span>
                      <button 
                        onClick={handleExportCSV}
                        className="bg-amber-600/30 text-amber-300 hover:bg-amber-600 hover:text-white border border-amber-500/20 px-3 py-1.5 rounded-lg text-[10px] font-bold active:scale-[0.98] transition-all"
                      >
                        Export Report
                      </button>
                    </div>
                  )}

                  {/* 4. Cycle Close button at the bottom */}
                  {cycleDetail.status === "Open" && (currentUser?.role === "Admin" || currentUser?.role === "AssetManager") && (
                    <button
                      onClick={handleCloseCycle}
                      className="bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-[0.98]"
                    >
                      Close audit cycle
                    </button>
                  )}
                </div>

              </div>
            ) : (
              <div className="glass p-12 text-center text-gray-500 rounded-2xl">
                No active audit cycles. Choose or create a cycle to begin verification.
              </div>
            )}
          </div>

        </div>

        {/* --- CREATE CYCLE DIALOG MODAL --- */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-lg font-bold text-white font-sans">Launch Audit Cycle</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Scope Department</label>
                    <select
                      value={scopeDept}
                      onChange={(e) => setScopeDept(e.target.value)}
                      className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                    >
                      <option value="">All Departments</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Scope Location</label>
                    <input
                      type="text"
                      value={scopeLoc}
                      onChange={(e) => setScopeLoc(e.target.value)}
                      placeholder="e.g. Floor 3"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Start Date</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">End Date</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                    />
                  </div>
                </div>

                {/* Multiple auditors checklist */}
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Assign Auditors</label>
                  <div className="bg-[#161c2c] border border-white/10 rounded-xl p-3 max-h-32 overflow-y-auto space-y-2">
                    {employees.map(emp => (
                      <div key={emp.id} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`auditor_${emp.id}`}
                          checked={selectedAuditorIds.includes(emp.id)}
                          onChange={() => handleAuditorCheckbox(emp.id)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-0 focus:ring-offset-0 bg-[#090d16]"
                        />
                        <label htmlFor={`auditor_${emp.id}`} className="text-xs text-gray-300 font-medium cursor-pointer">
                          {emp.name} ({emp.role})
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl"
                  >
                    Launch Cycle
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
