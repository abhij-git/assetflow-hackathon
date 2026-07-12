"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { api } from "@/lib/api";
import { 
  Wrench, 
  Plus, 
  X, 
  Upload,
  User,
  AlertCircle,
  FileCheck,
  CheckCircle2,
  ChevronRight
} from "lucide-react";

const KANBAN_COLUMNS = [
  { id: "Pending", name: "Pending", desc: "Awaiting approval", color: "border-t-amber-500 bg-amber-500/5 text-amber-300" },
  { id: "Approved", name: "Approved", desc: "Ready for repair", color: "border-t-indigo-500 bg-indigo-500/5 text-indigo-300" },
  { id: "TechnicianAssigned", name: "Technician Assigned", desc: "Technician dispatched", color: "border-t-blue-500 bg-blue-500/5 text-blue-300" },
  { id: "InProgress", name: "In Progress", desc: "Repair active", color: "border-t-purple-500 bg-purple-500/5 text-purple-300" },
  { id: "Resolved", name: "Resolved", desc: "Fixed & Available", color: "border-t-emerald-500 bg-emerald-500/5 text-emerald-300" }
];

export default function MaintenancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Data lists
  const [requests, setRequests] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Creation State
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [raiseAssetId, setRaiseAssetId] = useState("");
  const [raiseDesc, setRaiseDesc] = useState("");
  const [raisePriority, setRaisePriority] = useState("Medium");
  const [raiseFile, setRaiseFile] = useState<File | null>(null);
  const [raisePhotoUrl, setRaisePhotoUrl] = useState("");

  // Assign Tech/Transition States
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [pendingTransitionId, setPendingTransitionId] = useState<number | null>(null);
  const [pendingNewStatus, setPendingNewStatus] = useState<string>("");
  const [technicianName, setTechnicianName] = useState("");

  const [uploading, setUploading] = useState(false);
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

    // Open raise modal if triggered by dashboard quick action
    if (searchParams.get("action") === "raise") {
      setShowRaiseModal(true);
    }

    loadInitialData();
  }, [router, searchParams]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const allAssets = await api.assets.list();
      setAssets(allAssets);
      await fetchRequests();
    } catch (err: any) {
      setError(err.message || "Failed to load maintenance data.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchRequests() {
    try {
      const list = await api.maintenance.list();
      setRequests(list);
    } catch (err: any) {
      setError(err.message || "Failed to fetch maintenance tickets.");
    }
  }

  // --- RAISE TICKET SUBMIT ---
  const handleRaiseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!raiseAssetId || !raiseDesc) {
      setError("Please fill out required fields.");
      return;
    }

    try {
      await api.maintenance.create({
        asset_id: parseInt(raiseAssetId),
        issue_description: raiseDesc,
        priority: raisePriority,
        photo_url: raisePhotoUrl || null
      });
      setSuccess("Maintenance ticket created successfully.");
      setShowRaiseModal(false);
      // Reset
      setRaiseAssetId("");
      setRaiseDesc("");
      setRaisePriority("Medium");
      setRaisePhotoUrl("");
      setRaiseFile(null);
      
      router.push("/maintenance");
      await fetchRequests();
    } catch (err: any) {
      setError(err.message || "Failed to raise request.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setRaiseFile(e.target.files[0]);
    }
  };

  const handleFileUpload = async () => {
    if (!raiseFile) return;
    setUploading(true);
    setError("");
    try {
      const res = await api.assets.upload(raiseFile);
      setRaisePhotoUrl(res.url);
      setSuccess("Ticket photo uploaded successfully.");
    } catch (err: any) {
      setError(err.message || "File upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // --- KANBAN TRANSITION FLOW ---
  const handleDragStart = (e: React.DragEvent, id: number) => {
    if (currentUser?.role !== "Admin" && currentUser?.role !== "AssetManager") {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", String(id));
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const idStr = e.dataTransfer.getData("text/plain");
    if (!idStr) return;
    const reqId = parseInt(idStr);

    // If target is TechAssigned, open modal to input technician name
    if (newStatus === "TechnicianAssigned") {
      setPendingTransitionId(reqId);
      setPendingNewStatus(newStatus);
      setTechnicianName("");
      setShowAssignModal(true);
      return;
    }

    await executeTransition(reqId, newStatus);
  };

  const executeTransition = async (reqId: number, statusVal: string, techName?: string) => {
    setError("");
    setSuccess("");
    try {
      await api.maintenance.updateStatus(reqId, {
        status: statusVal,
        technician_name: techName || null
      });
      setSuccess(`Ticket status updated to ${statusVal}.`);
      await fetchRequests();
    } catch (err: any) {
      setError(err.message || "Failed to transition state.");
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingTransitionId || !pendingNewStatus || !technicianName) return;
    
    setShowAssignModal(false);
    await executeTransition(pendingTransitionId, pendingNewStatus, technicianName);
    setPendingTransitionId(null);
    setPendingNewStatus("");
    setTechnicianName("");
  };

  const getPriorityColor = (prio: string) => {
    switch (prio) {
      case "Critical": return "bg-red-500/25 text-red-300 border border-red-500/20";
      case "High": return "bg-amber-500/25 text-amber-300 border border-amber-500/20";
      case "Medium": return "bg-blue-500/25 text-blue-300 border border-blue-500/20";
      default: return "bg-slate-500/25 text-slate-400 border border-slate-500/20";
    }
  };

  if (loading) {
    return (
      <Sidebar>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
          <div className="w-12 h-12 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
          <span className="text-gray-400 text-sm">Loading Kanban workboards...</span>
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
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Maintenance Pipeline</h1>
            <p className="text-gray-400 text-sm mt-1">Approve tickets, dispatch technicians, and track hardware maintenance lifecycles</p>
          </div>
          <button 
            onClick={() => {
              setError("");
              setShowRaiseModal(true);
            }}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-all"
          >
            <Plus size={16} />
            <span>Raise Request</span>
          </button>
        </div>

        {/* Informational Banner */}
        {(currentUser?.role === "Admin" || currentUser?.role === "AssetManager") && (
          <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-2xl p-4 flex items-center space-x-2 text-indigo-300 text-xs">
            <span className="font-bold">🛠️ Kanban Board Drag-and-Drop Active:</span>
            <span>You can drag cards between columns to transition maintenance tickets. Invalid states will block automatically.</span>
          </div>
        )}

        {/* Alert Notifications */}
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
        {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm">{success}</div>}

        {/* KANBAN BOARD */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
          {KANBAN_COLUMNS.map((col) => {
            const colReqs = requests.filter(r => r.status === col.id);
            return (
              <div 
                key={col.id} 
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, col.id)}
                className={`rounded-2xl border-t-2 border border-white/5 p-4 flex flex-col space-y-4 min-h-[60vh] max-h-[80vh] overflow-y-auto ${col.color}`}
              >
                {/* Column Title */}
                <div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm text-white">{col.name}</span>
                    <span className="text-xs bg-white/5 border border-white/5 px-2 py-0.5 rounded-full font-mono text-gray-400">
                      {colReqs.length}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">{col.desc}</p>
                </div>

                {/* Cards Container */}
                <div className="space-y-3 flex-1">
                  {colReqs.map((req) => {
                    const isResolved = req.status === "Resolved";
                    return (
                      <div
                        key={req.id}
                        draggable={currentUser?.role === "Admin" || currentUser?.role === "AssetManager"}
                        onDragStart={(e) => handleDragStart(e, req.id)}
                        className={`
                          p-4 rounded-xl space-y-3 border shadow-md transition-all
                          ${isResolved ? "bg-emerald-950/30 border-emerald-500/20 text-emerald-100" : "glass border-white/5"}
                          ${(currentUser?.role === "Admin" || currentUser?.role === "AssetManager") ? "cursor-grab active:cursor-grabbing hover:border-indigo-500/40" : ""}
                        `}
                      >
                        {/* Asset Info */}
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`font-mono text-[10px] font-bold ${isResolved ? "text-emerald-400" : "text-indigo-400"}`}>{req.asset_tag}</span>
                            <h4 className="text-xs font-semibold text-white truncate max-w-[130px]">{req.asset_name}</h4>
                          </div>
                          <span className={`px-2 py-0.5 text-[8px] font-semibold rounded-full ${isResolved ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/20" : getPriorityColor(req.priority)}`}>
                            {isResolved ? "Resolved" : req.priority}
                          </span>
                        </div>

                        {/* Ticket Issue Description */}
                        <p className={`text-xs line-clamp-2 leading-relaxed ${isResolved ? "text-emerald-300/80" : "text-gray-400"}`} title={req.issue_description}>
                          {req.issue_description}
                        </p>

                        {/* Photo Thumbnail */}
                        {req.photo_url && (
                          <div className="w-full h-20 rounded-lg overflow-hidden border border-white/5 relative bg-white/5">
                            <img 
                              src={req.photo_url} 
                              alt="issue photo" 
                              className="object-cover w-full h-full"
                            />
                          </div>
                        )}

                        {/* Footer */}
                        <div className={`flex justify-between items-center text-[9px] pt-2 border-t ${isResolved ? "text-emerald-500 border-emerald-500/10" : "text-gray-500 border-white/5"}`}>
                          <span className="truncate max-w-[90px]">👤 {req.raised_by_name}</span>
                          {req.technician_name ? (
                            <span className="text-blue-400 truncate max-w-[80px]">🔧 {req.technician_name}</span>
                          ) : (
                            <span>#{req.id}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom helper note */}
        <p className="text-xs text-gray-500/80 italic mt-4 text-center">
          Approving a card moves the asset to under maintenance, resolving return it to available.
        </p>

        {/* --- RAISE MODAL --- */}
        {showRaiseModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-lg font-bold text-white">Raise Maintenance Request</h3>
                <button 
                  onClick={() => {
                    setShowRaiseModal(false);
                    router.push("/maintenance");
                  }} 
                  className="text-gray-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleRaiseSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Select Asset</label>
                  <select
                    required
                    value={raiseAssetId}
                    onChange={(e) => setRaiseAssetId(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                  >
                    <option value="">Select Asset</option>
                    {assets.map(a => (
                      <option key={a.id} value={a.id}>{a.tag} - {a.name} ({a.status})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Priority Level</label>
                  <select
                    value={raisePriority}
                    onChange={(e) => setRaisePriority(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Issue Description</label>
                  <textarea
                    required
                    rows={3}
                    value={raiseDesc}
                    onChange={(e) => setRaiseDesc(e.target.value)}
                    placeholder="Provide details about the malfunction or service requirements..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none"
                  ></textarea>
                </div>

                {/* Photo upload */}
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Attach Photo (Optional)</label>
                  <div className="flex items-center space-x-3">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange}
                      className="text-xs text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600/30 file:text-indigo-300 file:cursor-pointer"
                    />
                    {raiseFile && (
                      <button
                        type="button"
                        onClick={handleFileUpload}
                        disabled={uploading}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1 active:scale-[0.98] transition-all"
                      >
                        <Upload size={12} />
                        <span>{uploading ? "Uploading..." : "Upload"}</span>
                      </button>
                    )}
                  </div>
                  {raisePhotoUrl && (
                    <p className="text-[10px] text-emerald-400 font-mono mt-2 truncate">
                      File link: {raisePhotoUrl}
                    </p>
                  )}
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRaiseModal(false);
                      router.push("/maintenance");
                    }}
                    className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* --- ASSIGN TECHNICIAN DIALOG MODAL --- */}
        {showAssignModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-white">Assign Dispatch Technician</h3>
              <form onSubmit={handleAssignSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Technician Full Name</label>
                  <input
                    type="text"
                    required
                    value={technicianName}
                    onChange={(e) => setTechnicianName(e.target.value)}
                    placeholder="Arun Kumar (Service Engineer)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAssignModal(false);
                      setPendingTransitionId(null);
                      setPendingNewStatus("");
                    }}
                    className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl"
                  >
                    Assign & Transition
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
