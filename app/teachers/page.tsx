'use client'

import React, { useState } from 'react'
import TeacherHomePage from './home'

export default function TeacherPage() {
  const [currentTab, setCurrentTab] = useState<'Home' | 'Attendance' | 'Results' | 'Assignment' | string>('Home')

  // Placeholder pages for future — for now all route to Home
  return (
    <TeacherHomePage
      activeTab={currentTab}
      onSelectTab={(tab) => setCurrentTab(tab)}
    />
  )
}
