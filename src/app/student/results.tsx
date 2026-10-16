'use client'

import React, { useState } from 'react'
import StudentSideNav from './sidenav'
import {
  Search,
  Bell,
  ChevronDown,
  Calendar,
  TrendingUp,
  Trophy,
  FileText,
  Award,
  BarChart3,
  MessageSquare,
  Check,
} from 'lucide-react'

interface StudentResultsPageProps {
  activeTab?: string
  onSelectTab?: (tab: string) => void
}

interface TermData {
  id: string
  name: string
  year: string
  overallPercentage: number
  trend: string
  overallGrade: string
  performanceText: string
  totalSubjects: number
  rank: string
  topPercent: string
  subjects: {
    name: string
    marks: number
    total: number
    percentage: number
    grade: string
    color: string
  }[]
  teacherRemarks: string
}

const termsData: Record<string, TermData> = {
  'term-1-2026-27': {
    id: 'term-1-2026-27',
    name: 'Term 1',
    year: '2026 - 27',
    overallPercentage: 88,
    trend: '+5% from previous term',
    overallGrade: 'A+',
    performanceText: 'Excellent Performance',
    totalSubjects: 6,
    rank: '3 / 42',
    topPercent: 'Top 10%',
    teacherRemarks:
      'Good performance overall. Keep up the hard work, especially in Social Science. You have shown consistent improvement.',
    subjects: [
      { name: 'English', marks: 85, total: 100, percentage: 85, grade: 'A', color: 'bg-blue-500' },
      { name: 'Mathematics', marks: 92, total: 100, percentage: 92, grade: 'A+', color: 'bg-emerald-500' },
      { name: 'Science', marks: 88, total: 100, percentage: 88, grade: 'A', color: 'bg-amber-500' },
      { name: 'Social Science', marks: 78, total: 100, percentage: 78, grade: 'B+', color: 'bg-purple-500' },
      { name: 'Computer', marks: 95, total: 100, percentage: 95, grade: 'A+', color: 'bg-rose-500' },
      { name: 'Physical Education', marks: 89, total: 100, percentage: 89, grade: 'A', color: 'bg-teal-500' },
    ],
  },
  'term-2-2025-26': {
    id: 'term-2-2025-26',
    name: 'Term 2',
    year: '2025 - 26',
    overallPercentage: 83,
    trend: '+3% from previous term',
    overallGrade: 'A',
    performanceText: 'Very Good Performance',
    totalSubjects: 6,
    rank: '5 / 42',
    topPercent: 'Top 15%',
    teacherRemarks:
      'Aarav has shown solid dedication this term. Mathematics and Computer skills are commendable.',
    subjects: [
      { name: 'English', marks: 80, total: 100, percentage: 80, grade: 'A', color: 'bg-blue-500' },
      { name: 'Mathematics', marks: 88, total: 100, percentage: 88, grade: 'A', color: 'bg-emerald-500' },
      { name: 'Science', marks: 82, total: 100, percentage: 82, grade: 'A', color: 'bg-amber-500' },
      { name: 'Social Science', marks: 75, total: 100, percentage: 75, grade: 'B+', color: 'bg-purple-500' },
      { name: 'Computer', marks: 91, total: 100, percentage: 91, grade: 'A+', color: 'bg-rose-500' },
      { name: 'Physical Education', marks: 82, total: 100, percentage: 82, grade: 'A', color: 'bg-teal-500' },
    ],
  },
  'term-1-2025-26': {
    id: 'term-1-2025-26',
    name: 'Term 1',
    year: '2025 - 26',
    overallPercentage: 80,
    trend: '-2% from previous term',
    overallGrade: 'A',
    performanceText: 'Good Performance',
    totalSubjects: 6,
    rank: '7 / 42',
    topPercent: 'Top 20%',
    teacherRemarks:
      'Steady participation in classes. Needs slight focus on regular assignments and time management.',
    subjects: [
      { name: 'English', marks: 78, total: 100, percentage: 78, grade: 'B+', color: 'bg-blue-500' },
      { name: 'Mathematics', marks: 84, total: 100, percentage: 84, grade: 'A', color: 'bg-emerald-500' },
      { name: 'Science', marks: 79, total: 100, percentage: 79, grade: 'B+', color: 'bg-amber-500' },
      { name: 'Social Science', marks: 74, total: 100, percentage: 74, grade: 'B', color: 'bg-purple-500' },
      { name: 'Computer', marks: 87, total: 100, percentage: 87, grade: 'A', color: 'bg-rose-500' },
      { name: 'Physical Education', marks: 78, total: 100, percentage: 78, grade: 'B+', color: 'bg-teal-500' },
    ],
  },
  'term-2-2024-25': {
    id: 'term-2-2024-25',
    name: 'Term 2',
    year: '2024 - 25',
    overallPercentage: 82,
    trend: '+4% from previous term',
    overallGrade: 'A',
    performanceText: 'Commendable Effort',
    totalSubjects: 6,
    rank: '6 / 40',
    topPercent: 'Top 15%',
    teacherRemarks:
      'Active learner with bright enthusiasm in STEM subjects. Great sportsmanship shown throughout.',
    subjects: [
      { name: 'English', marks: 82, total: 100, percentage: 82, grade: 'A', color: 'bg-blue-500' },
      { name: 'Mathematics', marks: 86, total: 100, percentage: 86, grade: 'A', color: 'bg-emerald-500' },
      { name: 'Science', marks: 80, total: 100, percentage: 80, grade: 'A', color: 'bg-amber-500' },
      { name: 'Social Science', marks: 76, total: 100, percentage: 76, grade: 'B+', color: 'bg-purple-500' },
      { name: 'Computer', marks: 88, total: 100, percentage: 88, grade: 'A', color: 'bg-rose-500' },
      { name: 'Physical Education', marks: 80, total: 100, percentage: 80, grade: 'A', color: 'bg-teal-500' },
    ],
  },
}

