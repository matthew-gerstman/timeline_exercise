import { addDays } from 'date-fns'
import { useMemo, useState } from 'react'
import { TimelineBoard, type TimelineViewport } from './TimelineBoard'

const today = new Date()
const seedTasks = [
  { id: 'r-1', title: 'Kickoff', start: addDays(today, -10), end: addDays(today, -7) },
  { id: 'r-2', title: 'Design', start: addDays(today, -5), end: addDays(today, 8) },
  { id: 'r-3', title: 'Implementation Phase 1', start: addDays(today, 2), end: addDays(today, 18) },
  { id: 'r-4', title: 'Implementation Phase 2', start: addDays(today, 19), end: addDays(today, 35) },
  { id: 'r-5', title: 'QA & UAT', start: addDays(today, 28), end: addDays(today, 40) },
  { id: 'r-6', title: 'Launch Prep', start: addDays(today, 36), end: addDays(today, 45) },
  { id: 'r-7', title: 'Launch', start: addDays(today, 46), end: addDays(today, 46) },
  { id: 'r-8', title: 'Post-Launch Monitoring', start: addDays(today, 47), end: addDays(today, 60) },
].map((t, i) => ({ ...t, baseIndex: i }))

export function App() {
  const [tasks, setTasks] = useState(seedTasks)
  const viewport: TimelineViewport = useMemo(() => {
    const start = addDays(today, -14)
    const end = addDays(today, 70)
    return { start, end, pxPerDay: 16 }
  }, [])

  return (
    <div className="w-full h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="w-full max-w-7xl h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
        <TimelineBoard tasks={tasks as any} setTasks={setTasks as any} viewport={viewport} />
      </div>
    </div>
  )
}
