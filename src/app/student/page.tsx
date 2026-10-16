'use client'

import React, { useState } from 'react'
import StudentDashboardPage from './home'
import StudentProfilePage from './profile'
import StudentAttendancePage from './attendance'
import StudentResultsPage from './results'
import StudentNoticesPage from './notices'

export default function StudentPage() {
  const [currentTab, setCurrentTab] = useState<'Home' | 'My Profile' | 'Attendance' | 'Results' | 'Notices' | string>('Home')

  if (currentTab === 'My Profile') {
    return (
      <StudentProfilePage
        activeTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
      />
    )
  }

  if (currentTab === 'Attendance') {
    return (
      <StudentAttendancePage
        activeTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
      />
    )
  }

  if (currentTab === 'Results') {
    return (
      <StudentResultsPage
        activeTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
      />
    )
  }

  if (currentTab === 'Notices') {
    return (
      <StudentNoticesPage
        activeTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
      />
    )
  }

  return (
    <StudentDashboardPage
      activeTab={currentTab}
      onSelectTab={(tab) => setCurrentTab(tab)}
    />
  )
}
