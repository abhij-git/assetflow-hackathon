"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootIndex() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-10 h-10 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
        <span className="text-gray-400 text-sm">Synchronizing ERP nodes...</span>
      </div>
    </div>
  );
}
