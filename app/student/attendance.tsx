'use client'

import React, { useState } from 'react'
import StudentSideNav from './sidenav'
import {
  Search,
  Bell,
  ChevronDown,
  Calendar as CalendarIcon,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface StudentAttendancePageProps {
  activeTab?: string
  onSelectTab?: (tab: string) => void
}

export default function StudentAttendancePage({
  activeTab = 'Attendance',
  onSelectTab,
}: StudentAttendancePageProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Calendar dates representation for October 2026
  // Status: 'present' | 'absent' | 'leave' | 'today' | 'neutral'
  const calendarDays = [
    { day: 27, currentMonth: false, status: 'neutral' },
    { day: 28, currentMonth: false, status: 'neutral' },
    { day: 29, currentMonth: false, status: 'neutral' },
    { day: 30, currentMonth: false, status: 'neutral' },
    { day: 1, currentMonth: true, status: 'present' },
    { day: 2, currentMonth: true, status: 'present' },
    { day: 3, currentMonth: true, status: 'neutral' },
    { day: 4, currentMonth: true, status: 'neutral' },
    { day: 5, currentMonth: true, status: 'present' },
    { day: 6, currentMonth: true, status: 'present' },
    { day: 7, currentMonth: true, status: 'present' },
    { day: 8, currentMonth: true, status: 'absent' },
    { day: 9, currentMonth: true, status: 'present' },
    { day: 10, currentMonth: true, status: 'leave' },
    { day: 11, currentMonth: true, status: 'neutral' },
    { day: 12, currentMonth: true, status: 'today' },
    { day: 13, currentMonth: true, status: 'present' },
    { day: 14, currentMonth: true, status: 'present' },
    { day: 15, currentMonth: true, status: 'present' },
    { day: 16, currentMonth: true, status: 'present' },
    { day: 17, currentMonth: true, status: 'neutral' },
    { day: 18, currentMonth: true, status: 'neutral' },
    { day: 19, currentMonth: true, status: 'present' },
    { day: 20, currentMonth: true, status: 'present' },
    { day: 21, currentMonth: true, status: 'present' },
    { day: 22, currentMonth: true, status: 'present' },
    { day: 23, currentMonth: true, status: 'neutral' },
    { day: 24, currentMonth: true, status: 'neutral' },
    { day: 25, currentMonth: true, status: 'neutral' },
    { day: 26, currentMonth: true, status: 'neutral' },
    { day: 27, currentMonth: true, status: 'neutral' },
    { day: 28, currentMonth: true, status: 'neutral' },
    { day: 29, currentMonth: true, status: 'neutral' },
    { day: 30, currentMonth: true, status: 'neutral' },
    { day: 31, currentMonth: true, status: 'neutral' },
  ]

  const records = [
    { date: '12 Oct 2026', day: 'Mon', status: 'Present', remarks: 'On Time' },
    { date: '10 Oct 2026', day: 'Sat', status: 'Leave', remarks: 'Medical Leave' },
    { date: '09 Oct 2026', day: 'Fri', status: 'Present', remarks: 'On Time' },
    { date: '08 Oct 2026', day: 'Thu', status: 'Absent', remarks: 'Uninformed' },
    { date: '07 Oct 2026', day: 'Wed', status: 'Present', remarks: 'On Time' },
    { date: '06 Oct 2026', day: 'Tue', status: 'Present', remarks: 'On Time' },
    { date: '05 Oct 2026', day: 'Mon', status: 'Present', remarks: 'On Time' },
    { date: '02 Oct 2026', day: 'Fri', status: 'Present', remarks: 'Gandhi Jayanti Event' },
    { date: '01 Oct 2026', day: 'Thu', status: 'Present', remarks: 'On Time' },
  ]

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7fe] text-slate-800 font-sans">
      {/* Sidebar Component */}
      <StudentSideNav
        activeItem={activeTab}
        onSelect={(item) => onSelectTab && onSelectTab(item)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto">
        {/* Top Navbar */}
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-8 py-3.5 flex items-center justify-between gap-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-slate-500">Student Portal</span>
            <span className="text-slate-400">/</span>
            <span className="text-blue-600 font-semibold">{activeTab}</span>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-md mx-4 relative hidden sm:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for attendance, dates, records..."
              className="w-full bg-[#f1f4fb] border border-transparent focus:border-blue-400 focus:bg-white text-xs pl-10 pr-4 py-2 rounded-xl outline-none transition-all text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {/* Right Header items */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="relative p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <Bell className="w-5 h-5 stroke-[1.8]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
            </button>

            {/* Profile pill */}
            <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
              <img
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200"
                alt="Aarav Sharma"
                className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/20"
              />
              <div className="hidden md:block text-left">
                <div className="text-xs font-bold text-slate-800 leading-tight">Aarav Sharma</div>
                <div className="text-[11px] text-slate-500 font-medium">Class 10 - A</div>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Body */}
        <div className="p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Header row with Term selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#11183c]">
                Attendance
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">
                Track your attendance record and daily status.
              </p>
            </div>

            <div className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm">
              <CalendarIcon className="w-4 h-4 text-slate-400" />
              <span>Term 1 (2026 - 27)</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          {/* 4 Attendance Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* 1. Overall Attendance */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Overall Attendance</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">92%</div>
                  <div className="text-[11px] text-emerald-600 font-semibold mt-1">
                    ↗ +4% this month
                  </div>
                  <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-emerald-500 rounded-full w-[92%]"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Present Days */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Present Days</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">138</div>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    out of 150 days
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Absent Days */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                  <XCircle className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Absent Days</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">8</div>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    out of 150 days
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Leaves */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Leaves</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">4</div>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    Approved
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Calendar (Row-wise Clean Layout) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Attendance Calendar</h2>
              </div>

              {/* Month Navigator */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-slate-800">October 2026</span>
                <button
                  type="button"
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="max-w-2xl mx-auto">
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-500 mb-3">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              {/* Date Cells */}
              <div className="grid grid-cols-7 gap-2 text-center text-xs">
                {calendarDays.map((item, idx) => {
                  let badgeClass = 'text-slate-700 hover:bg-slate-50'

                  if (!item.currentMonth) {
                    badgeClass = 'text-slate-300'
                  } else if (item.status === 'present') {
                    badgeClass = 'bg-emerald-100 text-emerald-800 font-bold'
                  } else if (item.status === 'absent') {
                    badgeClass = 'bg-red-100 text-red-700 font-bold'
                  } else if (item.status === 'leave') {
                    badgeClass = 'bg-amber-100 text-amber-700 font-bold'
                  } else if (item.status === 'today') {
                    badgeClass = 'ring-2 ring-blue-600 text-blue-600 font-bold bg-blue-50/50'
                  }

                  return (
                    <div
                      key={idx}
                      className={`h-10 flex items-center justify-center rounded-xl transition-all cursor-pointer ${badgeClass}`}
                    >
                      {item.day}
                    </div>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-6 mt-6 pt-4 border-t border-slate-100 text-xs font-medium text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span>Present</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span>Absent</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span>Leave</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full border-2 border-blue-600"></span>
                  <span>Today</span>
                </div>
              </div>
            </div>
          </div>

          {/* Row-wise Table: Columns: Date, Day, Status, Remarks */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Attendance Records</h2>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#f7f9fd] text-slate-500 font-semibold rounded-lg">
                    <th className="py-2.5 px-4 rounded-l-lg">Date</th>
                    <th className="py-2.5 px-4">Day</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 rounded-r-lg">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((rec, index) => {
                    let badge = (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 font-semibold text-[11px] rounded-md">
                        Present
                      </span>
                    )
                    if (rec.status === 'Absent') {
                      badge = (
                        <span className="px-2.5 py-1 bg-red-50 text-red-600 font-semibold text-[11px] rounded-md">
                          Absent
                        </span>
                      )
                    } else if (rec.status === 'Leave') {
                      badge = (
                        <span className="px-2.5 py-1 bg-amber-50 text-amber-600 font-semibold text-[11px] rounded-md">
                          Leave
                        </span>
                      )
                    }

                    return (
                      <tr key={index} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-slate-800">{rec.date}</td>
                        <td className="py-3.5 px-4 text-slate-500 font-medium">{rec.day}</td>
                        <td className="py-3.5 px-4">{badge}</td>
                        <td className="py-3.5 px-4 text-slate-500">{rec.remarks}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
