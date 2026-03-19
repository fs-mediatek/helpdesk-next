'use client'
import { useState, useEffect, useCallback } from 'react'
import { BarChart2, Loader2, Download, Users, Tag, TrendingUp, UserCheck, FileText } from 'lucide-react'

type KpiData = {
  total_tickets: number
  open_tickets: number
  resolved_tickets: number
  closed_tickets: number
  avg_resolution_hours: number
  sla_compliance_pct: number | null
  sla_ok: number
  sla_breached: number
  avg_first_response_hours: number
}

type AgentRow = {
  id: number
  name: string
  total_assigned: number
  total_resolved: number
  total_open: number
  avg_resolution_hours: number | null
  sla_met: number
}

type CategoryRow = {
  category: string | null
  count: number
  avg_hours: number | null
}

type VolumeData = {
  created: { period: string; count: number }[]
  resolved: { period: string; count: number }[]
  group: string
}

type RequesterRow = {
  name: string
  email: string
  department: string | null
  location: string | null
  ticket_count: number
}

const TABS = [
  { id: 'overview', label: 'Übersicht', icon: BarChart2 },
  { id: 'agents', label: 'Agenten', icon: Users },
  { id: 'categories', label: 'Kategorien', icon: Tag },
  { id: 'volume', label: 'Volumen', icon: TrendingUp },
  { id: 'requesters', label: 'Anfragende', icon: UserCheck },
] as const

