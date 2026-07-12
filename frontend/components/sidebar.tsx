"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { 
  LayoutDashboard, 
  Settings, 
  Package, 
  UserCheck, 
  CalendarRange, 
  Wrench, 
  ClipboardCheck, 
  BarChart3, 
  Bell, 
  LogOut, 
  Menu, 
  X,
  User
} from "lucide-react";

interface SidebarProps {
  children?: React.ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
  const pathname = usePathname();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    const user = api.auth.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  const handleLogout = () => {
    api.auth.logout();
  };

  const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["Admin", "AssetManager", "DeptHead", "Employee"] },
    { name: "Organization Setup", href: "/organization", icon: Settings, roles: ["Admin"] },
    { name: "Assets", href: "/assets", icon: Package, roles: ["Admin", "AssetManager", "DeptHead", "Employee"] },
    { name: "Allocation & Transfer", href: "/allocation", icon: UserCheck, roles: ["Admin", "AssetManager", "DeptHead", "Employee"] },
    { name: "Resource Booking", href: "/booking", icon: CalendarRange, roles: ["Admin", "AssetManager", "DeptHead", "Employee"] },
    { name: "Maintenance", href: "/maintenance", icon: Wrench, roles: ["Admin", "AssetManager", "DeptHead", "Employee"] },
    { name: "Audit", href: "/audit", icon: ClipboardCheck, roles: ["Admin", "AssetManager", "DeptHead", "Employee"] },
    { name: "Reports & Analytics", href: "/reports", icon: BarChart3, roles: ["Admin", "AssetManager"] },
    { name: "Notifications & Logs", href: "/notifications", icon: Bell, roles: ["Admin", "AssetManager", "DeptHead", "Employee"] },
  ];

  const filteredItems = navItems.filter(item => 
    currentUser ? item.roles.includes(currentUser.role) : false
  );

  const getRoleColor = (role: string) => {
    switch (role) {
      case "Admin": return "bg-red-500/20 text-red-400 border border-red-500/30";
      case "AssetManager": return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
      case "DeptHead": return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
      default: return "bg-slate-500/20 text-slate-400 border border-slate-500/30";
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#090d16]">
      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[#0e1424] border-b border-white/5 z-20">
        <div className="flex items-center space-x-2">
          <span className="text-xl font-bold tracking-tight text-white">Asset<span className="text-indigo-400">Flow</span></span>
        </div>
        <button 
          onClick={() => setIsMobileOpen(!isMobileOpen)} 
          className="text-gray-400 hover:text-white focus:outline-none"
        >
          {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Panel */}
      <aside className={`
        fixed inset-y-0 left-0 transform md:relative md:translate-x-0 w-64 glass border-r border-white/5 p-4 flex flex-col justify-between z-30 transition-transform duration-300 ease-in-out
        ${isMobileOpen ? "translate-x-0 bg-[#0c1222]/95" : "-translate-x-full md:flex"}
      `}>
        <div>
          {/* Logo */}
          <div className="hidden md:flex items-center space-x-2 mb-8 px-2">
            <span className="text-2xl font-bold tracking-tight text-white">Asset<span className="text-indigo-400">Flow</span></span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={`
                    flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                    ${isActive 
                      ? "bg-indigo-600/30 text-indigo-300 border-l-2 border-indigo-500" 
                      : "text-gray-400 hover:text-white hover:bg-white/5"}
                  `}
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile section */}
        <div className="mt-8 border-t border-white/5 pt-4">
          {currentUser && (
            <div className="mb-4 px-2">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-indigo-900/40 border border-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold">
                  {currentUser.name.charAt(0)}
                </div>
                <div>
                  <h4 className="text-sm font-medium text-white truncate max-w-[130px]">{currentUser.name}</h4>
                  <p className="text-xs text-gray-500 truncate max-w-[130px]">{currentUser.email}</p>
                </div>
              </div>
              <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${getRoleColor(currentUser.role)}`}>
                {currentUser.role}
              </span>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-all duration-200"
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-h-screen">
        {children}
      </main>
    </div>
  );
}
