import { addDays } from 'date-fns'
import { useCallback, useMemo, useState } from 'react'
import { TimelineBoard, type TimelineViewport } from './TimelineBoard'

const today = new Date()
const seedTasks = [
  // Initial Planning & Kickoff
  { id: 'r-1', title: 'Project Kickoff', start: addDays(today, -10), end: addDays(today, -9) },
  { id: 'r-2', title: 'Stakeholder Alignment', start: addDays(today, -8), end: addDays(today, -6) },
  { id: 'r-3', title: 'Requirements Gathering', start: addDays(today, -7), end: addDays(today, -2) },
  
  // Design Phase
  { id: 'r-4', title: 'UI/UX Research', start: addDays(today, -5), end: addDays(today, 2) },
  { id: 'r-5', title: 'Wireframing', start: addDays(today, -3), end: addDays(today, 4) },
  { id: 'r-6', title: 'Design System Setup', start: addDays(today, 0), end: addDays(today, 6) },
  { id: 'r-7', title: 'High-Fidelity Mockups', start: addDays(today, 3), end: addDays(today, 10) },
  { id: 'r-8', title: 'Design Review', start: addDays(today, 8), end: addDays(today, 9) },
  
  // Architecture & Setup
  { id: 'r-9', title: 'Technical Architecture', start: addDays(today, 1), end: addDays(today, 7) },
  { id: 'r-10', title: 'Database Schema Design', start: addDays(today, 5), end: addDays(today, 9) },
  { id: 'r-11', title: 'API Design', start: addDays(today, 6), end: addDays(today, 11) },
  { id: 'r-12', title: 'DevOps Setup', start: addDays(today, 8), end: addDays(today, 14) },
  
  // Development Sprint 1
  { id: 'r-13', title: 'Authentication Module', start: addDays(today, 10), end: addDays(today, 17) },
  { id: 'r-14', title: 'User Profile Service', start: addDays(today, 12), end: addDays(today, 19) },
  { id: 'r-15', title: 'Dashboard Layout', start: addDays(today, 11), end: addDays(today, 16) },
  { id: 'r-16', title: 'Navigation Component', start: addDays(today, 13), end: addDays(today, 18) },
  
  // Development Sprint 2
  { id: 'r-17', title: 'Data Grid Component', start: addDays(today, 18), end: addDays(today, 25) },
  { id: 'r-18', title: 'Form Builder', start: addDays(today, 20), end: addDays(today, 28) },
  { id: 'r-19', title: 'File Upload Service', start: addDays(today, 19), end: addDays(today, 24) },
  { id: 'r-20', title: 'Notification System', start: addDays(today, 22), end: addDays(today, 29) },
  
  // Development Sprint 3
  { id: 'r-21', title: 'Search Functionality', start: addDays(today, 26), end: addDays(today, 33) },
  { id: 'r-22', title: 'Filtering & Sorting', start: addDays(today, 27), end: addDays(today, 32) },
  { id: 'r-23', title: 'Analytics Dashboard', start: addDays(today, 30), end: addDays(today, 38) },
  { id: 'r-24', title: 'Reporting Module', start: addDays(today, 31), end: addDays(today, 39) },
  
  // Development Sprint 4
  { id: 'r-25', title: 'Real-time Updates', start: addDays(today, 34), end: addDays(today, 41) },
  { id: 'r-26', title: 'Chat Integration', start: addDays(today, 35), end: addDays(today, 42) },
  { id: 'r-27', title: 'Email Templates', start: addDays(today, 36), end: addDays(today, 40) },
  { id: 'r-28', title: 'Permissions System', start: addDays(today, 37), end: addDays(today, 44) },
  
  // Integration & Testing
  { id: 'r-29', title: 'Third-party API Integration', start: addDays(today, 40), end: addDays(today, 47) },
  { id: 'r-30', title: 'Payment Gateway Setup', start: addDays(today, 42), end: addDays(today, 48) },
  { id: 'r-31', title: 'Unit Testing', start: addDays(today, 15), end: addDays(today, 45) },
  { id: 'r-32', title: 'Integration Testing', start: addDays(today, 43), end: addDays(today, 50) },
  
  // QA Phase
  { id: 'r-33', title: 'QA Test Planning', start: addDays(today, 44), end: addDays(today, 47) },
  { id: 'r-34', title: 'Functional Testing', start: addDays(today, 48), end: addDays(today, 55) },
  { id: 'r-35', title: 'Performance Testing', start: addDays(today, 50), end: addDays(today, 56) },
  { id: 'r-36', title: 'Security Audit', start: addDays(today, 51), end: addDays(today, 57) },
  { id: 'r-37', title: 'Bug Fixing', start: addDays(today, 53), end: addDays(today, 60) },
  { id: 'r-38', title: 'UAT Preparation', start: addDays(today, 56), end: addDays(today, 58) },
  
  // UAT & Final Prep
  { id: 'r-39', title: 'User Acceptance Testing', start: addDays(today, 59), end: addDays(today, 66) },
  { id: 'r-40', title: 'Documentation', start: addDays(today, 57), end: addDays(today, 64) },
  { id: 'r-41', title: 'Training Materials', start: addDays(today, 60), end: addDays(today, 65) },
  { id: 'r-42', title: 'User Training Sessions', start: addDays(today, 66), end: addDays(today, 69) },
  
  // Launch Preparation
  { id: 'r-43', title: 'Production Environment Setup', start: addDays(today, 63), end: addDays(today, 67) },
  { id: 'r-44', title: 'Data Migration', start: addDays(today, 68), end: addDays(today, 71) },
  { id: 'r-45', title: 'Deployment Rehearsal', start: addDays(today, 70), end: addDays(today, 72) },
  { id: 'r-46', title: 'Launch Communications', start: addDays(today, 69), end: addDays(today, 73) },
  { id: 'r-47', title: 'Go-Live', start: addDays(today, 74), end: addDays(today, 74) },
  
  // Post-Launch
  { id: 'r-48', title: 'Monitoring & Support', start: addDays(today, 75), end: addDays(today, 90) },
  { id: 'r-49', title: 'Performance Optimization', start: addDays(today, 76), end: addDays(today, 85) },
  { id: 'r-50', title: 'Feedback Collection & Analysis', start: addDays(today, 78), end: addDays(today, 92) },
].map((t, i) => ({ ...t, baseIndex: i }))

export function App() {
  const [tasks, setTasks] = useState(seedTasks)
  const [viewportStart, setViewportStart] = useState(addDays(today, -14))
  const [viewportEnd, setViewportEnd] = useState(addDays(today, 100))
  
  const viewport: TimelineViewport = useMemo(() => {
    return { start: viewportStart, end: viewportEnd, pxPerDay: 16 }
  }, [viewportStart, viewportEnd])

  const handleReachStart = useCallback(() => {
    // Expand viewport to the left by 30 days
    setViewportStart(prev => addDays(prev, -30))
  }, [])

  const handleReachEnd = useCallback(() => {
    // Expand viewport to the right by 30 days
    setViewportEnd(prev => addDays(prev, 30))
  }, [])

  return (
    <div className="w-full h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="w-full max-w-7xl h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        <TimelineBoard 
          tasks={tasks as any} 
          setTasks={setTasks as any} 
          viewport={viewport}
          onReachStart={handleReachStart}
          onReachEnd={handleReachEnd}
        />
      </div>
    </div>
  )
}
