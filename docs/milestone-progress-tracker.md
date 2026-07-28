# Milestone Progress Tracker Component

## Overview

The Milestone Progress Tracker is a reusable React component that visually represents project progress through milestone tracking. It supports dynamic updates and displays milestone states with a clean, responsive UI optimized for both desktop and mobile devices.

## Features

### ✨ Core Features

- **5 Milestone States**: Pending → In Progress → Submitted → Approved → Paid
- **3 Display Variants**: 
  - Stepper View (vertical timeline with step indicators)
  - Cards View (grid layout)
  - Timeline View (horizontal progress display)
- **Dynamic Progress Tracking**: Real-time progress calculation based on milestone states
- **Responsive Design**: Fully responsive for desktop and mobile devices
- **Detailed Statistics**: Overview of total budget, released amount, and completion status
- **Interactive Elements**: Click handlers for milestone interactions
- **Accessibility**: Semantic HTML with proper ARIA labels

### 📊 Progress Calculation

The component automatically calculates project progress using weighted state values:
- **Pending**: 0%
- **In Progress**: 25%
- **Submitted**: 50%
- **Approved**: 75%
- **Paid**: 100%

Overall progress is the average of all milestone weights.

## Components

### Main Component: `MilestoneProgressTracker`

**File**: `components/dashboard/milestone-progress-tracker.tsx`

#### Props

```typescript
interface MilestoneProgressTrackerProps {
  milestones: MilestoneTrackerData[]      // Array of milestone data
  projectId?: string                       // Optional project identifier
  variant?: 'stepper' | 'cards' | 'timeline'  // Display variant (default: 'stepper')
  showProgress?: boolean                   // Show progress bar and stats (default: true)
  compact?: boolean                        // Compact display mode (default: false)
  onMilestoneClick?: (milestone) => void  // Click handler for milestones
}
```

#### Data Types

```typescript
type MilestoneState = 'pending' | 'in_progress' | 'submitted' | 'approved' | 'paid'

interface MilestoneTrackerData {
  id: string                // Unique identifier
  title: string             // Milestone title
  description?: string      // Optional description
  amount: number            // Budget amount in USD
  state: MilestoneState     // Current milestone state
  dueDate?: string          // Optional due date (ISO string)
  completedDate?: string    // Optional completion date
  submittedDate?: string    // Optional submission date
  approvedDate?: string     // Optional approval date
  order: number             // Milestone sequence number
}
```

## Display Variants

### 1. Stepper View (Default)

Vertical timeline with numbered steps and connection lines.

**Best for**: 
- Linear project workflows
- Sequential milestone dependencies
- Mobile viewing

**Features**:
- Visual step indicators
- Connection lines between steps
- Detailed milestone information
- Clear progression visualization

### 2. Cards View

Grid layout with milestone cards.

**Best for**:
- Overview of all milestones
- Quick scanning of project status
- Dashboard summaries

**Features**:
- Clean card-based design
- Responsive grid layout
- Color-coded status badges
- Hover effects and interactions

### 3. Timeline View

Horizontal scroll timeline.

**Best for**:
- High-level project overview
- Sequential presentation
- Compact displays

**Features**:
- Horizontal scrolling on mobile
- Milestone icons with states
- Compact information display
- Quick progress visualization

## Usage Examples

### Basic Usage

```typescript
import { MilestoneProgressTracker, MilestoneTrackerData } from '@/components/dashboard/milestone-progress-tracker'

const milestones: MilestoneTrackerData[] = [
  {
    id: '1',
    title: 'Design Phase',
    description: 'UI/UX design and mockups',
    amount: 1500,
    state: 'paid',
    dueDate: '2024-02-15',
    order: 1,
  },
  {
    id: '2',
    title: 'Frontend Development',
    amount: 2500,
    state: 'in_progress',
    dueDate: '2024-03-01',
    order: 2,
  },
]

export function ProjectDashboard() {
  return (
    <MilestoneProgressTracker
      milestones={milestones}
      projectId="project-123"
    />
  )
}
```

