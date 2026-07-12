"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { api } from "@/lib/api";
import { 
  UserCheck, 
  Shuffle, 
  Plus, 
  CornerDownLeft, 
  AlertOctagon, 
  HelpCircle,
  X,
  Clock,
  ArrowRightLeft
} from "lucide-react";

export default function AllocationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Tab Controls
  const [activeTab, setActiveTab] = useState<"allocs" | "transfers" | "overdue">("allocs");

  // Data lists
  const [allocations, setAllocations] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Direct Allocation Modal
  const [showAllocModal, setShowAllocModal] = useState(false);
  const [allocAssetId, setAllocAssetId] = useState("");
  const [allocHolderType, setAllocHolderType] = useState<"user" | "department">("user");
  const [allocHolderId, setAllocHolderId] = useState("");
  const [allocExpectedDate, setAllocExpectedDate] = useState("");

  // Double Allocation Conflict State
  const [conflictError, setConflictError] = useState<any>(null);

  // Return Modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnAssetId, setReturnAssetId] = useState<number | null>(null);
  const [returnNotes, setReturnNotes] = useState("");

  // Transfer Request Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferAssetId, setTransferAssetId] = useState("");
  const [transferToUserId, setTransferToUserId] = useState("");
  const [transferReason, setTransferReason] = useState("");

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

    // Read tab from query params if available
    const tabParam = searchParams.get("tab");
    if (tabParam === "overdue") {
      setActiveTab("overdue");
    }

    loadInitialData();
  }, [router, searchParams]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [allAssets, allEmps, allDepts] = await Promise.all([
        api.assets.list(),
        api.org.listEmployees(),
        api.org.listDepartments()
      ]);
      setAssets(allAssets);
      setEmployees(allEmps);
      setDepartments(allDepts);
      await fetchAllocationsAndTransfers();
    } catch (err: any) {
      setError(err.message || "Failed to load directory details.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllocationsAndTransfers() {
    try {
      const [allocList, transList] = await Promise.all([
        api.allocations.list(),
        api.allocations.listTransfers()
      ]);
      setAllocations(allocList);
      setTransfers(transList);
    } catch (err: any) {
      setError(err.message || "Failed to fetch allocations.");
    }
  }

  // --- ALLOCATION SUBMIT ---
  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setConflictError(null);
    setSuccess("");

    if (!allocAssetId || !allocHolderId) {
      setError("Please fill out all fields.");
      return;
    }

    const payload: any = {
      asset_id: parseInt(allocAssetId),
      expected_return_date: allocExpectedDate ? new Date(allocExpectedDate).toISOString() : null
    };

    if (allocHolderType === "user") {
      payload.holder_user_id = parseInt(allocHolderId);
    } else {
      payload.holder_department_id = parseInt(allocHolderId);
    }

    try {
      await api.allocations.create(payload);
      setSuccess("Asset allocated successfully.");
      setShowAllocModal(false);
      // Reset
      setAllocAssetId("");
      setAllocHolderId("");
      setAllocExpectedDate("");
      await loadInitialData();
    } catch (err: any) {
      // Catch double-allocation conflict (409)
      try {
        const errObj = JSON.parse(err.message);
        if (errObj && errObj.holder_name) {
          setConflictError(errObj);
        } else {
          setError(err.message || "Allocation failed.");
        }
      } catch {
        setError(err.message || "Allocation failed.");
      }
    }
  };

  const handleAssetChange = async (assetIdVal: string) => {
    setAllocAssetId(assetIdVal);
    setConflictError(null);
    if (!assetIdVal) return;

    try {
      const detail = await api.assets.get(parseInt(assetIdVal));
      if (detail.asset.status !== "Available") {
        const activeAlloc = detail.allocation_history.find((al: any) => al.status === "Active" || al.status === "Overdue");
        setConflictError({
          holder_name: activeAlloc ? activeAlloc.holder_user_name || activeAlloc.holder_department_name : "Unknown",
          department_name: activeAlloc ? activeAlloc.holder_department_name || "Department" : "Unknown",
          history: detail.allocation_history || []
        });
        setTransferAssetId(assetIdVal);
      }
    } catch (err) {
      console.error("Failed to load asset details for validation", err);
    }
  };

  // --- RETURN SUBMIT ---
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (returnAssetId === null) return;

    try {
      await api.allocations.return(returnAssetId, {
        return_condition_notes: returnNotes
      });
      setSuccess("Asset returned successfully. Status reset to Available.");
      setShowReturnModal(false);
      setReturnNotes("");
      setReturnAssetId(null);
      await loadInitialData();
    } catch (err: any) {
      setError(err.message || "Return process failed.");
    }
  };

  // --- TRANSFER SUBMIT ---
  const handleTransferSubmit = async (e: React.FormEvent) => {
    if (e && e.preventDefault) e.preventDefault();
    setError("");
    setSuccess("");

    if (!transferAssetId || !transferToUserId || !transferReason) {
      setError("Please fill out all fields.");
      return;
    }

    try {
      await api.allocations.createTransfer({
        asset_id: parseInt(transferAssetId),
        to_user_id: parseInt(transferToUserId),
        reason: transferReason
      });
      setSuccess("Transfer request submitted successfully. Awaiting approval.");
      setShowTransferModal(false);
      setShowAllocModal(false);
      setConflictError(null);
      setAllocAssetId("");
      setTransferAssetId("");
      setTransferToUserId("");
      setTransferReason("");
      await loadInitialData();
    } catch (err: any) {
      setError(err.message || "Transfer request failed.");
    }
  };

  // --- TRANSFER APPROVE / REJECT ---
  const handleApproveTransfer = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      await api.allocations.approveTransfer(id);
      setSuccess("Transfer approved. Asset has been re-allocated.");
      await loadInitialData();
    } catch (err: any) {
      setError(err.message || "Approval failed.");
    }
  };

  const handleRejectTransfer = async (id: number) => {
    setError("");
    setSuccess("");
    try {
      await api.allocations.rejectTransfer(id);
      setSuccess("Transfer request rejected.");
      await loadInitialData();
    } catch (err: any) {
      setError(err.message || "Rejection failed.");
    }
  };

  // Filter lists based on tab
  const activeAllocs = allocations.filter(al => al.status === "Active");
  const overdueAllocs = allocations.filter(al => al.status === "Overdue");

  return (
    <Sidebar>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Allocation & Transfers</h1>
            <p className="text-gray-400 text-sm mt-1">Manage asset assignments, check-ins, and routing transfers between staff</p>
          </div>
          {(currentUser?.role === "Admin" || currentUser?.role === "AssetManager") && (
            <div className="flex space-x-2">
              <button 
                onClick={() => {
                  setConflictError(null);
                  setError("");
                  setShowAllocModal(true);
                }}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-all"
              >
                <Plus size={16} />
                <span>Allocate Asset</span>
              </button>
            </div>
          )}
        </div>

        {/* Tab Controls */}
        <div className="flex space-x-2 bg-[#0e1424] p-1.5 rounded-xl border border-white/5 w-fit">
          <button 
            onClick={() => setActiveTab("allocs")}
            className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "allocs" ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/20" : "text-gray-400 hover:text-white"}`}
          >
            <UserCheck size={16} />
            <span>Active Allocations</span>
          </button>
          <button 
            onClick={() => setActiveTab("overdue")}
            className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "overdue" ? "bg-red-500/20 text-red-400 border border-red-500/20" : "text-gray-400 hover:text-white"}`}
          >
            <Clock size={16} />
            <span>Overdue Returns</span>
          </button>
          <button 
            onClick={() => setActiveTab("transfers")}
            className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "transfers" ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/20" : "text-gray-400 hover:text-white"}`}
          >
            <ArrowRightLeft size={16} />
            <span>Transfers</span>
          </button>
        </div>

        {/* Alert Notifications */}
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
        {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm">{success}</div>}

        {/* --- ACTIVE ALLOCATIONS TAB --- */}
        {activeTab === "allocs" && (
          <div className="glass rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/5 text-xs uppercase tracking-wider text-gray-400 font-semibold">
                  <th className="px-6 py-4">Asset</th>
                  <th className="px-6 py-4">Holder</th>
                  <th className="px-6 py-4">Assigned At</th>
                  <th className="px-6 py-4">Expected Return</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {activeAllocs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">No active asset allocations.</td>
                  </tr>
                ) : (
                  activeAllocs.map((al) => (
                    <tr key={al.id} className="hover:bg-white/5 transition-all">
                      <td className="px-6 py-4">
                        <span className="font-mono text-indigo-400 font-bold block">{al.asset_tag}</span>
                        <span className="text-white font-medium">{al.asset_name}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-300">
                        {al.holder_user_name ? (
                          <span>👤 {al.holder_user_name}</span>
                        ) : (
                          <span>🏢 {al.holder_department_name} (Dept)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-400">{new Date(al.allocated_at).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-gray-400">
                        {al.expected_return_date ? new Date(al.expected_return_date).toLocaleDateString() : "Indefinite"}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {/* Process Return Action (Managers only) */}
                        {(currentUser?.role === "Admin" || currentUser?.role === "AssetManager") ? (
                          <button
                            onClick={() => {
                              setReturnAssetId(al.asset_id);
                              setShowReturnModal(true);
                            }}
                            className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-600 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                          >
                            Return Check-in
                          </button>
                        ) : (
                          // Employees can request a transfer of assets allocated to them
                          currentUser?.id === al.holder_user_id && (
                            <button
                              onClick={() => {
                                setTransferAssetId(String(al.asset_id));
                                setShowTransferModal(true);
                              }}
                              className="bg-indigo-600/30 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-600 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                            >
                              Request Transfer
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* --- OVERDUE RETURNS TAB --- */}
        {activeTab === "overdue" && (
          <div className="glass rounded-2xl overflow-hidden shadow-xl border border-red-500/10">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-red-500/5 text-xs uppercase tracking-wider text-red-400 font-semibold">
                  <th className="px-6 py-4">Overdue Asset</th>
                  <th className="px-6 py-4">Holder</th>
                  <th className="px-6 py-4">Expected Return Date</th>
                  <th className="px-6 py-4">Days Overdue</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {overdueAllocs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">Great! No overdue return alerts pending.</td>
                  </tr>
                ) : (
                  overdueAllocs.map((al) => {
                    const days = Math.floor((Date.now() - new Date(al.expected_return_date).getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <tr key={al.id} className="hover:bg-red-500/5 transition-all bg-red-500/5">
                        <td className="px-6 py-4">
                          <span className="font-mono text-red-400 font-bold block">{al.asset_tag}</span>
                          <span className="text-white font-medium">{al.asset_name}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-300">
                          {al.holder_user_name ? `👤 ${al.holder_user_name}` : `🏢 ${al.holder_department_name} (Dept)`}
                        </td>
                        <td className="px-6 py-4 text-red-300 font-medium">
                          {new Date(al.expected_return_date).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-red-400 font-bold">{days} days</td>
                        <td className="px-6 py-4 text-right">
                          {(currentUser?.role === "Admin" || currentUser?.role === "AssetManager") && (
                            <button
                              onClick={() => {
                                setReturnAssetId(al.asset_id);
                                setShowReturnModal(true);
                              }}
                              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
                            >
                              Check-in Return
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* --- TRANSFERS TAB --- */}
        {activeTab === "transfers" && (
          <div className="glass rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/5 text-xs uppercase tracking-wider text-gray-400 font-semibold">
                  <th className="px-6 py-4">Asset</th>
                  <th className="px-6 py-4">From</th>
                  <th className="px-6 py-4">To (Target)</th>
                  <th className="px-6 py-4">Reason</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-500">No transfer requests submitted.</td>
                  </tr>
                ) : (
                  transfers.map((tr) => (
                    <tr key={tr.id} className="hover:bg-white/5 transition-all">
                      <td className="px-6 py-4">
                        <span className="font-mono text-indigo-400 font-bold block">{tr.asset_tag}</span>
                        <span className="text-white font-medium">{tr.asset_name}</span>
                      </td>
                      <td className="px-6 py-4 text-gray-300">{tr.from_user_name}</td>
                      <td className="px-6 py-4 text-gray-200 font-medium">{tr.to_user_name}</td>
                      <td className="px-6 py-4 text-gray-400 italic max-w-xs truncate" title={tr.reason}>{tr.reason}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          tr.status === "Requested" ? "bg-amber-500/20 text-amber-400" :
                          tr.status === "Approved" ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>
                          {tr.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        {tr.status === "Requested" && (currentUser?.role === "Admin" || currentUser?.role === "AssetManager" || currentUser?.role === "DeptHead") && (
                          <>
                            <button
                              onClick={() => handleApproveTransfer(tr.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded shadow"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectTransfer(tr.id)}
                              className="bg-red-600/30 hover:bg-red-600 text-red-300 hover:text-white text-xs font-bold px-2.5 py-1 rounded border border-red-500/20"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* --- ALLOCATE MODAL --- */}
        {showAllocModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-lg font-bold text-white">Create Asset Allocation</h3>
                <button onClick={() => setShowAllocModal(false)} className="text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAllocateSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Select Asset</label>
                  <select
                    required
                    value={allocAssetId}
                    onChange={(e) => handleAssetChange(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                  >
                    <option value="">Choose Asset</option>
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.tag} - {a.name} ({a.status})
                      </option>
                    ))}
                  </select>
                </div>

                {conflictError ? (
                  <div className="space-y-4 border-t border-white/5 pt-4">
                    {/* Red block conflict warning */}
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs leading-relaxed space-y-1">
                      <p className="font-semibold text-red-200">Already Allocated to {conflictError.holder_name} ({conflictError.department_name})</p>
                      <p className="text-gray-400">Direct re-allocation is blocked - submit a transfer request below</p>
                    </div>

                    {/* Transfer Request fields */}
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Transfer Request</h4>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">From</label>
                          <input
                            type="text"
                            readOnly
                            value={conflictError.holder_name}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-gray-400 focus:outline-none select-none text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">To</label>
                          <select
                            required
                            value={transferToUserId}
                            onChange={(e) => setTransferToUserId(e.target.value)}
                            className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none text-xs"
                          >
                            <option value="">Select Employee....</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Reason</label>
                        <textarea
                          required
                          rows={3}
                          value={transferReason}
                          onChange={(e) => setTransferReason(e.target.value)}
                          placeholder="Why is this asset being handed over?..."
                          className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none text-xs"
                        ></textarea>
                      </div>

                      <div className="flex space-x-3 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAllocModal(false);
                            setConflictError(null);
                            setAllocAssetId("");
                          }}
                          className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleTransferSubmit}
                          className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl text-xs"
                        >
                          Submit Request
                        </button>
                      </div>
                    </div>

                    {/* Allocation History timeline */}
                    {conflictError.history && conflictError.history.length > 0 && (
                      <div className="pt-4 border-t border-white/5 space-y-3">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Allocation history</h4>
                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                          {conflictError.history.map((h: any) => (
                            <div key={h.id} className="text-[10px] text-gray-400 border-l-2 border-indigo-500 pl-2 py-0.5">
                              <span className="font-semibold text-white">{new Date(h.allocated_at).toLocaleDateString([], { month: 'short', day: '2-digit' })}</span> - {h.returned_at ? `Returned by ${h.holder_user_name || "Staff"}` : `Allocated to ${h.holder_user_name || "Staff"}`} - {h.holder_department_name || "Company"} {h.return_condition_notes ? `(${h.return_condition_notes})` : ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Holder Type</label>
                        <select
                          value={allocHolderType}
                          onChange={(e) => {
                            setAllocHolderType(e.target.value as any);
                            setAllocHolderId("");
                          }}
                          className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                        >
                          <option value="user">Individual Employee</option>
                          <option value="department">Department</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Assign To</label>
                        {allocHolderType === "user" ? (
                          <select
                            required
                            value={allocHolderId}
                            onChange={(e) => setAllocHolderId(e.target.value)}
                            className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                          >
                            <option value="">Select Employee</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        ) : (
                          <select
                            required
                            value={allocHolderId}
                            onChange={(e) => setAllocHolderId(e.target.value)}
                            className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                          >
                            <option value="">Select Department</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Expected Return Date (Optional)</label>
                      <input
                        type="date"
                        value={allocExpectedDate}
                        onChange={(e) => setAllocExpectedDate(e.target.value)}
                        className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                      />
                    </div>

                    <div className="flex space-x-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAllocModal(false);
                          setAllocAssetId("");
                        }}
                        className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl"
                      >
                        Submit
                      </button>
                    </div>
                  </>
                )}
              </form>
            </div>
          </div>
        )}

        {/* --- RETURN CHECK-IN MODAL --- */}
        {showReturnModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-white">Asset Return Check-in</h3>
              <form onSubmit={handleReturnSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Condition Notes</label>
                  <textarea
                    required
                    rows={4}
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                    placeholder="Describe returned asset condition (e.g. good, slight scratch, loose HDMI port)..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500"
                  ></textarea>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReturnModal(false);
                      setReturnNotes("");
                      setReturnAssetId(null);
                    }}
                    className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl"
                  >
                    Confirm Check-in
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* --- TRANSFER MODAL --- */}
        {showTransferModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-lg font-bold text-white">Create Transfer Request</h3>
                <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleTransferSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Select Asset (Currently Allocated)</label>
                  <select
                    required
                    value={transferAssetId}
                    onChange={(e) => setTransferAssetId(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                  >
                    <option value="">Select Asset</option>
                    {assets.filter(a => a.status === "Allocated" || a.status === "Reserved").map(a => (
                      <option key={a.id} value={a.id}>
                        {a.tag} - {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Transfer To (Recipient User)</label>
                  <select
                    required
                    value={transferToUserId}
                    onChange={(e) => setTransferToUserId(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                  >
                    <option value="">Choose Recipient</option>
                    {employees.filter(emp => emp.id !== currentUser?.id).map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Reason for Transfer</label>
                  <textarea
                    required
                    rows={3}
                    value={transferReason}
                    onChange={(e) => setTransferReason(e.target.value)}
                    placeholder="Why is this asset being handed over?..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none"
                  ></textarea>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTransferModal(false)}
                    className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl shadow-lg"
                  >
                    Submit Request
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