type TabId = (typeof TABS)[number]['id']

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function OverviewTab({ days }: { days: number }) {
  const [kpis, setKpis] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/plugins/ticket-analytics/kpis?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setKpis(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [days])

  if (loading) return <Spinner />
  if (!kpis) return <p className="text-sm text-muted-foreground py-8 text-center">Keine Daten</p>

  const slaColor =
    (kpis.sla_compliance_pct ?? 0) >= 90
      ? 'text-emerald-600'
      : (kpis.sla_compliance_pct ?? 0) >= 70
      ? 'text-amber-500'
      : 'text-red-500'

  const slaTotal = kpis.sla_ok + kpis.sla_breached

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Tickets gesamt" value={kpis.total_tickets} />
        <KpiCard label="Offen" value={kpis.open_tickets} />
        <KpiCard label="Gelöst / Geschl." value={kpis.resolved_tickets + kpis.closed_tickets} />
        <KpiCard label="Ø Lösungszeit" value={`${kpis.avg_resolution_hours}h`} />
        <KpiCard label="Ø Erste Antwort" value={`${kpis.avg_first_response_hours}h`} />
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">SLA-Compliance</p>
          <p className={`mt-1 text-2xl font-bold ${slaColor}`}>
            {kpis.sla_compliance_pct !== null ? `${kpis.sla_compliance_pct}%` : '—'}
          </p>
        </div>
      </div>

      {slaTotal > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-semibold mb-3">SLA-Einhaltung</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${kpis.sla_compliance_pct ?? 0}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground min-w-max">
              {kpis.sla_ok} eingehalten · {kpis.sla_breached} überschritten
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function AgentsTab({ days }: { days: number }) {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/plugins/ticket-analytics/agents?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setAgents(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [days])

  if (loading) return <Spinner />

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {['Name', 'Tickets', 'Gelöst', 'Offen', 'Ø Bearbeitung', 'SLA-Quote'].map((h) => (
              <th key={h} className="h-10 px-4 text-left font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                Keine Agenten-Daten
              </td>
            </tr>
          ) : (
            agents.map((a) => {
              const slaRate =
                a.total_resolved > 0
                  ? Math.round((a.sla_met / a.total_resolved) * 100)
                  : 0
              return (
                <tr key={a.id} className="border-b hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3">{a.total_assigned}</td>
                  <td className="px-4 py-3 text-emerald-600 font-medium">{a.total_resolved}</td>
                  <td className="px-4 py-3">{a.total_open}</td>
                  <td className="px-4 py-3">
                    {a.avg_resolution_hours !== null ? `${a.avg_resolution_hours}h` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            slaRate >= 80
                              ? 'bg-emerald-500'
                              : slaRate >= 50
                              ? 'bg-amber-400'
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${slaRate}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{slaRate}%</span>
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function CategoriesTab({ days }: { days: number }) {
  const [cats, setCats] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/plugins/ticket-analytics/categories?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setCats(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [days])

  if (loading) return <Spinner />

  const maxCount = Math.max(...cats.map((c) => c.count), 1)

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
      <h3 className="font-semibold">Tickets nach Kategorie</h3>
      {cats.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Keine Daten</p>
      ) : (
        cats.map((c) => (
          <div key={c.category ?? 'none'} className="flex items-center gap-3">
            <span className="w-36 shrink-0 text-sm truncate">{c.category || 'Sonstiges'}</span>
            <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((c.count / maxCount) * 100)}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground min-w-max">
              {c.count} · Ø {c.avg_hours !== null ? `${c.avg_hours}h` : '—'}
            </span>
          </div>
        ))
      )}
    </div>
  )
}

function VolumeTab({ days }: { days: number }) {
  const [data, setData] = useState<VolumeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/plugins/ticket-analytics/volume?days=${days}&group=day`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [days])

  if (loading) return <Spinner />
  if (!data) return <p className="text-sm text-muted-foreground py-8 text-center">Keine Daten</p>

  const createdMap: Record<string, number> = {}
  data.created.forEach((d) => { createdMap[d.period] = d.count })
  const resolvedMap: Record<string, number> = {}
  data.resolved.forEach((d) => { resolvedMap[d.period] = d.count })

  const allPeriods = [
    ...new Set([
      ...data.created.map((d) => d.period),
      ...data.resolved.map((d) => d.period),
    ]),
  ].sort()

  const maxVal = Math.max(
    ...allPeriods.map((p) => Math.max(createdMap[p] || 0, resolvedMap[p] || 0)),
    1
  )

  const recent = allPeriods.slice(-30)

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Ticket-Volumen</h3>
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-primary" /> Erstellt
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" /> Gelöst
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex items-end gap-1 min-w-max h-32">
          {recent.map((p) => {
            const c = createdMap[p] || 0
            const r = resolvedMap[p] || 0
            const cH = Math.round((c / maxVal) * 112)
            const rH = Math.round((r / maxVal) * 112)
            const label = p.length > 7 ? p.slice(5) : p
            return (
              <div key={p} className="flex flex-col items-center gap-0.5 w-7">
                <div className="flex items-end gap-px h-28">
                  <div
                    title={`Erstellt: ${c}`}
                    className="w-3 rounded-t bg-primary/80 transition-all"
                    style={{ height: `${cH}px` }}
                  />
                  <div
                    title={`Gelöst: ${r}`}
                    className="w-3 rounded-t bg-emerald-500/80 transition-all"
                    style={{ height: `${rH}px` }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground rotate-45 origin-left whitespace-nowrap mt-1">
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function RequestersTab({ days }: { days: number }) {
  const [data, setData] = useState<RequesterRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/plugins/ticket-analytics/requesters?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setData(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [days])

  if (loading) return <Spinner />

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {['Benutzer', 'E-Mail', 'Abteilung', 'Standort', 'Tickets'].map((h) => (
              <th key={h} className="h-10 px-4 text-left font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                Keine Daten
              </td>
            </tr>
          ) : (
            data.map((r, i) => (
              <tr key={i} className="border-b hover:bg-muted/40 transition-colors">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.department || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.location || '—'}</td>
                <td className="px-4 py-3 font-bold">{r.ticket_count}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function AnalyticsPage({ slug }: { slug: string[] }) {
  const [days, setDays] = useState(30)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  // slug[0] could be a sub-route — ignore for now, single-page analytics
  void slug

  const handleExport = useCallback(() => {
    window.location.href = `/api/plugins/ticket-analytics/export?days=${days}`
  }, [days])

  const handleReport = useCallback(() => {
    window.open(`/api/plugins/ticket-analytics/report?days=${days}`, '_blank')
  }, [days])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Auswertungen & Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ticket-Statistiken und Leistungskennzahlen
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Day range buttons */}
          <div className="flex rounded-lg border overflow-hidden">
            {([7, 30, 90, 365] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  days === d
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-muted text-foreground'
                }`}
              >
                {d === 365 ? '1J' : `${d}T`}
              </button>
            ))}
          </div>
          <button
            onClick={handleReport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Report erstellen
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-xl bg-muted p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && <OverviewTab days={days} />}
      {activeTab === 'agents' && <AgentsTab days={days} />}
      {activeTab === 'categories' && <CategoriesTab days={days} />}
      {activeTab === 'volume' && <VolumeTab days={days} />}
      {activeTab === 'requesters' && <RequestersTab days={days} />}
    </div>
  )
}