### With Click Handler

```typescript
export function ProjectDashboard() {
  const handleMilestoneClick = (milestone: MilestoneTrackerData) => {
    console.log('Milestone clicked:', milestone.id)
    // Open edit dialog, fetch details, etc.
  }

  return (
    <MilestoneProgressTracker
      milestones={milestones}
      variant="cards"
      onMilestoneClick={handleMilestoneClick}
    />
  )
}
```

### Compact Mode

```typescript
<MilestoneProgressTracker
  milestones={milestones}
  compact={true}
  showProgress={false}
/>
```

## Styling

The component uses:
- **TailwindCSS**: For responsive styling
- **Radix UI**: For accessible components (Badge, Progress)
- **CSS Variables**: For theme support (light/dark mode)

### Color-Coded States

Each milestone state has a distinct color scheme:

| State | Color | Hex |
|-------|-------|-----|
| Pending | Yellow | #EAB308 |
| In Progress | Blue | #3B82F6 |
| Submitted | Purple | #A855F7 |
| Approved | Green | #22C55E |
| Paid | Emerald | #10B981 |

## Database Integration

### Schema

The milestones are stored in the `milestones` table with the following structure:

```sql
CREATE TABLE milestones (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'pending',
  milestone_order INTEGER NOT NULL DEFAULT 0,
  due_date TIMESTAMP,
  submitted_date TIMESTAMP,
  approved_date TIMESTAMP,
  completed_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Migration

Run the migration script to update your database:

```bash
npm run migrate -- scripts/007-milestone-state-tracking.sql
```

## Helper Functions

The `lib/milestone-tracker.ts` file provides utility functions:

### `calculateMilestoneMetrics(milestones)`

Returns progress metrics including completion percentage and budget information.

### `getAllowedStateTransitions(currentState)`

Returns valid next states for a given milestone state.

### `isValidStateTransition(from, to)`

Validates if a state transition is allowed.

### `formatMilestoneState(state)`

Formats a milestone state for display purposes.

## Responsive Behavior

- **Mobile** (< 768px):
  - Cards stack vertically
  - Stepper displays with optimized spacing
  - Timeline scrolls horizontally
  - Compact mode automatically applied

- **Tablet** (768px - 1024px):
  - 2-column card layout
  - Full stepper view
  - Timeline with more spacing

- **Desktop** (> 1024px):
  - Full card grid layout
  - Detailed stepper view
  - Timeline with all information

## Accessibility

- Semantic HTML structure
- Color-coded and labeled badges
- Icon + text combinations for state indication
- Proper heading hierarchy
- Click handlers for keyboard navigation support

## Performance

- Memoized calculations for progress metrics
- Efficient rendering with `useMemo`
- Optimized re-renders
- Minimal DOM operations

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## Future Enhancements

- [ ] Drag-and-drop reordering
- [ ] Edit milestone modal
- [ ] Bulk state transitions
- [ ] Milestone timeline chart
- [ ] Export to PDF
- [ ] Comments and annotations
- [ ] Milestone templates
- [ ] Gantt chart view

## Testing

Example test cases for the component:

```typescript
describe('MilestoneProgressTracker', () => {
  it('renders milestone cards correctly', () => {
    // Test component rendering
  })

  it('calculates progress percentage correctly', () => {
    // Test progress calculation
  })

  it('handles milestone click events', () => {
    // Test click handlers
  })

  it('displays all three variants', () => {
    // Test variant rendering
  })
})
```

## Contributing

To extend this component:

1. Add new states to `MilestoneState` type
2. Update `STATE_CONFIG` with new colors and icons
3. Add state weights to progress calculation
4. Update database schema if needed
5. Add tests for new functionality

## Demo

See `components/dashboard/milestone-progress-tracker-demo.tsx` for a full interactive demo with all variants and features.

---

**Created**: 2024
**Last Updated**: 2024-06-24
**Status**: Production Ready
