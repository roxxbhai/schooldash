'use client'

import React, { useState } from 'react'
import {
  Home,
  CheckCircle2,
  BarChart3,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
}

const navItems: NavItem[] = [
  { name: 'Home', href: '/teachers', icon: Home },
  { name: 'Attendance', href: '/teachers/attendance', icon: CheckCircle2 },
  { name: 'Results', href: '/teachers/results', icon: BarChart3 },
  { name: 'Assignment', href: '/teachers/assignment', icon: FileText },
]

interface SideNavProps {
  activeItem?: string
  onSelect?: (item: string) => void
}

export default function TeacherSideNav({
  activeItem = 'Home',
  onSelect,
}: SideNavProps) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const currentActive = activeItem

  const handleItemClick = (item: NavItem) => {
    if (onSelect) onSelect(item.name)
    if (item.href) {
      router.push(item.href)
    }
  }

  return (
    <aside
      className={`h-screen bg-[#07193f] bg-gradient-to-b from-[#091f4d] via-[#07193f] to-[#040e24] text-white flex flex-col justify-between transition-all duration-300 relative select-none shrink-0 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Top Header Section: Logo + School Name */}
      <div className="pt-6 pb-4 px-4 flex flex-col items-center border-b border-white/5">
        <div className="relative mb-3 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-amber-500/10 p-1 flex items-center justify-center ring-2 ring-amber-400/30 shadow-lg">
            <img
              src="https://upload.wikimedia.org/wikipedia/en/c/c4/J.C._Bose_University_of_Science_and_Technology%2C_YMCA_logo.png"
              alt="School Crest"
              className="w-11 h-11 object-contain drop-shadow"
            />
          </div>
        </div>

        {!collapsed && (
          <div className="text-center transition-opacity duration-200">
            <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
              Emmanuel Mission
            </h1>
            <h2 className="text-sm font-bold tracking-tight text-white/90">
              Sr. Sec. School
            </h2>
            <p className="text-[10px] font-semibold tracking-widest text-slate-300/80 mt-1 uppercase">
              LEARN &bull; GROW &bull; SERVE
            </p>
          </div>
        )}
      </div>

      {/* Main Nav Items */}
      <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1 scrollbar-thin scrollbar-thumb-white/10">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentActive === item.name

          return (
            <button
              key={item.name}
              type="button"
              onClick={() => handleItemClick(item)}
              title={collapsed ? item.name : undefined}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all ${
                isActive
                  ? 'bg-[#155dfc] text-white shadow-md shadow-blue-900/40 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              } ${collapsed ? 'justify-center px-0' : ''}`}
            >
              <Icon
                className={`w-[18px] h-[18px] shrink-0 transition-transform ${
                  isActive ? 'scale-105 stroke-[2.2]' : 'stroke-[1.8]'
                }`}
              />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </button>
          )
        })}
      </div>

      {/* Footer Section */}
      <div className="p-3 border-t border-white/10 space-y-2">
        {/* Collapse / Expand Toggle Button */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-7 h-7 rounded-full bg-[#1b2f5b] hover:bg-[#25417e] text-slate-300 hover:text-white flex items-center justify-center transition-colors shadow-sm"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
