const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface RequestOptions extends RequestInit {
  json?: any;
}

async function request(path: string, options: RequestOptions = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  if (options.json) {
    headers.set("Content-Type", "application/json");
    options.body = JSON.stringify(options.json);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      // Only redirect if we're not already on login/signup page
      if (!window.location.pathname.includes("/login") && !window.location.pathname.includes("/signup")) {
        window.location.href = "/login";
      }
    }
  }

  if (!response.ok) {
    let errData;
    try {
      errData = await response.json();
    } catch {
      errData = { detail: "An unexpected error occurred" };
    }
    const errorMsg = typeof errData.detail === "object" ? errData.detail.message || JSON.stringify(errData.detail) : errData.detail || "Request failed";
    throw new Error(errorMsg);
  }

  // Handle file downloads
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("text/csv")) {
    return response.blob();
  }

  return response.json();
}

export const api = {
  // --- AUTH ---
  auth: {
    login: async (json: any) => {
      const data = await request("/auth/login", { method: "POST", json });
      if (typeof window !== "undefined") {
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("user", JSON.stringify({
          role: data.role,
          name: data.name,
          email: data.email
        }));
      }
      return data;
    },
    signup: (json: any) => request("/auth/signup", { method: "POST", json }),
    logout: () => {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    },
    me: () => request("/auth/me"),
    getCurrentUser: () => {
      if (typeof window !== "undefined") {
        const u = localStorage.getItem("user");
        return u ? JSON.parse(u) : null;
      }
      return null;
    }
  },

  // --- ORG SETUP ---
  org: {
    listDepartments: () => request("/org/departments"),
    createDepartment: (json: any) => request("/org/departments", { method: "POST", json }),
    updateDepartment: (id: number, json: any) => request(`/org/departments/${id}`, { method: "PUT", json }),
    listCategories: () => request("/org/categories"),
    createCategory: (json: any) => request("/org/categories", { method: "POST", json }),
    listEmployees: () => request("/org/employees"),
    promoteEmployee: (id: number, role: string) => request(`/org/employees/${id}/role`, { method: "PUT", json: { role } }),
    toggleEmployeeStatus: (id: number) => request(`/org/employees/${id}/status`, { method: "PUT" })
  },

  // --- ASSETS ---
  assets: {
    list: (params: Record<string, any> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
      });
      const qs = q.toString();
      return request(`/assets${qs ? `?${qs}` : ""}`);
    },
    create: (json: any) => request("/assets", { method: "POST", json }),
    get: (id: number) => request(`/assets/${id}`),
    upload: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const response = await fetch(`${API_URL}/assets/upload`, {
        method: "POST",
        body: formData,
        headers
      });

      if (!response.ok) {
        throw new Error("File upload failed");
      }
      return response.json();
    }
  },

  // --- ALLOCATIONS ---
  allocations: {
    list: (params: Record<string, any> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) q.append(k, String(v));
      });
      const qs = q.toString();
      return request(`/allocations${qs ? `?${qs}` : ""}`);
    },
    create: (json: any) => request("/allocations", { method: "POST", json }),
    return: (assetId: number, json: any) => request(`/allocations/${assetId}/return`, { method: "POST", json }),
    listTransfers: (params: Record<string, any> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) q.append(k, String(v));
      });
      const qs = q.toString();
      return request(`/allocations/transfers/list${qs ? `?${qs}` : ""}`);
    },
    createTransfer: (json: any) => request("/allocations/transfers", { method: "POST", json }),
    approveTransfer: (id: number) => request(`/allocations/transfers/${id}/approve`, { method: "POST" }),
    rejectTransfer: (id: number) => request(`/allocations/transfers/${id}/reject`, { method: "POST" })
  },

  // --- BOOKINGS ---
  bookings: {
    listResources: () => request("/bookings/resources"),
    list: (resourceId?: number) => request(`/bookings${resourceId ? `?resource_id=${resourceId}` : ""}`),
    create: (json: any) => request("/bookings", { method: "POST", json }),
    cancel: (id: number) => request(`/bookings/${id}/cancel`, { method: "POST" }),
    getSchedule: (resourceId: number, dateStr: string) => request(`/bookings/resources/${resourceId}/schedule?date_str=${dateStr}`)
  },

  // --- MAINTENANCE ---
  maintenance: {
    list: (params: Record<string, any> = {}) => {
      const q = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) q.append(k, String(v));
      });
      const qs = q.toString();
      return request(`/maintenance${qs ? `?${qs}` : ""}`);
    },
    create: (json: any) => request("/maintenance", { method: "POST", json }),
    updateStatus: (id: number, json: any) => request(`/maintenance/${id}/status`, { method: "PUT", json })
  },

  // --- AUDITS ---
  audits: {
    listCycles: () => request("/audits/cycles"),
    createCycle: (json: any) => request("/audits/cycles", { method: "POST", json }),
    getCycle: (id: number) => request(`/audits/cycles/${id}`),
    verifyItem: (itemId: number, json: any) => request(`/audits/items/${itemId}`, { method: "PUT", json }),
    closeCycle: (id: number) => request(`/audits/cycles/${id}/close`, { method: "POST" }),
    getDiscrepancies: (id: number) => request(`/audits/cycles/${id}/discrepancies`),
    exportDiscrepanciesUrl: (id: number) => `${API_URL}/audits/cycles/${id}/discrepancies/export`
  },

  // --- REPORTS & DASHBOARD ---
  reports: {
    getDashboardStats: () => request("/reports/dashboard-stats"),
    getUtilizationByDept: () => request("/reports/utilization-by-dept"),
    getMaintenanceFrequency: () => request("/reports/maintenance-frequency"),
    getMostUsedAssets: () => request("/reports/most-used-assets"),
    getIdleAssets: () => request("/reports/idle-assets"),
    getNearingRetirement: () => request("/reports/nearing-retirement"),
    getBookingHeatmap: () => request("/reports/booking-heatmap"),
    exportSummaryUrl: () => `${API_URL}/reports/export-summary`
  },

  // --- NOTIFICATIONS & LOGS ---
  notifications: {
    list: (unreadOnly = true) => request(`/notifications/notifications?unread_only=${unreadOnly}`),
    markRead: (id: number) => request(`/notifications/notifications/${id}/read`, { method: "PUT" }),
    markAllRead: () => request("/notifications/notifications/read-all", { method: "POST" }),
    listLogs: (limit = 100) => request(`/notifications/activity-logs?limit=${limit}`)
  }
};
