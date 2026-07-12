"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/sidebar";
import { api } from "@/lib/api";
import { 
  Calendar, 
  Clock, 
  Plus, 
  Slash,
  AlertTriangle,
  X,
  FileClock,
  Compass
} from "lucide-react";

export default function BookingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Data lists
  const [resources, setResources] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedResource, setSelectedResource] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  const [schedule, setSchedule] = useState<any[]>([]);

  // Creation State
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookResourceId, setBookResourceId] = useState("");
  const [bookDate, setBookDate] = useState(new Date().toISOString().split("T")[0]);
  const [bookStart, setBookStart] = useState("09:00");
  const [bookEnd, setBookEnd] = useState("10:00");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [conflictError, setConflictError] = useState<any>(null);
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
      const resList = await api.bookings.listResources();
      setResources(resList);
      if (resList.length > 0) {
        setSelectedResource(String(resList[0].id));
      }
      await fetchBookings();
    } catch (err: any) {
      setError(err.message || "Failed to load shared resources.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchBookings() {
    try {
      const list = await api.bookings.list();
      setBookings(list);
    } catch (err: any) {
      setError(err.message || "Failed to fetch bookings.");
    }
  }

  // Load resource daily schedule on resource/date change
  useEffect(() => {
    if (!selectedResource || !selectedDate) return;
    
    async function loadSchedule() {
      try {
        const list = await api.bookings.getSchedule(parseInt(selectedResource), selectedDate);
        setSchedule(list);
      } catch (err: any) {
        console.error("Failed to load timeline schedule", err);
      }
    }
    loadSchedule();
  }, [selectedResource, selectedDate]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setConflictError(null);
    setSuccess("");

    if (!bookResourceId || !bookDate || !bookStart || !bookEnd) {
      setError("Please fill out all fields.");
      return;
    }

    // Parse datetimes in local/UTC timezone
    const start_time = new Date(`${bookDate}T${bookStart}:00Z`).toISOString();
    const end_time = new Date(`${bookDate}T${bookEnd}:00Z`).toISOString();

    if (new Date(start_time) >= new Date(end_time)) {
      setError("Start time must be before end time.");
      return;
    }

    try {
      await api.bookings.create({
        resource_id: parseInt(bookResourceId),
        start_time,
        end_time
      });
      setSuccess("Resource booked successfully!");
      setShowBookModal(false);
      
      // Reload lists
      await fetchBookings();
      // Reload active schedule if matching
      if (bookResourceId === selectedResource && bookDate === selectedDate) {
        const list = await api.bookings.getSchedule(parseInt(selectedResource), selectedDate);
        setSchedule(list);
      }
    } catch (err: any) {
      try {
        const errObj = JSON.parse(err.message);
        if (errObj && errObj.message) {
          setConflictError(errObj);
        } else {
          setError(err.message || "Booking failed.");
        }
      } catch {
        setError(err.message || "Booking failed.");
      }
    }
  };

  const handleCancelBooking = async (id: number) => {
    setError("");
    setSuccess("");
    if (!confirm("Are you sure you want to cancel this booking?")) return;

    try {
      await api.bookings.cancel(id);
      setSuccess("Booking cancelled.");
      await fetchBookings();
      // Refresh current schedule
      if (selectedResource) {
        const list = await api.bookings.getSchedule(parseInt(selectedResource), selectedDate);
        setSchedule(list);
      }
    } catch (err: any) {
      setError(err.message || "Cancellation failed.");
    }
  };

  const getBookingForHour = (hour: number) => {
    return schedule.find(b => {
      const start = new Date(b.start_time).getUTCHours();
      const end = new Date(b.end_time).getUTCHours();
      return start <= hour && end > hour;
    });
  };

  const doesConflictOverlapHour = (hour: number) => {
    if (!conflictError) return false;
    const start = new Date(conflictError.conflict_start).getUTCHours();
    const end = new Date(conflictError.conflict_end).getUTCHours();
    return start <= hour && end > hour;
  };

  const formatHourLabel = (hour: number) => {
    if (hour <= 12) return `${hour}:00`;
    return `${hour - 12}:00`;
  };

  const formatHourString = (dtStr: string) => {
    const d = new Date(dtStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  };

  if (loading) {
    return (
      <Sidebar>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
          <div className="w-12 h-12 border-t-2 border-indigo-500 rounded-full animate-spin"></div>
          <span className="text-gray-400 text-sm">Loading bookable workspaces...</span>
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
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Resource Booking</h1>
            <p className="text-gray-400 text-sm mt-1">Book shared facilities, rooms, and vehicles without overlaps</p>
          </div>
          <button 
            onClick={() => {
              setConflictError(null);
              setError("");
              if (selectedResource) setBookResourceId(selectedResource);
              setShowBookModal(true);
            }}
            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg active:scale-[0.98] transition-all"
          >
            <Plus size={16} />
            <span>Book Resource</span>
          </button>
        </div>

        {/* Alert Notifications */}
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}
        {success && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm">{success}</div>}

        {/* Layout split: Left (Schedule Timeline) vs Right (My Bookings) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Timeline View - 2 cols */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass p-6 rounded-2xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <Compass size={18} className="text-indigo-400" />
                  <span>Timeline Schedule</span>
                </h3>
                
                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                  <select
                    value={selectedResource}
                    onChange={(e) => setSelectedResource(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                  >
                    {resources.map(r => (
                      <option key={r.id} value={r.id} className="bg-[#0e1424]">{r.name}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Schedule listing */}
              <div className="space-y-4">
                <p className="text-xs text-gray-500">
                  Showing hourly calendar grid for {resources.find(r => String(r.id) === selectedResource)?.name} on {new Date(selectedDate).toLocaleDateString()}.
                </p>
                
                <div className="border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
                  {[9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour) => {
                    const booking = getBookingForHour(hour);
                    const isConflict = doesConflictOverlapHour(hour);
                    return (
                      <div key={hour} className="flex min-h-[4rem] text-sm relative">
                        {/* Hour Label */}
                        <div className="w-20 bg-white/5 flex items-center justify-center font-bold text-gray-400 border-r border-white/5">
                          {formatHourLabel(hour)}
                        </div>

                        {/* Booking Slot */}
                        <div className="flex-1 p-2 flex flex-col justify-center relative">
                          {booking && (
                            <div className="bg-indigo-600/30 border border-indigo-500/20 rounded-lg p-2.5 text-xs text-indigo-300 font-medium">
                              Booked - {booking.booked_by_name} - {formatHourString(booking.start_time)} to {formatHourString(booking.end_time)}
                            </div>
                          )}
                          {!booking && isConflict && (
                            <div className="border-2 border-dashed border-red-500 bg-red-500/10 rounded-lg p-2 text-xs text-red-300 font-bold animate-pulse">
                              Requested {formatHourString(conflictError.conflict_start)} to {formatHourString(conflictError.conflict_end)} - conflict - slot is unavailable
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* My Bookings List - 1 col */}
          <div className="space-y-4">
            <div className="glass p-6 rounded-2xl space-y-6">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2 border-b border-white/5 pb-4">
                <FileClock size={18} className="text-indigo-400" />
                <span>My Bookings</span>
              </h3>

              {bookings.filter(b => b.status !== "Cancelled").length === 0 ? (
                <p className="text-center py-10 text-gray-500 text-sm">You have no upcoming resource reservations.</p>
              ) : (
                <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                  {bookings.filter(b => b.status !== "Cancelled").map((b) => (
                    <div 
                      key={b.id} 
                      className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3 hover:border-white/10 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-sm font-bold text-white">{b.resource_name}</h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(b.start_time).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
                          b.status === "Upcoming" ? "bg-indigo-500/20 text-indigo-300" : "bg-emerald-500/20 text-emerald-400"
                        }`}>
                          {b.status}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-xs text-gray-400">
                        <span>🕒 {formatHourString(b.start_time)} – {formatHourString(b.end_time)} (UTC)</span>
                        <button
                          onClick={() => handleCancelBooking(b.id)}
                          className="text-rose-400 hover:text-rose-300 font-bold transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* --- BOOKING DIALOG MODAL --- */}
        {showBookModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="glass w-full max-w-md p-6 rounded-2xl shadow-2xl space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <h3 className="text-lg font-bold text-white">Reserve Shared Resource</h3>
                <button onClick={() => setShowBookModal(false)} className="text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {conflictError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs space-y-2">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle size={16} className="text-red-400 shrink-0" />
                    <strong>Booking Overlap Conflict</strong>
                  </div>
                  <p className="leading-relaxed">{conflictError.message}</p>
                </div>
              )}

              <form onSubmit={handleBookingSubmit} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Select Resource</label>
                  <select
                    required
                    value={bookResourceId}
                    onChange={(e) => setBookResourceId(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                  >
                    <option value="">Select Room/Vehicle</option>
                    {resources.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Date</label>
                  <input
                    type="date"
                    required
                    value={bookDate}
                    onChange={(e) => setBookDate(e.target.value)}
                    className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">Start Time (UTC)</label>
                    <input
                      type="time"
                      required
                      value={bookStart}
                      onChange={(e) => setBookStart(e.target.value)}
                      className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-gray-400 font-semibold mb-2">End Time (UTC)</label>
                    <input
                      type="time"
                      required
                      value={bookEnd}
                      onChange={(e) => setBookEnd(e.target.value)}
                      className="w-full bg-[#161c2c] border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBookModal(false)}
                    className="w-1/2 bg-white/5 hover:bg-white/10 text-gray-300 font-bold py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-xl"
                  >
                    Confirm Booking
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