export default function StudentResultsPage({
  activeTab = 'Results',
  onSelectTab,
}: StudentResultsPageProps) {
  const [selectedTermId, setSelectedTermId] = useState<string>('term-1-2026-27')
  const [searchQuery, setSearchQuery] = useState('')
  const [termDropdownOpen, setTermDropdownOpen] = useState(false)

  const currentTerm = termsData[selectedTermId] || termsData['term-1-2026-27']

  const totalObtained = currentTerm.subjects.reduce((sum, s) => sum + s.marks, 0)
  const totalMax = currentTerm.subjects.reduce((sum, s) => sum + s.total, 0)

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
            <span className="text-blue-600 font-semibold">{activeTab}</span>
          </div>

          <div className="flex-1 max-w-md mx-4 relative hidden sm:block">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for subjects, marks, grades..."
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
            </div>
          </div>
        </header>

        {/* Results Page Body */}
        <div className="p-8 space-y-6 max-w-7xl w-full mx-auto">
          {/* Header row with Term Dropdown */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#11183c]">
                Results
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1 font-medium">
                View your academic performance and progress over time.
              </p>
            </div>

            {/* Term selector dropdown */}
            <div className="relative self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setTermDropdownOpen(!termDropdownOpen)}
                className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{currentTerm.name} ({currentTerm.year})</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {termDropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-30">
                  {Object.values(termsData).map((term) => (
                    <button
                      key={term.id}
                      type="button"
                      onClick={() => {
                        setSelectedTermId(term.id)
                        setTermDropdownOpen(false)
                      }}
                      className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        selectedTermId === term.id ? 'font-bold text-blue-600 bg-blue-50/50' : 'text-slate-700'
                      }`}
                    >
                      <span>{term.name} ({term.year})</span>
                      {selectedTermId === term.id && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 4 Performance Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: Overall Percentage */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Overall Percentage</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">{currentTerm.overallPercentage}%</div>
                  <div className="text-[11px] text-emerald-600 font-semibold mt-1">
                    ↗ {currentTerm.trend}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Overall Grade */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                  <Trophy className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Overall Grade</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">{currentTerm.overallGrade}</div>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    {currentTerm.performanceText}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Total Subjects */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Total Subjects</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">{currentTerm.totalSubjects}</div>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    All Passed
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Rank in Class */}
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                  <Award className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Rank in Class</div>
                  <div className="text-2xl font-bold text-slate-900 mt-0.5">{currentTerm.rank}</div>
                  <div className="text-[11px] text-slate-400 mt-1 font-medium">
                    {currentTerm.topPercent}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Row: Results Table (Left) + Subject-wise Performance & Remarks (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Term Marks Table (7 cols) */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">
                  {currentTerm.name} ({currentTerm.year}) Results
                </h2>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#f7f9fd] text-slate-500 font-semibold rounded-lg">
                      <th className="py-2.5 px-4 rounded-l-lg">Subject</th>
                      <th className="py-2.5 px-4 text-center">Marks Obtained</th>
                      <th className="py-2.5 px-4 text-center">Total Marks</th>
                      <th className="py-2.5 px-4 text-center">Percentage</th>
                      <th className="py-2.5 px-4 rounded-r-lg text-center">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentTerm.subjects.map((sub, idx) => {
                      let gradeClass = 'bg-blue-50 text-blue-600'
                      if (sub.grade === 'A+') gradeClass = 'bg-emerald-50 text-emerald-600'
                      else if (sub.grade === 'A') gradeClass = 'bg-emerald-50 text-emerald-600'
                      else if (sub.grade === 'B+') gradeClass = 'bg-blue-50 text-blue-600'

                      return (
                        <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-800">{sub.name}</td>
                          <td className="py-3 px-4 text-center font-bold text-slate-700">{sub.marks}</td>
                          <td className="py-3 px-4 text-center text-slate-400">{sub.total}</td>
                          <td className="py-3 px-4 text-center font-semibold text-slate-700">{sub.percentage}%</td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-md font-bold text-[11px] ${gradeClass}`}>
                              {sub.grade}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                      <td className="py-3.5 px-4 text-slate-900">Total / Average</td>
                      <td className="py-3.5 px-4 text-center text-blue-900 text-sm font-extrabold">{totalObtained}</td>
                      <td className="py-3.5 px-4 text-center text-slate-500">{totalMax}</td>
                      <td className="py-3.5 px-4 text-center text-blue-900 text-sm font-extrabold">{currentTerm.overallPercentage}%</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-md font-bold text-xs">
                          {currentTerm.overallGrade}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Right: Subject-wise Bars + Teacher's Remarks (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Progress bars card */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    <h2 className="text-base font-bold text-slate-900">Subject-wise Performance</h2>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">{currentTerm.name} ({currentTerm.year})</span>
                </div>

                <div className="space-y-3.5">
                  {currentTerm.subjects.map((sub, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">{sub.name}</span>
                        <span className="font-bold text-slate-800">{sub.percentage}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${sub.color}`}
                          style={{ width: `${sub.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Teacher's Remarks card */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  <h3 className="text-xs font-bold text-slate-900">Teacher&apos;s Remarks</h3>
                </div>

                <div className="flex items-start gap-3 bg-[#f8faff] p-3.5 rounded-xl border border-blue-50 relative">
                  <img
                    src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150"
                    alt="Class Teacher"
                    className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-white"
                  />
                  <p className="text-xs text-slate-600 leading-relaxed pr-6">
                    {currentTerm.teacherRemarks}
                  </p>
                  <span className="text-3xl text-emerald-400/40 font-serif absolute right-3 bottom-1">
                    “
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Row: Past Results (Interactive Term Cards) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Past Results</h2>
              </div>
              <span className="text-xs text-slate-400">Click any card to load its results above</span>
            </div>

            {/* Grid of 4 Term Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.values(termsData).map((term) => {
                const isSelected = selectedTermId === term.id
                let trophyColor = 'bg-emerald-50 text-emerald-600'
                if (term.overallGrade === 'A') trophyColor = 'bg-amber-50 text-amber-500'

                return (
                  <div
                    key={term.id}
                    onClick={() => setSelectedTermId(term.id)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 shadow-sm ring-2 ring-blue-500/20'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-800">{term.name}</div>
                      <div className="text-[11px] text-slate-400 font-medium">{term.year}</div>
                      <div className="text-xl font-extrabold text-slate-900 mt-2 flex items-baseline gap-1.5">
                        {term.overallPercentage}%
                        <span className={`text-[10px] font-semibold ${term.trend.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}`}>
                          {term.trend.split(' ')[0]}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${trophyColor}`}>
                        <Trophy className="w-5 h-5" />
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {term.overallGrade}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
