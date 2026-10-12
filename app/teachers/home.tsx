'use client'

import React, { useState } from 'react'
import TeacherSideNav from './sidenav'
import {
  Search,
  Bell,
  Clock,
  MapPin,
  Users,
} from 'lucide-react'

interface TeacherHomePageProps {
  activeTab?: string
  onSelectTab?: (tab: string) => void
}

export default function TeacherHomePage({
  activeTab = 'Home',
  onSelectTab,
}: TeacherHomePageProps) {
  const [globalSearch, setGlobalSearch] = useState('')

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const periods = [
    { label: 'Period 1', time: '8:00 – 8:40' },
    { label: 'Period 2', time: '8:40 – 9:20' },
    { label: 'Period 3', time: '9:20 – 10:00' },
    { label: 'Break', time: '10:00 – 10:20' },
    { label: 'Period 4', time: '10:20 – 11:00' },
    { label: 'Period 5', time: '11:00 – 11:40' },
    { label: 'Period 6', time: '11:40 – 12:20' },
    { label: 'Lunch', time: '12:20 – 1:00' },
    { label: 'Period 7', time: '1:00 – 1:40' },
    { label: 'Period 8', time: '1:40 – 2:20' },
  ]

  type TimetableEntry = {
    subject: string
    class: string
    room: string
    color: string
  } | null

  const timetable: Record<string, Record<string, TimetableEntry>> = {
    Monday: {
      'Period 1': { subject: 'Mathematics', class: '10-A', room: 'Room 201', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 2': { subject: 'Mathematics', class: '10-B', room: 'Room 203', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 3': { subject: 'Mathematics', class: '9-A', room: 'Room 105', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 4': { subject: 'Mathematics', class: '9-B', room: 'Room 107', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 5': null,
      'Period 6': { subject: 'Mathematics', class: '8-A', room: 'Room 302', color: 'bg-violet-50 border-violet-200 text-violet-700' },
      'Period 7': null,
      'Period 8': { subject: 'Mathematics', class: '10-A', room: 'Room 201', color: 'bg-blue-50 border-blue-200 text-blue-700' },
    },
    Tuesday: {
      'Period 1': { subject: 'Mathematics', class: '9-A', room: 'Room 105', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 2': null,
      'Period 3': { subject: 'Mathematics', class: '10-A', room: 'Room 201', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 4': { subject: 'Mathematics', class: '10-B', room: 'Room 203', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 5': { subject: 'Mathematics', class: '8-B', room: 'Room 304', color: 'bg-violet-50 border-violet-200 text-violet-700' },
      'Period 6': null,
      'Period 7': { subject: 'Mathematics', class: '9-B', room: 'Room 107', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 8': { subject: 'Mathematics', class: '8-A', room: 'Room 302', color: 'bg-violet-50 border-violet-200 text-violet-700' },
    },
    Wednesday: {
      'Period 1': null,
      'Period 2': { subject: 'Mathematics', class: '10-B', room: 'Room 203', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 3': { subject: 'Mathematics', class: '9-B', room: 'Room 107', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 4': { subject: 'Mathematics', class: '10-A', room: 'Room 201', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 5': { subject: 'Mathematics', class: '9-A', room: 'Room 105', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 6': { subject: 'Mathematics', class: '8-B', room: 'Room 304', color: 'bg-violet-50 border-violet-200 text-violet-700' },
      'Period 7': { subject: 'Mathematics', class: '8-A', room: 'Room 302', color: 'bg-violet-50 border-violet-200 text-violet-700' },
      'Period 8': null,
    },
    Thursday: {
      'Period 1': { subject: 'Mathematics', class: '8-A', room: 'Room 302', color: 'bg-violet-50 border-violet-200 text-violet-700' },
      'Period 2': { subject: 'Mathematics', class: '10-A', room: 'Room 201', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 3': null,
      'Period 4': { subject: 'Mathematics', class: '9-A', room: 'Room 105', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 5': { subject: 'Mathematics', class: '10-B', room: 'Room 203', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 6': { subject: 'Mathematics', class: '9-B', room: 'Room 107', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 7': { subject: 'Mathematics', class: '8-B', room: 'Room 304', color: 'bg-violet-50 border-violet-200 text-violet-700' },
      'Period 8': null,
    },
    Friday: {
      'Period 1': { subject: 'Mathematics', class: '10-B', room: 'Room 203', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 2': { subject: 'Mathematics', class: '9-B', room: 'Room 107', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 3': { subject: 'Mathematics', class: '8-B', room: 'Room 304', color: 'bg-violet-50 border-violet-200 text-violet-700' },
      'Period 4': null,
      'Period 5': { subject: 'Mathematics', class: '10-A', room: 'Room 201', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 6': { subject: 'Mathematics', class: '9-A', room: 'Room 105', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 7': null,
      'Period 8': { subject: 'Mathematics', class: '8-A', room: 'Room 302', color: 'bg-violet-50 border-violet-200 text-violet-700' },
    },
    Saturday: {
      'Period 1': { subject: 'Mathematics', class: '9-A', room: 'Room 105', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
      'Period 2': { subject: 'Mathematics', class: '10-A', room: 'Room 201', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 3': { subject: 'Mathematics', class: '10-B', room: 'Room 203', color: 'bg-blue-50 border-blue-200 text-blue-700' },
      'Period 4': null,
      'Period 5': null,
      'Period 6': null,
      'Period 7': null,
      'Period 8': null,
    },
  }

  // Get today's day name
  const todayIndex = new Date().getDay()
  const todayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][todayIndex]

  // Today's classes
  const todaySchedule = timetable[todayName] || timetable['Monday']
  const todayClasses = periods
    .filter((p) => p.label !== 'Break' && p.label !== 'Lunch' && todaySchedule[p.label])
    .map((p) => ({ ...p, entry: todaySchedule[p.label]! }))

  // Stats
  const totalClassesToday = todayClasses.length
  const totalClassesWeek = days.reduce((acc, day) => {
    const daySchedule = timetable[day]
    return acc + periods.filter((p) => p.label !== 'Break' && p.label !== 'Lunch' && daySchedule[p.label]).length
  }, 0)
  const freePeriodsToday = periods.filter((p) => p.label !== 'Break' && p.label !== 'Lunch' && !todaySchedule[p.label]).length

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f7fe] text-slate-800 font-sans">
      <TeacherSideNav
        activeItem={activeTab}
        onSelect={(item) => onSelectTab && onSelectTab(item)}
      />

      <main className="flex-1 flex flex-col h-full overflow-y-auto">
        {/* Top Navbar */}
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-slate-500">Teacher Portal</span>
            <span className="text-slate-400">/</span>
            <span className="text-blue-600 font-semibold">Home</span>
          </div>

          <div className="flex-1 max-w-md mx-4 relative hidden sm:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search classes, subjects..."
              className="w-full bg-[#f1f4fb] border border-transparent focus:border-blue-400 focus:bg-white text-xs pl-10 pr-4 py-2 rounded-xl outline-none transition-all text-slate-700 placeholder:text-slate-400"
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              className="relative p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
            >
              <Bell className="w-5 h-5 stroke-[1.8]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white"></span>
            </button>

            <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
              <img
                src="https://images.unsplash.com/photo-1568602471122-7832951cc4c5?auto=format&fit=crop&q=80&w=200"
                alt="Rajesh Kumar"
                className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/20"
              />
              <div className="hidden md:block text-left">
                <div className="text-xs font-bold text-slate-800 leading-tight">Rajesh Kumar</div>
                <div className="text-[11px] text-slate-500 font-medium">Mathematics</div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Body */}
        <div className="p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Header */}
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#11183c]">
              Welcome, Rajesh Kumar 👋
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">
              Here&apos;s your schedule for the week. Today is {todayName}.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-slate-800">{totalClassesToday}</div>
                <div className="text-[11px] text-slate-500 font-medium">Classes Today</div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-slate-800">{totalClassesWeek}</div>
                <div className="text-[11px] text-slate-500 font-medium">Classes This Week</div>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-extrabold text-slate-800">{freePeriodsToday}</div>
                <div className="text-[11px] text-slate-500 font-medium">Free Periods Today</div>
              </div>
            </div>
          </div>

          {/* Today's Schedule Summary */}
          {todayClasses.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Today&apos;s Schedule — {todayName}</h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {todayClasses.map((cls) => (
                  <div
                    key={cls.label}
                    className={`rounded-xl border p-3.5 ${cls.entry.color} transition-all hover:shadow-md`}
                  >
                    <div className="text-[11px] font-bold opacity-70">{cls.label}</div>
                    <div className="text-xs font-extrabold mt-1">{cls.entry.subject}</div>
                    <div className="text-[11px] font-semibold mt-0.5 opacity-80">Class {cls.entry.class}</div>
                    <div className="flex items-center gap-1 mt-1.5 text-[10px] font-medium opacity-60">
                      <MapPin className="w-3 h-3" />
                      <span>{cls.entry.room}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] font-medium opacity-60">
                      <Clock className="w-3 h-3" />
                      <span>{cls.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Weekly Timetable */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-5">
              <Users className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">Weekly Timetable</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="py-2.5 px-3 text-left text-slate-500 font-semibold bg-[#f7f9fd] rounded-tl-lg sticky left-0 z-10 min-w-[100px]">
                      Day
                    </th>
                    {periods.map((p) => (
                      <th
                        key={p.label}
                        className={`py-2.5 px-2 text-center font-semibold min-w-[110px] ${
                          p.label === 'Break' || p.label === 'Lunch'
                            ? 'bg-slate-100 text-slate-400'
                            : 'bg-[#f7f9fd] text-slate-500'
                        }`}
                      >
                        <div>{p.label}</div>
                        <div className="text-[10px] font-medium text-slate-400 mt-0.5">{p.time}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {days.map((day) => {
                    const isToday = day === todayName
                    return (
                      <tr key={day} className={isToday ? 'bg-blue-50/30' : ''}>
                        <td className={`py-3 px-3 font-bold sticky left-0 z-10 ${isToday ? 'text-blue-600 bg-blue-50/50' : 'text-slate-700 bg-white'}`}>
                          <div className="flex items-center gap-2">
                            {isToday && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
                            {day}
                          </div>
                          {isToday && <span className="text-[10px] font-semibold text-blue-400">Today</span>}
                        </td>
                        {periods.map((p) => {
                          if (p.label === 'Break' || p.label === 'Lunch') {
                            return (
                              <td key={p.label} className="py-3 px-2 text-center bg-slate-50/80">
                                <span className="text-[10px] text-slate-400 font-semibold italic">{p.label}</span>
                              </td>
                            )
                          }
                          const entry = timetable[day]?.[p.label]
                          return (
                            <td key={p.label} className="py-2 px-1.5">
                              {entry ? (
                                <div className={`rounded-lg border p-2 text-center ${entry.color} transition-all hover:shadow-sm`}>
                                  <div className="font-bold text-[11px] leading-tight">{entry.subject}</div>
                                  <div className="text-[10px] font-semibold mt-0.5 opacity-80">{entry.class}</div>
                                  <div className="text-[9px] font-medium mt-0.5 opacity-60">{entry.room}</div>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-dashed border-slate-200 p-2 text-center">
                                  <span className="text-[10px] text-slate-300 font-medium">Free</span>
                                </div>
                              )}
                            </td>
                          )
                        })}
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
