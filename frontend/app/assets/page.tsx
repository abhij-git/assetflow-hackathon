"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { api } from "@/lib/api";
import { 
  Search, 
  Filter, 
  Plus, 
  FileText, 
  Image as ImageIcon,
  History, 
  Wrench, 
  UserCheck, 
  Info,
  Calendar,
  X,
  Upload
} from "lucide-react";

export default function AssetsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Data lists
  const [assets, setAssets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filters state
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");

  // Asset Detail Modal
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [assetDetail, setAssetDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Asset Registration Modal
  const [showRegModal, setShowRegModal] = useState(false);
  const [regName, setRegName] = useState("");
  const [regCategory, setRegCategory] = useState("");
  const [regSerial, setRegSerial] = useState("");
  const [regAcqDate, setRegAcqDate] = useState("");
  const [regCost, setRegCost] = useState("");
  const [regCondition, setRegCondition] = useState("Good");
  const [regLocation, setRegLocation] = useState("");
  const [regIsBookable, setRegIsBookable] = useState(false);
  const [regPhotoFile, setRegPhotoFile] = useState<File | null>(null);
  const [regPhotoUrl, setRegPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);

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

  useEffect(() => {
    // Automatically trigger register modal if query param is set
    const action = searchParams.get("action");
    if (action === "register") {
      setShowRegModal(true);
    }
  }, [searchParams]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [cats, depts] = await Promise.all([
        api.org.listCategories(),
        api.org.listDepartments()
      ]);
      setCategories(cats);
      setDepartments(depts);
      await fetchAssets();
    } catch (err: any) {
      setError(err.message || "Failed to load directory filters.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchAssets() {
    try {
      const list = await api.assets.list({
        search,
        category_id: selectedCategory,
        status: selectedStatus,
        department_id: selectedDepartment
      });
      setAssets(list);
    } catch (err: any) {
      setError(err.message || "Failed to fetch assets.");
    }
  }

  // Reload assets on filter changes
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchAssets();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [search, selectedCategory, selectedStatus, selectedDepartment]);

  const handleAssetClick = async (asset: any) => {
    setSelectedAsset(asset);
    setDetailLoading(true);
    try {
      const detail = await api.assets.get(asset.id);
      setAssetDetail(detail);
    } catch (err: any) {
      setError(err.message || "Failed to fetch asset history.");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setRegPhotoFile(e.target.files[0]);
    }
  };

  const handleFileUpload = async () => {
    if (!regPhotoFile) return;
    setUploading(true);
    setError("");
    try {
      const res = await api.assets.upload(regPhotoFile);
      setRegPhotoUrl(res.url);
      setSuccess("Media uploaded to MinIO successfully!");
    } catch (err: any) {
      setError(err.message || "File upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!regCategory) {
      setError("Please select an asset category");
      return;
    }

    const payload = {
      name: regName,
      category_id: parseInt(regCategory),
      serial_number: regSerial || null,
      acquisition_date: regAcqDate,
      acquisition_cost: parseFloat(regCost),
      condition: regCondition,
      location: regLocation,
      is_bookable: regIsBookable,
      photo_url: regPhotoUrl || null,
      document_urls: []
    };

    try {
      await api.assets.create(payload);
      setSuccess("Asset registered successfully.");
      
      // Reset & Reload
      setRegName("");
      setRegCategory("");
      setRegSerial("");
      setRegAcqDate("");
      setRegCost("");
      setRegCondition("Good");
      setRegLocation("");
      setRegIsBookable(false);
      setRegPhotoFile(null);
      setRegPhotoUrl("");
      setShowRegModal(false);
      
      // Clean query params
      router.push("/assets");
      await fetchAssets();
    } catch (err: any) {
      setError(err.message || "Failed to register asset.");
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "Available": return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
      case "Allocated": return "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30";
      case "Reserved": return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
      case "UnderMaintenance": return "bg-rose-500/20 text-rose-400 border border-rose-500/30";
      case "Lost": return "bg-red-500/20 text-red-400 border border-red-500/30";
      default: return "bg-gray-500/20 text-gray-400 border border-gray-500/30";
    }
  };

  return (
    <Sidebar>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Asset Catalog</h1>
            <p className="text-gray-400 text-sm mt-1">Track physical assets and shared resources throughout their full lifecycles</p>
          </div>
          {(currentUser?.role === "Admin" || currentUser?.role === "AssetManager") && (
            <button 
              onClick={() => setShowRegModal(true)}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-all"
            >
              <Plus size={16} />
              <span>Register Asset</span>
            </button>
          )}
        </div>

        {/* Alert Notifications */}
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
        {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm">{success}</div>}

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#0e1424] p-4 rounded-2xl border border-white/5 shadow-lg">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search by tag, serial, or QR code.."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="" className="bg-[#0e1424]">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id} className="bg-[#0e1424]">{cat.name}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="" className="bg-[#0e1424]">All Statuses</option>
              <option value="Available" className="bg-[#0e1424]">Available</option>
              <option value="Allocated" className="bg-[#0e1424]">Allocated</option>
              <option value="Reserved" className="bg-[#0e1424]">Reserved</option>
              <option value="UnderMaintenance" className="bg-[#0e1424]">Under Maintenance</option>
              <option value="Lost" className="bg-[#0e1424]">Lost</option>
              <option value="Retired" className="bg-[#0e1424]">Retired</option>
              <option value="Disposed" className="bg-[#0e1424]">Disposed</option>
            </select>
          </div>

          <div>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="" className="bg-[#0e1424]">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id} className="bg-[#0e1424]">{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Directory Table */}
        <div className="glass rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/5 text-xs uppercase tracking-wider text-gray-400 font-semibold">
                <th className="px-6 py-4">Asset Tag</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Bookable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm">
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-500">No assets matching filters.</td>
                </tr>
              ) : (
                assets.map((asset) => (
                  <tr 
                    key={asset.id} 
                    onClick={() => handleAssetClick(asset)}
                    className="hover:bg-white/5 cursor-pointer transition-all"
                  >
                    <td className="px-6 py-4 font-mono font-bold text-indigo-400">{asset.tag}</td>
                    <td className="px-6 py-4 font-medium text-white">{asset.name}</td>
                    <td className="px-6 py-4 text-gray-300">{asset.category_name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${getStatusBadgeColor(asset.status)}`}>
                        {asset.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400">{asset.location}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block text-xs font-semibold ${asset.is_bookable ? "text-indigo-400" : "text-gray-600"}`}>
                        {asset.is_bookable ? "Shared Room/Car" : "Solo / Direct"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* --- REGISTER MODAL --- */}
        {showRegModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="glass w-full max-w-lg p-6 rounded-2xl shadow-2xl space-y-4 my-8">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="text-xl font-bold text-white">Register New Asset</h3>
                <button 
                  onClick={() => {
                    setShowRegModal(false);
                    router.push("/assets");
                  }} 
                  className="text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleRegisterSubmit} className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-1">Asset Name</label>
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Dell XPS 15"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-1">Category</label>
                    <select
                      required
                      value={regCategory}
                      onChange={(e) => setRegCategory(e.target.value)}
                      className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Select Category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-1">Serial Number</label>
                    <input
                      type="text"
                      value={regSerial}
                      onChange={(e) => setRegSerial(e.target.value)}
                      placeholder="S/N: 987654321"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-1">Condition</label>
                    <select
                      value={regCondition}
                      onChange={(e) => setRegCondition(e.target.value)}
                      className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                    >
                      <option value="New">New</option>
                      <option value="Good">Good</option>
                      <option value="Fair">Fair</option>
                      <option value="Poor">Poor</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-1">Acquisition Date</label>
                    <input
                      type="date"
                      required
                      value={regAcqDate}
                      onChange={(e) => setRegAcqDate(e.target.value)}
                      className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-1">Acquisition Cost ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={regCost}
                      onChange={(e) => setRegCost(e.target.value)}
                      placeholder="1200.00"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-1">Default/Expected Location</label>
                  <input
                    type="text"
                    required
                    value={regLocation}
                    onChange={(e) => setRegLocation(e.target.value)}
                    placeholder="Floor 2 IT Cabinet"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center space-x-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <input
                    type="checkbox"
                    id="is_bookable"
                    checked={regIsBookable}
                    onChange={(e) => setRegIsBookable(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0 focus:ring-offset-0 bg-[#090d16]"
                  />
                  <label htmlFor="is_bookable" className="text-xs text-gray-300 font-medium cursor-pointer">
                    Mark as a Shared / Bookable Resource (e.g. car, projector, boardroom)
                  </label>
                </div>

                {/* MinIO File Upload */}
                <div className="border-t border-white/5 pt-4">
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Upload Photo Attachment (MinIO)</label>
                  <div className="flex items-center space-x-3">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleFileChange}
                      className="text-xs text-gray-400 file:mr-4 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600/30 file:text-indigo-300 file:cursor-pointer hover:file:bg-indigo-600/50"
                    />
                    {regPhotoFile && (
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
                  {regPhotoUrl && (
                    <p className="text-[10px] text-emerald-400 font-mono mt-2 truncate">
                      Uploaded URL: {regPhotoUrl}
                    </p>
                  )}
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRegModal(false);
                      router.push("/assets");
                    }}
                    className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-indigo-600/20"
                  >
                    Register
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* --- DETAIL MODAL --- */}
        {selectedAsset && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="glass w-full max-w-2xl p-6 rounded-2xl shadow-2xl space-y-6 my-8">
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <div>
                  <span className="text-xs font-mono font-bold text-indigo-400 block mb-0.5">{selectedAsset.tag}</span>
                  <h3 className="text-2xl font-bold text-white">{selectedAsset.name}</h3>
                </div>
                <button 
                  onClick={() => {
                    setSelectedAsset(null);
                    setAssetDetail(null);
                  }} 
                  className="text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {detailLoading ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-2">
                  <div className="w-8 h-8 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
                  <span className="text-xs text-gray-500">Loading timeline history...</span>
                </div>
              ) : (
                <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
                  {/* Photo Display */}
                  {selectedAsset.photo_url && (
                    <div className="w-full h-48 rounded-xl overflow-hidden relative border border-white/5 bg-white/5">
                      <img 
                        src={selectedAsset.photo_url} 
                        alt={selectedAsset.name}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  )}

                  {/* Metadata Fields */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
                    <div>
                      <span className="block text-[10px] uppercase text-gray-500 font-semibold mb-0.5">Serial Number</span>
                      <span className="text-sm font-medium text-gray-200">{selectedAsset.serial_number || "—"}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-gray-500 font-semibold mb-0.5">Acquisition Cost</span>
                      <span className="text-sm font-medium text-gray-200">${selectedAsset.acquisition_cost.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-gray-500 font-semibold mb-0.5">Acquired On</span>
                      <span className="text-sm font-medium text-gray-200">{new Date(selectedAsset.acquisition_date).toLocaleDateString()}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase text-gray-500 font-semibold mb-0.5">Condition</span>
                      <span className="text-sm font-medium text-gray-200">{selectedAsset.condition}</span>
                    </div>
                  </div>

                  {/* Custom Specifications (Category based) */}
                  {selectedAsset.category?.custom_fields && (
                    <div className="space-y-2">
                      <h4 className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">Technical Specifications</h4>
                      <div className="grid grid-cols-2 gap-3 bg-[#0e1424] p-3 rounded-xl border border-white/5">
                        {Object.entries(selectedAsset.category.custom_fields).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-xs py-1 border-b border-white/5 last:border-0">
                            <span className="text-gray-400">{k}</span>
                            <span className="text-gray-200 font-medium">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timeline Tabs: Allocations & Maintenance */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                    
                    {/* Allocation History */}
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center space-x-2 mb-4">
                        <UserCheck size={16} className="text-indigo-400" />
                        <span>Allocation Timeline</span>
                      </h4>
                      {assetDetail?.allocation_history.length === 0 ? (
                        <p className="text-xs text-gray-500 italic">No allocation logs registered.</p>
                      ) : (
                        <div className="relative border-l border-white/10 pl-4 space-y-4">
                          {assetDetail?.allocation_history.map((al: any) => (
                            <div key={al.id} className="relative text-xs">
                              <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                              <p className="text-gray-200 font-medium">
                                Allocated to {al.holder_user_name || `Dept: ${al.holder_department_name}`}
                              </p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                {new Date(al.allocated_at).toLocaleDateString()}
                                {al.returned_at ? ` - Returned ${new Date(al.returned_at).toLocaleDateString()}` : " (Active)"}
                              </p>
                              {al.return_condition_notes && (
                                <p className="text-gray-400 italic text-[10px] mt-1 bg-white/5 p-1 rounded">
                                  Notes: {al.return_condition_notes}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Maintenance History */}
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center space-x-2 mb-4">
                        <Wrench size={16} className="text-indigo-400" />
                        <span>Maintenance Log</span>
                      </h4>
                      {assetDetail?.maintenance_history.length === 0 ? (
                        <p className="text-xs text-gray-500 italic">No repairs or maintenance requested.</p>
                      ) : (
                        <div className="relative border-l border-white/10 pl-4 space-y-4">
                          {assetDetail?.maintenance_history.map((m: any) => (
                            <div key={m.id} className="relative text-xs">
                              <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                              <p className="text-gray-200 font-medium">
                                {m.issue_description}
                              </p>
                              <p className="text-[10px] text-gray-500 mt-0.5">
                                Raised by {m.raised_by_name} - Status: <span className="text-rose-300 font-semibold">{m.status}</span>
                              </p>
                              {m.technician_name && (
                                <p className="text-[10px] text-gray-400 mt-1">Technician: {m.technician_name}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
