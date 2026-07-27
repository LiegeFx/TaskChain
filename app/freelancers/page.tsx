'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, SlidersHorizontal, Star, Users } from 'lucide-react'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { FreelancerListing } from '@/lib/freelancers'

interface FreelancerResponse {
  freelancers: FreelancerListing[]
  skills: string[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

const DEFAULT_RESPONSE: FreelancerResponse = {
  freelancers: [],
  skills: [],
  pagination: { page: 1, pageSize: 6, totalItems: 0, totalPages: 1 },
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          className={`size-4 ${index < rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
        />
      ))}
      <span className="ml-1 text-sm font-medium text-foreground">{rating}.0</span>
    </div>
  )
}

function LoadingCards() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading freelancers">
      {Array.from({ length: 6 }, (_, index) => (
        <Card key={index} className="overflow-hidden border-border/70 bg-card/70">
          <CardHeader className="gap-4">
            <div className="flex items-center gap-4">
              <div className="size-16 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-16 animate-pulse rounded bg-muted" />
            <div className="flex gap-2">
              <div className="h-7 w-20 animate-pulse rounded-full bg-muted" />
              <div className="h-7 w-24 animate-pulse rounded-full bg-muted" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function FreelancersPage() {
  const [search, setSearch] = useState('')
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [minimumRating, setMinimumRating] = useState(0)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<FreelancerResponse>(DEFAULT_RESPONSE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    selectedSkills.forEach((skill) => params.append('skills', skill))
    if (minimumRating > 0) params.set('rating', String(minimumRating))
    params.set('page', String(page))
    return params.toString()
  }, [minimumRating, page, search, selectedSkills])

  const loadFreelancers = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/freelancers?${queryString}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Freelancer search failed')
      const payload = (await response.json()) as FreelancerResponse
      setData(payload)
      setError(null)
    } catch {
      setError('Unable to load freelancers. Please try again.')
      setData(DEFAULT_RESPONSE)
    } finally {
      setLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadFreelancers()
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [loadFreelancers])

  function toggleSkill(skill: string) {
    setPage(1)
    setSelectedSkills((current) =>
      current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]
    )
  }

  function clearFilters() {
    setSearch('')
    setSelectedSkills([])
    setMinimumRating(0)
    setPage(1)
  }

  const hasActiveFilters = search.trim() || selectedSkills.length > 0 || minimumRating > 0

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="border-b border-border/60 bg-gradient-to-b from-primary/10 via-background to-background pt-28">
        <div className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="max-w-3xl space-y-4">
            <Badge className="rounded-full bg-primary/10 text-primary hover:bg-primary/10">
              <Users className="mr-2 size-3.5" /> Freelancer marketplace
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Find trusted freelancers for your next TaskChain project
            </h1>
            <p className="text-lg text-muted-foreground">
              Search by name or keyword, combine skill and rating filters, and review concise profiles before starting work.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[320px_1fr] lg:px-8">
        <aside className="h-fit rounded-2xl border border-border/70 bg-card/70 p-5 shadow-sm lg:sticky lg:top-24">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <SlidersHorizontal className="size-4" /> Filters
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>

          <label className="mb-5 block space-y-2">
            <span className="text-sm font-medium text-foreground">Search</span>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Name, Web3, API..."
                className="pl-9"
              />
            </div>
          </label>

          <div className="mb-6 space-y-3">
            <p className="text-sm font-medium text-foreground">Skills</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {data.skills.map((skill) => (
                <label key={skill} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Checkbox checked={selectedSkills.includes(skill)} onCheckedChange={() => toggleSkill(skill)} />
                  {skill}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Minimum rating</p>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  type="button"
                  variant={minimumRating === rating ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setMinimumRating(minimumRating === rating ? 0 : rating)
                    setPage(1)
                  }}
                  aria-label={`${rating} star minimum`}
                >
                  {rating}★
                </Button>
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-5">
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border/70 bg-card/70 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm text-muted-foreground">Showing</p>
              <p className="font-semibold text-foreground">
                {data.pagination.totalItems} freelancer{data.pagination.totalItems === 1 ? '' : 's'} found
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </p>
          </div>

          {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

          {loading ? (
            <LoadingCards />
          ) : data.freelancers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
              <Users className="mx-auto mb-4 size-10 text-muted-foreground" />
              <h2 className="text-xl font-semibold text-foreground">No freelancers match your filters</h2>
              <p className="mt-2 text-muted-foreground">Try removing a skill, lowering the rating, or searching a different keyword.</p>
              <Button className="mt-5" onClick={clearFilters}>Reset search</Button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {data.freelancers.map((freelancer) => (
                <Card key={freelancer.id} className="border-border/70 bg-card/80 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <CardHeader>
                    <div className="flex items-start gap-4">
                      <Image src={freelancer.profileImage} alt="" width={64} height={64} className="size-16 rounded-full border border-border object-cover" />
                      <div className="min-w-0">
                        <CardTitle className="text-lg">{freelancer.name}</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">{freelancer.title}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RatingStars rating={freelancer.rating} />
                    <p className="line-clamp-3 text-sm text-muted-foreground">{freelancer.bio}</p>
                    <div className="flex flex-wrap gap-2">
                      {freelancer.skills.map((skill) => (
                        <Badge key={skill} variant="secondary" className="rounded-full">{skill}</Badge>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Projects</p>
                        <p className="font-semibold text-foreground">{freelancer.completedProjects}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Rate</p>
                        <p className="font-semibold text-foreground">${freelancer.hourlyRate}/hr</p>
                      </div>
                    </div>
                    <Button className="w-full" variant="outline">View details</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between rounded-2xl border border-border/70 bg-card/70 p-4">
            <Button variant="outline" disabled={loading || data.pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">{data.pagination.totalItems} total results</span>
            <Button variant="outline" disabled={loading || data.pagination.page >= data.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>
              Next
            </Button>
          </div>
        </div>
      </section>
      <Footer />
    </main>
  )
}
