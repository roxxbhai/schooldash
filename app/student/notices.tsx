'use client'

import React, { useState } from 'react'
import StudentSideNav from './sidenav'
import {
  Search,
  Bell,
  ChevronDown,
  FileText,
  Megaphone,
  BookOpen,
  Calendar,
  Sun,
  FileCheck,
  Award,
  Info,
  FlaskConical,
  MessageSquare,
  CreditCard,
  File,
  MoreVertical,
  Laptop,
  Calculator,
  PenTool,
} from 'lucide-react'

interface StudentNoticesPageProps {
  activeTab?: string
  onSelectTab?: (tab: string) => void
}

export default function StudentNoticesPage({
  activeTab = 'Notices',
  onSelectTab,
}: StudentNoticesPageProps) {
  const [activeHeaderTab, setActiveHeaderTab] = useState<'Notices' | 'Assignments'>('Notices')
  const [globalSearch, setGlobalSearch] = useState('')
  const [noticeSearch, setNoticeSearch] = useState('')
  const [noticeCategory, setNoticeCategory] = useState('All Notices')

  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState('All Assignments')

  const noticesList = [
    {
      id: 1,
      title: 'Annual Sports Day',
      description: 'Sports Day will be held on 25th November 2026. Participation is compulsory for all students.',
      category: 'Events',
      categoryTag: 'Events',
      categoryBadge: 'bg-rose-50 text-rose-600',
      date: '10 Oct 2026',
      attachment: 'Sports_Day_Guidelines.pdf',
      size: '1.2 MB',
      icon: Award,
      iconColor: 'bg-rose-50 text-rose-500',
    },
    {
      id: 2,
      title: 'Holiday Notice',
      description: 'School will remain closed on 2nd October 2026 (Gandhi Jayanti).',
      category: 'Holidays',
      categoryTag: 'Holidays',
      categoryBadge: 'bg-blue-50 text-blue-600',
      date: '08 Oct 2026',
      attachment: null,
      size: null,
      icon: Info,
      iconColor: 'bg-blue-50 text-blue-500',
    },
    {
      id: 3,
      title: 'Science Exhibition',
      description: 'Registrations open for Science Exhibition 2026. Last date to register: 15th October 2026.',
      category: 'Academic',
      categoryTag: 'Academic',
      categoryBadge: 'bg-emerald-50 text-emerald-600',
      date: '05 Oct 2026',
      attachment: 'Registration_Form.pdf',
      size: '450 KB',
      icon: FlaskConical,
      iconColor: 'bg-emerald-50 text-emerald-500',
    },
    {
      id: 4,
      title: 'Parent Teacher Meeting',
      description: 'PTM will be held on 10th December 2026. Timings and details will be shared soon.',
      category: 'General',
      categoryTag: 'General',
      categoryBadge: 'bg-purple-50 text-purple-600',
      date: '02 Oct 2026',
      attachment: null,
      size: null,
      icon: MessageSquare,
      iconColor: 'bg-purple-50 text-purple-500',
    },
    {
      id: 5,
      title: 'School Fee Reminder',
      description: 'Term 2 fee payment is due by 15th October 2026.',
      category: 'General',
      categoryTag: 'General',
      categoryBadge: 'bg-purple-50 text-purple-600',
      date: '01 Oct 2026',
      attachment: 'Fee_Circular.pdf',
      size: '320 KB',
      icon: CreditCard,
      iconColor: 'bg-amber-50 text-amber-500',
    },
  ]

  const assignmentsList = [
    {
      id: 1,
      subject: 'Mathematics',
      subjectIcon: Calculator,
      title: 'Worksheet 5 – Chapter 6: Triangles',
      dueDate: '12 Oct 2026',
      status: 'Pending',
      statusBadge: 'bg-rose-50 text-rose-600',
    },
    {
      id: 2,
      subject: 'Science',
      subjectIcon: FlaskConical,
      title: 'Project Report – Environmental Conservation',
      dueDate: '15 Oct 2026',
      status: 'Pending',
      statusBadge: 'bg-rose-50 text-rose-600',
    },
    {
      id: 3,
      subject: 'English',
      subjectIcon: BookOpen,
      title: 'Essay Writing – My Vision for a Better India',
      dueDate: '18 Oct 2026',
      status: 'Submitted',
      statusBadge: 'bg-emerald-50 text-emerald-600',
    },
    {
      id: 4,
      subject: 'Social Science',
      subjectIcon: PenTool,
      title: 'Map Work – Political Map of India',
      dueDate: '20 Oct 2026',
      status: 'Not Started',
      statusBadge: 'bg-slate-100 text-slate-600',
    },
    {
      id: 5,
      subject: 'Computer',
      subjectIcon: Laptop,
      title: 'Practical File – HTML Basics',
      dueDate: '25 Oct 2026',
      status: 'Pending',
      statusBadge: 'bg-rose-50 text-rose-600',
    },
  ]

  const filteredNotices = noticesList.filter((n) => {
    const matchesCat = noticeCategory === 'All Notices' || n.category === noticeCategory
    const matchesQuery = n.title.toLowerCase().includes(noticeSearch.toLowerCase())
    return matchesCat && matchesQuery
  })

  const filteredAssignments = assignmentsList.filter((a) => {
    const matchesFilter =
      assignmentFilter === 'All Assignments' ||
      (assignmentFilter === 'Pending' && a.status === 'Pending') ||
      (assignmentFilter === 'Submitted' && a.status === 'Submitted') ||
      (assignmentFilter === 'Overdue' && a.status === 'Overdue')
    const matchesQuery = a.title.toLowerCase().includes(assignmentSearch.toLowerCase())
    return matchesFilter && matchesQuery
  })

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
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-slate-500">Student Portal</span>
            <span className="text-slate-400">/</span>
            <span className="text-blue-600 font-semibold">Notices & Assignments</span>
          </div>

          <div className="flex-1 max-w-md mx-4 relative hidden sm:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Search for assignments, subjects, notices..."
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
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200"
                alt="Aarav Sharma"
                className="w-9 h-9 rounded-full object-cover ring-2 ring-blue-500/20"
              />
              <div className="hidden md:block text-left">
                <div className="text-xs font-bold text-slate-800 leading-tight">Aarav Sharma</div>
                <div className="text-[11px] text-slate-500 font-medium">Class 10 - A</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 hidden md:block" />
            </div>
          </div>
        </header>

        {/* Notices & Assignments Body */}
        <div className="p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Header Title & Subtitle */}
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#11183c]">
              Notices & Assignments
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">
              Stay updated with important announcements and manage your assignments.
            </p>
          </div>

          {/* Sub Header Tabs (Notices | Assignments) */}
          <div className="flex items-center gap-4 border-b border-slate-200">
            <button
              type="button"
              onClick={() => setActiveHeaderTab('Notices')}
              className={`flex items-center gap-2 pb-3 text-xs font-bold border-b-2 transition-all ${
                activeHeaderTab === 'Notices'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Notices</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveHeaderTab('Assignments')}
              className={`flex items-center gap-2 pb-3 text-xs font-bold border-b-2 transition-all ${
                activeHeaderTab === 'Assignments'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Assignments</span>
            </button>
          </div>

          {/* CARD 1: NOTICES SECTION */}
          {activeHeaderTab === 'Notices' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
              {/* Notices Header & Filter controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-blue-600" />
                    <h2 className="text-base font-bold text-slate-900">Notices</h2>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    Important announcements, circulars and updates from the school.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                {/* Search in notices */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={noticeSearch}
                    onChange={(e) => setNoticeSearch(e.target.value)}
                    placeholder="Search notices..."
                    className="bg-[#f8faff] border border-slate-200 text-xs pl-8 pr-3 py-1.5 rounded-xl outline-none focus:border-blue-400 text-slate-700 w-44"
                  />
                </div>

                {/* Categories selector */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f8faff] border border-slate-200 rounded-xl text-xs font-medium text-slate-700">
                  <span>All Categories</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f8faff] border border-slate-200 rounded-xl text-xs font-medium text-slate-700">
                  <span>Latest First</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            </div>

            {/* Notices Table */}
            <div className="pt-2">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#f7f9fd] text-slate-500 font-semibold rounded-lg">
                      <th className="py-2.5 px-3 rounded-l-lg">Title</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 rounded-r-lg">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredNotices.map((notice) => {
                      const Icon = notice.icon
                      return (
                        <tr key={notice.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${notice.iconColor}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-800 leading-tight">{notice.title}</h3>
                                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed max-w-md">
                                  {notice.description}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2.5 py-0.5 rounded-md font-semibold text-[11px] ${notice.categoryBadge}`}>
                              {notice.categoryTag}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 font-medium whitespace-nowrap">
                            {notice.date}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          )}

          {/* CARD 2: ASSIGNMENTS SECTION */}
          {activeHeaderTab === 'Assignments' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
            {/* Assignments Header & Filter controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base font-bold text-slate-900">Assignments</h2>
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  View, submit and track your assignments.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {/* Search assignments */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={assignmentSearch}
                    onChange={(e) => setAssignmentSearch(e.target.value)}
                    placeholder="Search assignments..."
                    className="bg-[#f8faff] border border-slate-200 text-xs pl-8 pr-3 py-1.5 rounded-xl outline-none focus:border-blue-400 text-slate-700 w-44"
                  />
                </div>

                {/* All subjects dropdown */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f8faff] border border-slate-200 rounded-xl text-xs font-medium text-slate-700">
                  <span>All Subjects</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>

                {/* All status dropdown */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f8faff] border border-slate-200 rounded-xl text-xs font-medium text-slate-700">
                  <span>All Status</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>

                {/* Due Date dropdown */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f8faff] border border-slate-200 rounded-xl text-xs font-medium text-slate-700">
                  <span>Due Date (Earliest)</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>
            </div>

            {/* Assignments Layout: Left status category + Right assignments table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
              {/* Left Status Filter (2 cols) */}
              <div className="lg:col-span-2 space-y-1 text-xs">
                {[
                  { name: 'All Assignments', count: 12, dot: null },
                  { name: 'Pending', count: 5, dot: 'bg-amber-400' },
                  { name: 'Submitted', count: 4, dot: 'bg-emerald-500' },
                  { name: 'Overdue', count: 2, dot: 'bg-rose-500' },
                ].map((item) => {
                  const isSelected = assignmentFilter === item.name
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setAssignmentFilter(item.name)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-blue-600 font-bold'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {item.dot ? (
                          <span className={`w-2 h-2 rounded-full ${item.dot}`}></span>
                        ) : (
                          <FileText className="w-3.5 h-3.5" />
                        )}
                        <span>{item.name}</span>
                      </div>
                      <span className="text-[11px] text-slate-400">{item.count}</span>
                    </button>
                  )
                })}
              </div>

              {/* Right Table (10 cols) */}
              <div className="lg:col-span-10 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#f7f9fd] text-slate-500 font-semibold rounded-lg">
                      <th className="py-2.5 px-3 rounded-l-lg">Subject</th>
                      <th className="py-2.5 px-3">Title</th>
                      <th className="py-2.5 px-3">Due Date</th>
                      <th className="py-2.5 px-3 rounded-r-lg">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAssignments.map((a) => {
                      const Icon = a.subjectIcon
                      return (
                        <tr key={a.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2 font-semibold text-slate-800">
                              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <span>{a.subject}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 font-semibold text-slate-800">
                            {a.title}
                          </td>
                          <td className="py-3 px-3 font-medium text-rose-500 whitespace-nowrap">
                            {a.dueDate}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2.5 py-0.5 rounded-md font-semibold text-[11px] ${a.statusBadge}`}>
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
