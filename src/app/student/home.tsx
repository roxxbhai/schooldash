'use client'

import React, { useState } from 'react'
import StudentSideNav from './sidenav'
import {
  Search,
  Bell,
  ChevronDown,
  Calendar as CalendarIcon,
  Users,
  FileText,
  TrendingUp,
  ChevronRight,
  Award,
  Info,
  FlaskConical,
  MessageSquare,
} from 'lucide-react'

interface StudentDashboardPageProps {
  activeTab?: string
  onSelectTab?: (tab: string) => void
}

export default function StudentDashboardPage({
  activeTab = 'Home',
  onSelectTab,
}: StudentDashboardPageProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [assignments, setAssignments] = useState([
    {
      id: '1',
      subject: 'Mathematics',
      title: 'Worksheet 5 - Chapter 6: Triangles',
      dueDate: '12 Oct 2026',
      completed: false,
    },
    {
      id: '2',
      subject: 'Science',
      title: 'Project Report - Environmental Conservation',
      dueDate: '15 Oct 2026',
      completed: false,
    },
    {
      id: '3',
      subject: 'English',
      title: 'Essay Writing - My Vision for a Better India',
      dueDate: '18 Oct 2026',
      completed: true,
    },
  ])

  const toggleAssignment = (id: string) => {
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, completed: !a.completed } : a))
    )
  }

  const pendingCount = assignments.filter((a) => !a.completed).length

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
              placeholder="Search for assignments, subjects, notices..."
              className="w-full bg-[#f1f4fb] border border-transparent focus:border-blue-400 focus:bg-white text-xs pl-10 pr-4 py-2 rounded-xl outline-none transition-all text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {/* Right Header items: Notifications & Profile */}
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
          {/* Welcome Banner & Current Date */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#11183c] flex items-center gap-2">
                Good morning, Aarav! <span className="text-2xl">👋</span>
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">
                Here&apos;s your school day at a glance.
              </p>
            </div>

            <div className="self-start md:self-auto flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200/80 rounded-xl text-xs font-semibold text-slate-600 shadow-sm">
              <CalendarIcon className="w-4 h-4 text-slate-400" />
              <span>Monday, 12 October 2026</span>
            </div>
          </div>

          {/* 3 Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1: Attendance */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow flex items-start justify-between relative group cursor-pointer">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Attendance</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">92%</div>
                  <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 mt-1">
                    <span>↗</span> +4% this month
                  </div>
                  {/* Progress bar */}
                  <div className="w-36 h-2 bg-slate-100 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-emerald-500 rounded-full w-[92%]"></div>
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>

            {/* Card 2: Pending Assignments */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow flex items-start justify-between relative group cursor-pointer">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Pending Assignments</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">{pendingCount}</div>
                  <div className="text-[11px] text-amber-600 font-semibold flex items-center gap-1.5 mt-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-[10px] font-bold">!</span>
                    {pendingCount} remaining
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>

            {/* Card 3: Latest Result */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-[0_2px_10px_-3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow flex items-start justify-between relative group cursor-pointer">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Latest Result</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">A+</div>
                  <div className="text-[11px] text-slate-500 font-medium mt-1">
                    Term 1 (2026-27)
                  </div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
          </div>

          {/* Middle Row: Today's Timetable + Notices */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Timetable (7 cols) - Room removed */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-blue-600" />
                    <h2 className="text-base font-bold text-slate-900">Today&apos;s Timetable</h2>
                  </div>
                  <button className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 group">
                    View Full Timetable
                    <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#f7f9fd] text-slate-500 font-semibold rounded-lg">
                        <th className="py-2.5 px-3 rounded-l-lg">Time</th>
                        <th className="py-2.5 px-3">Subject</th>
                        <th className="py-2.5 px-3 rounded-r-lg">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 font-medium text-slate-600">8:00 - 8:40</td>
                        <td className="py-3 px-3 font-semibold text-slate-800">Assembly</td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 font-semibold text-[11px] rounded-md">
                            Completed
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 font-medium text-slate-600">8:50 - 9:30</td>
                        <td className="py-3 px-3 font-semibold text-slate-800">Mathematics</td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 font-semibold text-[11px] rounded-md">
                            Completed
                          </span>
                        </td>
                      </tr>
                      <tr className="bg-blue-50/70 border-l-4 border-l-blue-600 rounded-lg">
                        <td className="py-3 px-3 font-semibold text-blue-700 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                          9:40 - 10:20
                        </td>
                        <td className="py-3 px-3 font-bold text-blue-900">Science</td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-1 bg-blue-100/90 text-blue-700 font-semibold text-[11px] rounded-md">
                            In Progress
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 font-medium text-slate-600">10:40 - 11:20</td>
                        <td className="py-3 px-3 font-semibold text-slate-800">English</td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-medium text-[11px] rounded-md">
                            Upcoming
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 font-medium text-slate-600">11:30 - 12:10</td>
                        <td className="py-3 px-3 font-semibold text-slate-800">Social Science</td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-medium text-[11px] rounded-md">
                            Upcoming
                          </span>
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 font-medium text-slate-600">12:20 - 1:00</td>
                        <td className="py-3 px-3 font-semibold text-slate-800">Computer</td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 font-medium text-[11px] rounded-md">
                            Upcoming
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Notices (5 cols) */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-600" />
                    <h2 className="text-base font-bold text-slate-900">Notices</h2>
                  </div>
                  <button className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 group">
                    View All
                    <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Notice 1 */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0">
                      <Award className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900">Annual Sports Day</h3>
                        <span className="text-[10px] text-slate-400 font-medium">10 Oct 2026</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Sports Day will be held on 25th November 2026. Participation is compulsory for all students.
                      </p>
                    </div>
                  </div>

                  {/* Notice 2 */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                      <Info className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900">Holiday Notice</h3>
                        <span className="text-[10px] text-slate-400 font-medium">08 Oct 2026</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        School will remain closed on 2nd October 2026 (Gandhi Jayanti).
                      </p>
                    </div>
                  </div>

                  {/* Notice 3 */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                      <FlaskConical className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900">Science Exhibition</h3>
                        <span className="text-[10px] text-slate-400 font-medium">05 Oct 2026</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        Registrations open for Science Exhibition 2026. Last date to register: 15th October 2026.
                      </p>
                    </div>
                  </div>

                  {/* Notice 4 */}
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-500 flex items-center justify-center shrink-0">
                      <MessageSquare className="w-5 h-5 stroke-[2]" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900">Parent Teacher Meeting</h3>
                        <span className="text-[10px] text-slate-400 font-medium">02 Oct 2026</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        PTM will be held on 10th December 2026. Timings and details will be shared soon.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: Assignments with Checkbox Completion */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Assignments</h2>
              </div>
              <span className="text-xs text-slate-400">Click checkbox to mark Completed / Seen</span>
            </div>

            <div className="divide-y divide-slate-100">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  onClick={() => toggleAssignment(assignment.id)}
                  className={`py-3.5 px-3 flex items-center justify-between gap-4 rounded-xl cursor-pointer transition-colors ${
                    assignment.completed ? 'bg-slate-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={assignment.completed}
                      onChange={() => toggleAssignment(assignment.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                    />
                    <div className="truncate">
                      <div
                        className={`text-xs font-semibold ${
                          assignment.completed
                            ? 'line-through text-slate-400'
                            : 'text-slate-800'
                        }`}
                      >
                        <span className="text-blue-600 font-bold mr-2">[{assignment.subject}]</span>
                        {assignment.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Due Date: {assignment.dueDate}
                      </div>
                    </div>
                  </div>

                  <div>
                    {assignment.completed ? (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 font-semibold text-[11px] rounded-md inline-flex items-center gap-1">
                        Completed
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-600 font-semibold text-[11px] rounded-md inline-flex items-center gap-1">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
