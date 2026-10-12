'use client'

import React, { useState } from 'react'
import StudentSideNav from './sidenav'
import {
  Search,
  Bell,
  ChevronDown,
  Edit3,
  Camera,
  CheckCircle2,
  Calendar,
  GraduationCap,
  BadgeCheck,
  Droplet,
  Building,
  User,
  BookOpen,
  Phone,
  FileText,
} from 'lucide-react'

interface StudentProfilePageProps {
  activeTab?: string
  onSelectTab?: (tab: string) => void
}

export default function StudentProfilePage({
  activeTab = 'My Profile',
  onSelectTab,
}: StudentProfilePageProps) {
  const [activeInfoTab, setActiveInfoTab] = useState('Personal Information')
  const [searchQuery, setSearchQuery] = useState('')

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
              <ChevronDown className="w-4 h-4 text-slate-400 hidden md:block" />
            </div>
          </div>
        </header>

        {/* Profile Content Body */}
        <div className="p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Header row with Title and Edit Profile button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#11183c]">
                My Profile
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">
                View and manage your personal information.
              </p>
            </div>

           
          </div>

          {/* Top Row: Main Profile Avatar Card + 4 Key Stat Badges */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Big Student Card (5 cols) */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-5">
              <div className="relative shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=300"
                  alt="Aarav Sharma"
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover ring-4 ring-slate-100"
                />
                
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                  Aarav Sharma
                </h2>
                <p className="text-xs font-semibold text-slate-600 mt-0.5">
                  Class 10 - A
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Admission No: EMS10234
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[11px] font-semibold">
                    <CheckCircle2 className="w-3 h-3" />
                    Active Student
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    2026 - 27
                  </span>
                </div>
              </div>
            </div>

            {/* Right: 4 Metric Cards (7 cols in 2x2 grid) */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Card 1: Class & Section */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Class & Section</div>
                  <div className="text-sm font-bold text-slate-800 mt-0.5">Class 10 - A</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Academic Year 2026 - 27</div>
                </div>
              </div>

              {/* Card 2: Admission No. */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <BadgeCheck className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Admission No.</div>
                  <div className="text-sm font-bold text-slate-800 mt-0.5">EMS10234</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Date of Admission: 10 Apr 2021</div>
                </div>
              </div>

              {/* Card 3: Date of Birth */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Calendar className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Date of Birth</div>
                  <div className="text-sm font-bold text-slate-800 mt-0.5">15 Jan 2011</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Age: 15 years</div>
                </div>
              </div>

              {/* Card 4: Blood Group */}
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                  <Droplet className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <div className="text-[11px] font-medium text-slate-400">Blood Group</div>
                  <div className="mt-1">
                    <span className="px-2.5 py-0.5 bg-rose-50 text-rose-600 font-bold text-xs rounded-md border border-rose-200">
                      O+
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: Detailed Tables Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Personal Information Tabs & Details (7 cols) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Section Header */}
              <div className="border-b border-slate-100 px-6 pt-4 pb-3 flex items-center gap-2">
                <span className="text-xs font-semibold text-blue-600 border-b-2 border-blue-600 pb-3 -mb-3 inline-flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Personal Information
                </span>
              </div>

              {/* Table section */}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-900">Personal Details</h3>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Full Name</span>
                    <span className="text-slate-800 font-semibold">Aarav Sharma</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Date of Birth</span>
                    <span className="text-slate-800 font-semibold">15 Jan 2011</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Gender</span>
                    <span className="text-slate-800 font-semibold">Male</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Blood Group</span>
                    <span className="text-slate-800 font-semibold">O+</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Father's Name</span>
                    <span className="text-slate-800 font-semibold">Rajesh Sharma</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Mother's Name</span>
                    <span className="text-slate-800 font-semibold">Priya Sharma</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Address</span>
                    <span className="text-slate-800 font-semibold text-right max-w-xs">
                      123, Green Park, Jaipur, Rajasthan - 302001
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Phone Number</span>
                    <span className="text-slate-800 font-semibold">+91 98765 43210</span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Email Address</span>
                    <span className="text-slate-800 font-semibold">aarav.sharma@example.com</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: School Information (5 cols) */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Building className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">School Information</h3>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-400 font-medium">School Name</span>
                  <span className="text-slate-800 font-semibold text-right">
                    Emmanuel Mission Sr. Sec. School
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-400 font-medium">School Type</span>
                  <span className="text-slate-800 font-semibold">Senior Secondary (CBSE)</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Board</span>
                  <span className="text-slate-800 font-semibold text-right">
                    Central Board of Secondary Education
                  </span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Academic Year</span>
                  <span className="text-slate-800 font-semibold">2026 - 27</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Class Teacher</span>
                  <span className="text-slate-800 font-semibold">Ms. Neha Verma</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Section</span>
                  <span className="text-slate-800 font-semibold">A</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Roll Number</span>
                  <span className="text-slate-800 font-semibold">24</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Fee Details</span>
                  <span className="text-slate-800 font-semibold">₹ 24,500</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
