"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { api } from "@/lib/api";
import { 
  Building, 
  Tags, 
  Users, 
  Plus, 
  Check, 
  ShieldCheck, 
  ToggleLeft, 
  ToggleRight,
  Edit2
} from "lucide-react";

export default function OrganizationPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"depts" | "categories" | "employees">("depts");
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Data lists
  const [departments, setDepartments] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
  // Creation States
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [deptHeadId, setDeptHeadId] = useState("");
  const [deptParentId, setDeptParentId] = useState("");
  const [deptStatus, setDeptStatus] = useState("Active");
  const [editDeptId, setEditDeptId] = useState<number | null>(null);

  const [showCatModal, setShowCatModal] = useState(false);
  const [catName, setCatName] = useState("");
  const [customFieldName, setCustomFieldName] = useState("");
  const [customFieldType, setCustomFieldType] = useState("string");
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    // Auth & Permission Checks
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    const user = api.auth.getCurrentUser();
    setCurrentUser(user);

    if (user && user.role !== "Admin") {
      router.push("/dashboard");
      return;
    }

    loadAllData();
  }, [router]);

  async function loadAllData() {
    setLoading(true);
    setError("");
    try {
      const [depts, cats, emps] = await Promise.all([
        api.org.listDepartments(),
        api.org.listCategories(),
        api.org.listEmployees(),
      ]);
      setDepartments(depts);
      setCategories(cats);
      setEmployees(emps);
    } catch (err: any) {
      setError(err.message || "Failed to load organization settings.");
    } finally {
      setLoading(false);
    }
  }

  // --- DEPARTMENTS HANDLERS ---
  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    const payload = {
      name: deptName,
      head_user_id: deptHeadId ? parseInt(deptHeadId) : null,
      parent_department_id: deptParentId ? parseInt(deptParentId) : null,
      status: deptStatus
    };

    try {
      if (editDeptId) {
        await api.org.updateDepartment(editDeptId, payload);
        setSuccess("Department updated successfully.");
      } else {
        await api.org.createDepartment(payload);
        setSuccess("Department created successfully.");
      }
      // Reset & Reload
      setDeptName("");
      setDeptHeadId("");
      setDeptParentId("");
      setDeptStatus("Active");
      setEditDeptId(null);
      setShowDeptModal(false);
      await loadAllData();
    } catch (err: any) {
      setError(err.message || "Failed to save department.");
    }
  };

  const handleEditDept = (dept: any) => {
    setEditDeptId(dept.id);
    setDeptName(dept.name);
    setDeptHeadId(dept.head_user_id ? String(dept.head_user_id) : "");
    setDeptParentId(dept.parent_department_id ? String(dept.parent_department_id) : "");
    setDeptStatus(dept.status);
    setShowDeptModal(true);
  };

  // --- CATEGORIES HANDLERS ---
  const addCustomField = () => {
    if (!customFieldName) return;
    setCustomFields({
      ...customFields,
      [customFieldName]: customFieldType
    });
    setCustomFieldName("");
  };

  const removeCustomField = (key: string) => {
    const updated = { ...customFields };
    delete updated[key];
    setCustomFields(updated);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      await api.org.createCategory({
        name: catName,
        custom_fields: Object.keys(customFields).length > 0 ? customFields : null
      });
      setSuccess("Category created successfully.");
      setCatName("");
      setCustomFields({});
      setShowCatModal(false);
      await loadAllData();
    } catch (err: any) {
      setError(err.message || "Failed to create category.");
    }
  };

  // --- EMPLOYEES HANDLERS ---
  const handlePromoteRole = async (employeeId: number, currentRole: string) => {
    // Cycle roles: Employee -> AssetManager -> DeptHead -> Employee
    let nextRole = "Employee";
    if (currentRole === "Employee") nextRole = "AssetManager";
    else if (currentRole === "AssetManager") nextRole = "DeptHead";
    else if (currentRole === "DeptHead") nextRole = "Employee";

    try {
      await api.org.promoteEmployee(employeeId, nextRole);
      setSuccess(`Employee role updated to ${nextRole}.`);
      await loadAllData();
    } catch (err: any) {
      setError(err.message || "Failed to promote employee.");
    }
  };

  const handleToggleStatus = async (employeeId: number) => {
    try {
      await api.org.toggleEmployeeStatus(employeeId);
      setSuccess("Employee account status toggled.");
      await loadAllData();
    } catch (err: any) {
      setError(err.message || "Failed to toggle status.");
    }
  };

  if (loading) {
    return (
      <Sidebar>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
          <div className="w-12 h-12 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
          <span className="text-gray-400 text-sm">Loading setup directory...</span>
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
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Organization Setup</h1>
            <p className="text-gray-400 text-sm mt-1">Manage corporate departments, categories, and employee directory</p>
          </div>
        </div>
        {/* Tab Controls with + Add Trigger */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-wrap gap-2 bg-[#0e1424] p-1.5 rounded-xl border border-white/5 w-fit">
            <button 
              onClick={() => setActiveTab("depts")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "depts" ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/20" : "text-gray-400 hover:text-white"}`}
            >
              <Building size={16} />
              <span>Departments</span>
            </button>
            <button 
              onClick={() => setActiveTab("categories")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "categories" ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/20" : "text-gray-400 hover:text-white"}`}
            >
              <Tags size={16} />
              <span>Categories</span>
            </button>
            <button 
              onClick={() => setActiveTab("employees")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === "employees" ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/20" : "text-gray-400 hover:text-white"}`}
            >
              <Users size={16} />
              <span>Employee</span>
            </button>

            {/* + Add trigger styled as a tab */}
            {(activeTab === "depts" || activeTab === "categories") && (
              <button 
                onClick={() => {
                  if (activeTab === "depts") {
                    setEditDeptId(null);
                    setDeptName("");
                    setDeptHeadId("");
                    setDeptParentId("");
                    setDeptStatus("Active");
                    setShowDeptModal(true);
                  }
                  if (activeTab === "categories") {
                    setCatName("");
                    setCustomFields({});
                    setShowCatModal(true);
                  }
                }}
                className="flex items-center space-x-1 px-4 py-2 text-sm font-bold bg-indigo-600/80 text-white rounded-lg hover:bg-indigo-600 active:scale-[0.98] transition-all border border-indigo-500/30 shadow-md"
              >
                <Plus size={14} />
                <span>+ Add</span>
              </button>
            )}
          </div>
        </div>

        {/* Alert Notifications */}
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
        {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm">{success}</div>}

        {/* --- DEPARTMENTS TAB CONTENT --- */}
        {activeTab === "depts" && (
          <div className="space-y-4">
            <div className="glass rounded-2xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-white/5 text-xs uppercase tracking-wider text-gray-400 font-semibold">
                    <th className="px-6 py-4">Department</th>
                    <th className="px-6 py-4">Head</th>
                    <th className="px-6 py-4">Parent Dept</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {departments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">No departments configured yet.</td>
                  </tr>
                ) : (
                  departments.map((dept) => (
                    <tr key={dept.id} className="hover:bg-white/20 transition-all">
                      <td className="px-6 py-4 font-medium text-white">{dept.name}</td>
                      <td className="px-6 py-4 text-gray-300">{dept.head_name || "—"}</td>
                      <td className="px-6 py-4 text-gray-400">{dept.parent_name || "—"}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${dept.status === "Active" ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"}`}>
                          {dept.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => handleEditDept(dept)}
                          className="p-1 hover:bg-white/10 rounded text-indigo-400 hover:text-white transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500/80 italic mt-4">
            Editing a department here also drives the picklist in Screen 4 & 5
          </p>
        </div>
      )}

        {/* --- CATEGORIES TAB CONTENT --- */}
        {activeTab === "categories" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.length === 0 ? (
              <div className="col-span-full glass p-8 text-center text-gray-500 rounded-2xl">
                No asset categories found. Add categories to start registering assets.
              </div>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="glass p-6 rounded-2xl flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-3">{cat.name}</h3>
                    <div className="space-y-1.5">
                      <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">Custom Attributes</h4>
                      {cat.custom_fields ? (
                        Object.entries(cat.custom_fields).map(([k, v]) => (
                          <div key={k} className="flex justify-between items-center text-xs py-1 border-b border-white/5 last:border-0">
                            <span className="text-gray-400">{k}</span>
                            <span className="text-indigo-300 font-mono">{String(v)}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-500 italic">No custom fields.</p>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-6 pt-3 border-t border-white/5">
                    Category ID: #{cat.id}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* --- EMPLOYEES TAB CONTENT --- */}
        {activeTab === "employees" && (
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 bg-white/5 text-xs uppercase tracking-wider text-gray-400 font-semibold">
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-white/20 transition-all">
                    <td className="px-6 py-4 font-medium text-white">{emp.name}</td>
                    <td className="px-6 py-4 text-gray-300">{emp.email}</td>
                    <td className="px-6 py-4 text-gray-400">
                      {departments.find(d => d.id === emp.department_id)?.name || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        emp.role === "Admin" ? "bg-red-500/20 text-red-400" :
                        emp.role === "AssetManager" ? "bg-emerald-500/20 text-emerald-400" :
                        emp.role === "DeptHead" ? "bg-blue-500/20 text-blue-400" :
                        "bg-slate-500/20 text-slate-400"
                      }`}>
                        {emp.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${emp.status === "Active" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {emp.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {emp.role !== "Admin" && (
                        <>
                          <button
                            onClick={() => handlePromoteRole(emp.id, emp.role)}
                            title="Promote Role"
                            className="text-xs bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600 hover:text-white px-2 py-1 rounded transition-all inline-flex items-center space-x-1"
                          >
                            <ShieldCheck size={12} />
                            <span>Cycle Role</span>
                          </button>
                          <button
                            onClick={() => handleToggleStatus(emp.id)}
                            title={emp.status === "Active" ? "Deactivate User" : "Activate User"}
                            className="text-xs bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10 px-2 py-1 rounded transition-all inline-flex items-center space-x-1"
                          >
                            {emp.status === "Active" ? <ToggleRight size={14} className="text-emerald-400" /> : <ToggleLeft size={14} className="text-gray-500" />}
                            <span>Toggle status</span>
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* --- DEPT DIALOG MODAL --- */}
        {showDeptModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-white">{editDeptId ? "Update Department" : "Add Department"}</h3>
              <form onSubmit={handleSaveDept} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Department Name</label>
                  <input
                    type="text"
                    required
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    placeholder="Engineering"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Assign Manager / Head</label>
                  <select
                    value={deptHeadId}
                    onChange={(e) => setDeptHeadId(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Unassigned</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.email})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Parent Department (Hierarchy)</label>
                  <select
                    value={deptParentId}
                    onChange={(e) => setDeptParentId(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">No Parent Department</option>
                    {departments.filter(d => d.id !== editDeptId).map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Status</label>
                  <select
                    value={deptStatus}
                    onChange={(e) => setDeptStatus(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDeptModal(false)}
                    className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl"
                  >
                    Save
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* --- CATEGORY DIALOG MODAL --- */}
        {showCatModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-white">Create Asset Category</h3>
              <form onSubmit={handleCreateCategory} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Category Name</label>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="Electronics"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="border-t border-white/5 pt-4">
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Define Custom Specifications</label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={customFieldName}
                      onChange={(e) => setCustomFieldName(e.target.value)}
                      placeholder="e.g. warranty_months"
                      className="w-1/2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                    <select
                      value={customFieldType}
                      onChange={(e) => setCustomFieldType(e.target.value)}
                      className="w-1/3 bg-[#161c2c] border border-white/10 rounded-xl px-2 text-xs text-white focus:outline-none"
                    >
                      <option value="string">Text (string)</option>
                      <option value="number">Number (number)</option>
                      <option value="boolean">Boolean (true/false)</option>
                    </select>
                    <button
                      type="button"
                      onClick={addCustomField}
                      className="bg-indigo-600/30 text-indigo-300 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-xl text-xs font-bold border border-indigo-500/20"
                    >
                      Add
                    </button>
                  </div>
                  
                  {/* List added fields */}
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {Object.entries(customFields).map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center text-xs bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                        <span className="text-gray-300">{k} ({v})</span>
                        <button 
                          type="button" 
                          onClick={() => removeCustomField(k)}
                          className="text-red-400 hover:text-red-300 font-bold"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCatModal(false);
                      setCustomFields({});
                    }}
                    className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl"
                  >
                    Save
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
