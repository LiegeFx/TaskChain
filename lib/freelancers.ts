export interface FreelancerListing {
  id: number
  name: string
  title: string
  skills: string[]
  rating: number
  bio: string
  profileImage: string
  completedProjects: number
  hourlyRate: number
  location: string
}

export const FREELANCER_SKILLS = [
  'React',
  'Next.js',
  'TypeScript',
  'Node.js',
  'Stellar',
  'Smart Contracts',
  'UI/UX Design',
  'PostgreSQL',
  'Tailwind CSS',
  'Web3',
]

export const FREELANCERS: FreelancerListing[] = [
  {
    id: 1,
    name: 'Maya Chen',
    title: 'Senior Web3 Frontend Engineer',
    skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
    rating: 5,
    bio: 'Builds polished dApps, escrow dashboards, and conversion-focused marketplace flows for early-stage teams.',
    profileImage: '/placeholder-user.jpg',
    completedProjects: 48,
    hourlyRate: 95,
    location: 'San Francisco, CA',
  },
  {
    id: 2,
    name: 'Andre Okafor',
    title: 'Stellar Smart Contract Developer',
    skills: ['Stellar', 'Smart Contracts', 'Web3', 'Node.js'],
    rating: 5,
    bio: 'Specializes in Soroban contracts, payment rails, and secure milestone release logic for freelance products.',
    profileImage: '/placeholder-user.jpg',
    completedProjects: 36,
    hourlyRate: 110,
    location: 'Austin, TX',
  },
  {
    id: 3,
    name: 'Priya Raman',
    title: 'Full-Stack Product Engineer',
    skills: ['Next.js', 'PostgreSQL', 'Node.js', 'TypeScript'],
    rating: 4,
    bio: 'Ships reliable SaaS backends, API integrations, and responsive user experiences with strong delivery habits.',
    profileImage: '/placeholder-user.jpg',
    completedProjects: 62,
    hourlyRate: 88,
    location: 'New York, NY',
  },
  {
    id: 4,
    name: 'Leo Martinez',
    title: 'Marketplace UI/UX Designer',
    skills: ['UI/UX Design', 'React', 'Tailwind CSS'],
    rating: 4,
    bio: 'Designs accessible marketplace journeys, freelancer profiles, and dashboard systems that match product goals.',
    profileImage: '/placeholder-user.jpg',
    completedProjects: 41,
    hourlyRate: 76,
    location: 'Denver, CO',
  },
  {
    id: 5,
    name: 'Nora Jensen',
    title: 'Backend API Specialist',
    skills: ['Node.js', 'PostgreSQL', 'TypeScript'],
    rating: 3,
    bio: 'Creates dependable API layers, pagination strategies, search endpoints, and data models for growing platforms.',
    profileImage: '/placeholder-user.jpg',
    completedProjects: 27,
    hourlyRate: 70,
    location: 'Seattle, WA',
  },
  {
    id: 6,
    name: 'Samir Patel',
    title: 'Web3 Integration Consultant',
    skills: ['Web3', 'Stellar', 'React', 'Smart Contracts'],
    rating: 5,
    bio: 'Connects wallets, reputation services, and escrow workflows while keeping onboarding simple for clients.',
    profileImage: '/placeholder-user.jpg',
    completedProjects: 53,
    hourlyRate: 125,
    location: 'Chicago, IL',
  },
  {
    id: 7,
    name: 'Elena Petrova',
    title: 'Responsive Frontend Developer',
    skills: ['React', 'Tailwind CSS', 'Next.js'],
    rating: 4,
    bio: 'Transforms product requirements into fast, mobile-first interfaces with clean component architecture.',
    profileImage: '/placeholder-user.jpg',
    completedProjects: 34,
    hourlyRate: 82,
    location: 'Boston, MA',
  },
  {
    id: 8,
    name: 'Marcus Green',
    title: 'Database & Analytics Engineer',
    skills: ['PostgreSQL', 'Node.js', 'TypeScript'],
    rating: 2,
    bio: 'Improves reporting pipelines, search performance, and operational dashboards for data-heavy marketplaces.',
    profileImage: '/placeholder-user.jpg',
    completedProjects: 19,
    hourlyRate: 64,
    location: 'Atlanta, GA',
  },
  {
    id: 9,
    name: 'Aisha Bello',
    title: 'Product-Focused Full-Stack Developer',
    skills: ['Next.js', 'UI/UX Design', 'PostgreSQL', 'React'],
    rating: 5,
    bio: 'Combines engineering and product thinking to launch secure freelancer-client workflows quickly.',
    profileImage: '/placeholder-user.jpg',
    completedProjects: 57,
    hourlyRate: 102,
    location: 'Miami, FL',
  },
]
