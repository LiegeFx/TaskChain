'use client'

import React, { useState } from 'react'
import { MilestoneProgressTracker, MilestoneTrackerData } from '@/components/dashboard/milestone-progress-tracker'

/**
 * Example/Demo component showing how to use MilestoneProgressTracker
 * This demonstrates all three variants: stepper, cards, and timeline
 */

// Sample milestone data
const SAMPLE_MILESTONES: MilestoneTrackerData[] = [
  {
    id: '1',
    title: 'Design & Mockups',
    description: 'Complete design mockups and wireframes for the project',
    amount: 1250,
    state: 'paid',
    dueDate: '2024-02-15',
    completedDate: '2024-02-10',
    order: 1,
  },
  {
    id: '2',
    title: 'Frontend Development',
    description: 'Build responsive frontend components and pages',
    amount: 2000,
    state: 'approved',
    dueDate: '2024-03-01',
    approvedDate: '2024-02-28',
    order: 2,
  },
  {
    id: '3',
    title: 'Backend Integration',
    description: 'Integrate APIs and set up database infrastructure',
    amount: 1500,
    state: 'submitted',
    dueDate: '2024-03-15',
    submittedDate: '2024-03-14',
    order: 3,
  },
  {
    id: '4',
    title: 'Testing & QA',
    description: 'Comprehensive testing and quality assurance',
    amount: 800,
    state: 'in_progress',
    dueDate: '2024-03-30',
    order: 4,
  },
  {
    id: '5',
    title: 'Deployment',
    description: 'Deploy to production and monitor system',
    amount: 500,
    state: 'pending',
    dueDate: '2024-04-15',
    order: 5,
  },
]

export function MilestoneProgressTrackerDemo() {
  const [selectedMilestone, setSelectedMilestone] = useState<MilestoneTrackerData | null>(null)
  const [variant, setVariant] = useState<'stepper' | 'cards' | 'timeline'>('stepper')

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Milestone Progress Tracker</h1>
          <p className="text-muted-foreground mt-2">
            Interactive component demo showing all variants of the milestone tracker
          </p>
        </div>

        {/* Variant Selector */}
        <div className="flex gap-2 flex-wrap">
          {(['stepper', 'cards', 'timeline'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                variant === v
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)} View
            </button>
          ))}
        </div>
      </div>

      {/* Main Tracker */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Project: Web Application Development</h2>
        <div className="rounded-lg border border-border/50 bg-card p-6">
          <MilestoneProgressTracker
            milestones={SAMPLE_MILESTONES}
            projectId="project-123"
            variant={variant}
            showProgress={true}
            onMilestoneClick={setSelectedMilestone}
          />
        </div>
      </div>

      {/* Selected Milestone Details */}
      {selectedMilestone && (
        <div className="rounded-lg border border-border/50 bg-card p-6 space-y-4">
          <h3 className="text-lg font-semibold">Selected Milestone Details</h3>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Title</p>
              <p className="font-semibold">{selectedMilestone.title}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="font-semibold">
                ${selectedMilestone.amount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">State</p>
              <p className="font-semibold capitalize">
                {selectedMilestone.state.replace('_', ' ')}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Order</p>
              <p className="font-semibold">#{selectedMilestone.order}</p>
            </div>
          </div>
          {selectedMilestone.description && (
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm">{selectedMilestone.description}</p>
            </div>
          )}
        </div>
      )}

      {/* Usage Documentation */}
      <div className="rounded-lg border border-border/50 bg-card p-6 space-y-4">
        <h3 className="text-lg font-semibold">Usage</h3>
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
{`import { MilestoneProgressTracker, MilestoneTrackerData } from '@/components/dashboard/milestone-progress-tracker'

const milestones: MilestoneTrackerData[] = [
  {
    id: '1',
    title: 'Design Phase',
    description: 'Complete mockups',
    amount: 1250,
    state: 'paid', // pending, in_progress, submitted, approved, paid
    dueDate: '2024-02-15',
    order: 1,
  },
  // ... more milestones
]

export function MyComponent() {
  return (
    <MilestoneProgressTracker
      milestones={milestones}
      projectId="project-123"
      variant="stepper" // stepper, cards, timeline
      showProgress={true}
      compact={false}
      onMilestoneClick={(milestone) => {
        console.log('Clicked:', milestone)
      }}
    />
  )
}`}
        </pre>
      </div>

      {/* Props Documentation */}
      <div className="rounded-lg border border-border/50 bg-card p-6 space-y-4">
        <h3 className="text-lg font-semibold">Component Props</h3>
        <div className="space-y-2 text-sm">
          <div>
            <p className="font-semibold">milestones: MilestoneTrackerData[]</p>
            <p className="text-muted-foreground">Array of milestone data to display</p>
          </div>
          <div>
            <p className="font-semibold">variant?: &apos;stepper&apos; | &apos;cards&apos; | &apos;timeline&apos;</p>
            <p className="text-muted-foreground">Display variant (default: &apos;stepper&apos;)</p>
          </div>
          <div>
            <p className="font-semibold">showProgress?: boolean</p>
            <p className="text-muted-foreground">Show progress bar and stats (default: true)</p>
          </div>
          <div>
            <p className="font-semibold">compact?: boolean</p>
            <p className="text-muted-foreground">Compact display mode (default: false)</p>
          </div>
          <div>
            <p className="font-semibold">onMilestoneClick?: (milestone) =&gt; void</p>
            <p className="text-muted-foreground">Callback when a milestone is clicked</p>
          </div>
        </div>
      </div>

      {/* States Documentation */}
      <div className="rounded-lg border border-border/50 bg-card p-6 space-y-4">
        <h3 className="text-lg font-semibold">Milestone States</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-yellow-500" />
            <div>
              <p className="font-semibold">Pending</p>
              <p className="text-muted-foreground">Milestone not yet started</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-blue-500" />
            <div>
              <p className="font-semibold">In Progress</p>
              <p className="text-muted-foreground">Work in progress on milestone</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-purple-500" />
            <div>
              <p className="font-semibold">Submitted</p>
              <p className="text-muted-foreground">Milestone submitted for review</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <div>
              <p className="font-semibold">Approved</p>
              <p className="text-muted-foreground">Milestone approved by client</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-emerald-500" />
            <div>
              <p className="font-semibold">Paid</p>
              <p className="text-muted-foreground">Payment released for milestone</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
