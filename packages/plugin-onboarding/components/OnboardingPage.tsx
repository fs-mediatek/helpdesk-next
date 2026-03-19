'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  UserPlus,
  LogOut,
  LayoutDashboard,
  Users,
  CheckSquare,
  Loader2,
  ChevronRight,
  X,
  RefreshCw,
} from 'lucide-react'

type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
type RequestType = 'onboarding' | 'offboarding'

interface OnboardingRequest {
  id: number
  type: RequestType
  employee_name: string
  employee_email: string | null
  department: string | null
  start_date: string | null
  end_date: string | null
  status: RequestStatus
  assigned_to_id: number | null
  assigned_to_name: string | null
  notes: string | null
  created_by_id: number | null
  created_at: string
  updated_at: string
  checklist?: ChecklistItem[]
}

interface ChecklistItem {
  id: number
  request_id: number
  item: string
  done: number
  done_by_id: number | null
  done_at: string | null
}

interface Stats {
  total_onboarding: number
  total_offboarding: number
  active: number
  completed_this_month: number
}

const statusLabels: Record<RequestStatus, string> = {
  pending: 'Ausstehend',
  in_progress: 'In Bearbeitung',
  completed: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
}

const statusColors: Record<RequestStatus, string> = {
  pending:     'bg-amber-500/10 text-amber-600',
  in_progress: 'bg-blue-500/10 text-blue-600',
  completed:   'bg-emerald-500/10 text-emerald-600',
  cancelled:   'bg-gray-500/10 text-gray-500',
}

function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[status]}`}>
      {statusLabels[status]}
    </span>
  )
}

function TypeBadge({ type }: { type: RequestType }) {
  return type === 'onboarding' ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-600">
      <UserPlus className="w-3 h-3" /> Onboarding
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-rose-500/10 text-rose-600">
      <LogOut className="w-3 h-3" /> Offboarding
    </span>
  )
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{done}/{total}</span>
    </div>
  )
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  return new Date(dateStr).toLocaleDateString('de-DE')
}

const inputClass = 'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

// ---- Request Form Modal ----
interface RequestFormProps {
  type: RequestType
  onClose: () => void
  onSaved: () => void
  pluginBase: string
}

function RequestFormModal({ type, onClose, onSaved, pluginBase }: RequestFormProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [departments, setDepartments] = useState<{ id: number; name: string; display_name?: string }[]>([])
  const [startDate, setStartDate] = useState('')

  useEffect(() => {
    fetch('/api/departments').then(r => r.json()).then(d => setDepartments(Array.isArray(d) ? d : [])).catch(() => {})
  }, [])
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) { setError('Mitarbeitername ist erforderlich'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          employee_name: name,
          employee_email: email || null,
          department: department || null,
          start_date: startDate || null,
          end_date: endDate || null,
          notes: notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fehler beim Erstellen')
      // Navigate to detail page
      window.location.href = `/onboarding/${data.id}`
      return
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const isOnboarding = type === 'onboarding'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl border shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {isOnboarding
              ? <UserPlus className="w-5 h-5 text-emerald-500" />
              : <LogOut className="w-5 h-5 text-rose-500" />}
            {isOnboarding ? 'Neues Onboarding' : 'Neues Offboarding'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-200 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Name *</label>
              <input type="text" className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Max Mustermann" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">E-Mail</label>
              <input type="email" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} placeholder="max@firma.de" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Abteilung</label>
              <select className={inputClass} value={department} onChange={e => setDepartment(e.target.value)}>
                <option value="">— Auswählen —</option>
                {departments.map(d => <option key={d.id} value={d.name}>{d.display_name || d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                {isOnboarding ? 'Startdatum' : 'Letzter Arbeitstag'}
              </label>
              <input type="date" className={inputClass} value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          </div>
          {isOnboarding && (
            <div>
              <label className="text-sm font-medium mb-1 block">Enddatum (optional)</label>
              <input type="date" className={inputClass} value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block">Notizen</label>
            <textarea
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Weitere Hinweise..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors">
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Erstelle...</> : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Detail Panel ----
interface DetailPanelProps {
  request: OnboardingRequest
  onClose: () => void
  onRefresh: () => void
  pluginBase: string
}

function DetailPanel({ request, onClose, onRefresh, pluginBase }: DetailPanelProps) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(request.checklist ?? [])
  const [toggling, setToggling] = useState<number | null>(null)
  const [status, setStatus] = useState<RequestStatus>(request.status)
  const [saving, setSaving] = useState(false)

  const doneCount = checklist.filter(c => c.done).length

  const toggleItem = async (item: ChecklistItem) => {
    setToggling(item.id)
    try {
      const res = await fetch(`${pluginBase}/${request.id}/checklist/${item.id}/toggle`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setChecklist(prev => prev.map(c => c.id === item.id ? data.data : c))
      }
    } catch { /* ignore */ } finally {
      setToggling(null)
    }
  }

  const saveStatus = async () => {
    setSaving(true)
    try {
      await fetch(`${pluginBase}/${request.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      onRefresh()
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl border shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TypeBadge type={request.type} />
              <StatusBadge status={request.status} />
            </div>
            <h2 className="text-lg font-semibold">{request.employee_name}</h2>
            {request.department && <p className="text-sm text-muted-foreground">{request.department}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {request.employee_email && (
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">E-Mail</div>
                <div className="text-foreground">{request.employee_email}</div>
              </div>
            )}
            {request.start_date && (
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">
                  {request.type === 'onboarding' ? 'Startdatum' : 'Letzter Arbeitstag'}
                </div>
                <div className="font-medium">{fmtDate(request.start_date)}</div>
              </div>
            )}
            {request.assigned_to_name && (
              <div>
                <div className="text-xs text-muted-foreground mb-0.5">Zugewiesen an</div>
                <div className="text-foreground">{request.assigned_to_name}</div>
              </div>
            )}
          </div>

          {request.notes && (
            <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-foreground">{request.notes}</div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">Checkliste</span>
              <span className="text-xs text-muted-foreground">{doneCount}/{checklist.length}</span>
            </div>
            <ProgressBar done={doneCount} total={checklist.length} />
          </div>

          {checklist.length > 0 ? (
            <div className="space-y-1">
              {checklist.map(item => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${item.done ? 'opacity-60' : ''}`}
                >
                  <div className="mt-0.5">
                    {toggling === item.id ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : (
                      <input
                        type="checkbox"
                        checked={!!item.done}
                        onChange={() => toggleItem(item)}
                        className="w-4 h-4 rounded accent-primary"
                      />
                    )}
                  </div>
                  <span className={`text-sm ${item.done ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {item.item}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">Keine Checklistenpunkte</p>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium whitespace-nowrap">Status:</label>
              <select
                className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={status}
                onChange={e => setStatus(e.target.value as RequestStatus)}
              >
                {(Object.keys(statusLabels) as RequestStatus[]).map(s => (
                  <option key={s} value={s}>{statusLabels[s]}</option>
                ))}
              </select>
              <button
                onClick={saveStatus}
                disabled={saving || status === request.status}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 whitespace-nowrap transition-colors"
              >
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Speichern...</> : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Requests Table ----
interface RequestsTableProps {
  requests: OnboardingRequest[]
  onSelect: (req: OnboardingRequest) => void
  loading: boolean
}

function RequestsTable({ requests, onSelect, loading }: RequestsTableProps) {
  const navigateToDetail = (req: OnboardingRequest) => {
    window.location.href = `/onboarding/${req.id}`
  }
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Users className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">Keine Einträge</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {['Name','Abteilung','Startdatum','Status','Zugewiesen','Fortschritt',''].map((h, i) => (
              <th key={i} className="h-10 px-4 text-left font-medium text-muted-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {requests.map(req => {
            const cl = req.checklist ?? []
            const done = cl.filter(c => c.done).length
            return (
              <tr
                key={req.id}
                className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => navigateToDetail(req)}
              >
                <td className="px-4 py-3 font-medium">{req.employee_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{req.department ?? '\u2014'}</td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDate(req.start_date)}</td>
                <td className="px-4 py-3"><StatusBadge status={req.status} /></td>
                <td className="px-4 py-3 text-muted-foreground">{req.assigned_to_name ?? '\u2014'}</td>
                <td className="px-4 py-3 w-40">
                  {cl.length > 0 ? (
                    <ProgressBar done={done} total={cl.length} />
                  ) : (
                    <span className="text-xs text-muted-foreground">\u2014</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <ChevronRight className="w-4 h-4" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- Stat Card ----
function StatCard({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className={`text-3xl font-bold ${color ?? 'text-foreground'}`}>{value}</div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  )
}

// ---- Settings Page ----
function OnboardingSettings() {
  const OPT_TYPES = [
    { type: "status", label: "Status-Werte", desc: "z.B. Neueinstellung, Versetzung, Praktikum" },
    { type: "jobtitel", label: "Jobbezeichnungen", desc: "z.B. Sozialpädagoge, Erzieher" },
    { type: "massnahme", label: "Maßnahmen / Projekte", desc: "z.B. Projektname, Maßnahmenbezeichnung" },
  ]
  const [options, setOptions] = useState<Record<string, any[]>>({})
  const [phonePrefix, setPhonePrefix] = useState("03641 806")
  const [newValues, setNewValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const inp = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  useEffect(() => {
    fetch("/api/onboarding/options").then(r => r.json()).then(data => {
      const opts: Record<string, any[]> = {}
      for (const t of OPT_TYPES) opts[t.type] = data[t.type] || []
      setOptions(opts)
      if (data._phone_prefix) setPhonePrefix(data._phone_prefix)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const addOpt = async (type: string) => {
    const val = newValues[type]?.trim()
    if (!val) return
    await fetch("/api/onboarding/options", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, value: val }) })
    setNewValues(v => ({ ...v, [type]: "" }))
    const data = await fetch(`/api/onboarding/options?type=${type}`).then(r => r.json())
    setOptions(o => ({ ...o, [type]: data }))
  }

  const removeOpt = async (type: string, id: number) => {
    await fetch("/api/onboarding/options", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    setOptions(o => ({ ...o, [type]: o[type].filter(x => x.id !== id) }))
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Onboarding — Konfiguration</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Dropdown-Werte und Einstellungen für das Onboarding-Formular</p>
      </div>

      {/* Phone prefix */}
      <div className="rounded-xl border bg-card shadow-sm p-5">
        <div className="flex items-center gap-2 mb-1"><span className="text-sm font-semibold">Rufnummern-Prefix</span></div>
        <p className="text-xs text-muted-foreground mb-3">Wird im Formular vor der Nebenstelle angezeigt.</p>
        <div className="flex gap-2">
          <input className={inp + " max-w-[200px] font-mono"} value={phonePrefix} onChange={e => setPhonePrefix(e.target.value)} placeholder="03641 806" />
          <button onClick={async () => { await fetch("/api/onboarding/options", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone_prefix: phonePrefix }) }) }}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
            Speichern
          </button>
        </div>
      </div>

      {/* Option lists */}
      {OPT_TYPES.map(ot => (
        <div key={ot.type} className="rounded-xl border bg-card shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">{ot.label}</span>
            <span className="text-xs text-muted-foreground">{options[ot.type]?.length || 0} Einträge</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">{ot.desc}</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(options[ot.type] || []).map((o: any) => (
              <div key={o.id} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-3 py-1 text-sm">
                <span>{o.value}</span>
                <button onClick={() => removeOpt(ot.type, o.id)} className="text-muted-foreground/40 hover:text-red-500 transition-colors"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {(options[ot.type] || []).length === 0 && <span className="text-xs text-muted-foreground italic">Keine Einträge</span>}
          </div>
          <div className="flex gap-2">
            <input className={inp} value={newValues[ot.type] || ""} onChange={e => setNewValues(v => ({ ...v, [ot.type]: e.target.value }))}
              placeholder="Neuen Eintrag hinzufügen..." onKeyDown={e => { if (e.key === "Enter") addOpt(ot.type) }} />
            <button disabled={!newValues[ot.type]?.trim()} onClick={() => addOpt(ot.type)}
              className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-40 transition-colors">
              <span className="text-lg leading-none">+</span>
            </button>
          </div>
        </div>
      ))}

      {/* Equipment Presets */}
      <EquipmentPresetsEditor />
    </div>
  )
}

// ---- Equipment Presets Editor ----
function EquipmentPresetsEditor() {
  const [presets, setPresets] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [departments, setDepartments] = useState<any[]>([])
  const [jobTitles, setJobTitles] = useState<any[]>([])
  const [editing, setEditing] = useState<any | null>(null)
  const [loaded, setLoaded] = useState(false)
  const inp = "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  useEffect(() => {
    Promise.all([
      fetch("/api/onboarding/equipment?all=1").then(r => r.json()).catch(() => []),
      fetch("/api/catalog").then(r => r.json()).catch(() => []),
      fetch("/api/departments").then(r => r.json()).catch(() => []),
      fetch("/api/onboarding/options?type=jobtitel").then(r => r.json()).catch(() => []),
    ]).then(([p, cat, deps, jt]) => {
      setPresets(Array.isArray(p) ? p : [])
      setProducts(Array.isArray(cat) ? cat : [])
      setDepartments(Array.isArray(deps) ? deps : [])
      setJobTitles(Array.isArray(jt) ? jt : [])
      setLoaded(true)
    })
  }, [])

  const reload = () => fetch("/api/onboarding/equipment?all=1").then(r => r.json()).then(d => setPresets(Array.isArray(d) ? d : []))

  const savePreset = async (preset: any) => {
    const method = preset.id ? "PUT" : "POST"
    await fetch("/api/onboarding/equipment", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(preset) })
    setEditing(null)
    reload()
  }

  const deletePreset = async (id: number) => {
    if (!confirm("Preset löschen?")) return
    await fetch("/api/onboarding/equipment", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
    reload()
  }

  const toggleProduct = (productId: number) => {
    if (!editing) return
    const ids: number[] = editing.product_ids || []
    const next = ids.includes(productId) ? ids.filter((i: number) => i !== productId) : [...ids, productId]
    setEditing({ ...editing, product_ids: next })
  }

  if (!loaded) return null

  return (
    <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Ausstattungs-Vorlagen</p>
          <p className="text-xs text-muted-foreground">Vorschläge für technische Ausstattung basierend auf Abteilung und Position</p>
        </div>
        <button onClick={() => setEditing({ name: "", match_department: "", match_job_title: "", product_ids: [], is_default: false })}
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
          <span className="text-lg leading-none">+</span> Neue Vorlage
        </button>
      </div>

      {/* Existing presets */}
      {presets.map(p => {
        const pIds: number[] = typeof p.product_ids === "string" ? JSON.parse(p.product_ids) : (p.product_ids || [])
        const pNames = pIds.map(id => products.find(pr => pr.id === id)).filter(Boolean)
        return (
          <div key={p.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{p.name}</span>
                {p.is_default ? <span className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5">Standard</span> : null}
              </div>
              <div className="flex gap-1">
                <button onClick={() => setEditing({ ...p, product_ids: pIds })} className="p-1 rounded hover:bg-muted text-muted-foreground"><span className="text-xs">Bearbeiten</span></button>
                <button onClick={() => deletePreset(p.id)} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground mb-2">
              {p.match_department && <span>Abteilung: {p.match_department}</span>}
              {p.match_job_title && <span>Position: {p.match_job_title}</span>}
              {!p.match_department && !p.match_job_title && <span>Gilt für alle</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {pNames.map((pr: any) => (
                <span key={pr.id} className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2 py-0.5 text-xs">
                  {pr.emoji || "📦"} {pr.name}
                </span>
              ))}
              {pNames.length === 0 && <span className="text-xs text-muted-foreground italic">Keine Produkte</span>}
            </div>
          </div>
        )
      })}

      {/* Edit/Create form */}
      {editing && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
          <p className="text-sm font-semibold">{editing.id ? "Vorlage bearbeiten" : "Neue Vorlage"}</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Name *</label>
              <input className={inp} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="z.B. IT-Arbeitsplatz" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Abteilung (Filter)</label>
              <select className={inp} value={editing.match_department || ""} onChange={e => setEditing({ ...editing, match_department: e.target.value })}>
                <option value="">Alle</option>
                {departments.map((d: any) => <option key={d.id} value={d.name}>{d.display_name || d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Position (Filter)</label>
              <select className={inp} value={editing.match_job_title || ""} onChange={e => setEditing({ ...editing, match_job_title: e.target.value })}>
                <option value="">Alle</option>
                {jobTitles.map((j: any) => <option key={j.id} value={j.value}>{j.value}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editing.is_default || false} onChange={e => setEditing({ ...editing, is_default: e.target.checked })} className="rounded" />
            Standard-Vorlage (wenn keine spezifische passt)
          </label>
          <div>
            <label className="text-xs font-medium mb-2 block">Produkte aus dem Katalog</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
              {products.map((pr: any) => {
                const selected = (editing.product_ids || []).includes(pr.id)
                return (
                  <button key={pr.id} type="button" onClick={() => toggleProduct(pr.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all ${
                      selected ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "hover:border-muted-foreground/30"
                    }`}>
                    <span className="text-lg">{pr.emoji || "📦"}</span>
                    <span className={selected ? "font-medium" : "text-muted-foreground"}>{pr.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(null)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent transition-colors">Abbrechen</button>
            <button onClick={() => savePreset(editing)} disabled={!editing.name?.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors">
              Speichern
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Main Page ----
export default function OnboardingPage({ slug }: { slug: string[] }) {
  // Settings route
  if (slug?.[0] === 'settings') return <OnboardingSettings />

  const pluginBase = '/api/plugins/onboarding'

  // Route slug to initial tab
  const initialTab = slug?.[0] === 'onboarding' ? 'onboarding' as const
    : slug?.[0] === 'offboarding' ? 'offboarding' as const
    : 'dashboard' as const

  type Tab = 'dashboard' | 'onboarding' | 'offboarding'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [stats, setStats] = useState<Stats | null>(null)
  const [onboardings, setOnboardings] = useState<OnboardingRequest[]>([])
  const [offboardings, setOffboardings] = useState<OnboardingRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<RequestStatus | ''>('')
  const [showForm, setShowForm] = useState<RequestType | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<OnboardingRequest | null>(null)

  const fetchStats = useCallback(async () => {
    const res = await fetch(`${pluginBase}/stats`).then(r => r.json()).catch(() => null)
    if (res?.success) setStats(res.data)
  }, [pluginBase])

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const [onRes, offRes] = await Promise.all([
        fetch(`${pluginBase}/?type=onboarding${filterStatus ? `&status=${filterStatus}` : ''}`).then(r => r.json()),
        fetch(`${pluginBase}/?type=offboarding${filterStatus ? `&status=${filterStatus}` : ''}`).then(r => r.json()),
      ])
      const withChecklist = async (requests: OnboardingRequest[]) =>
        Promise.all(
          requests.map(async req => {
            const cl = await fetch(`${pluginBase}/${req.id}/checklist`).then(r => r.json()).catch(() => ({ success: false, data: [] }))
            return { ...req, checklist: cl.success ? cl.data : [] }
          })
        )
      if (onRes.success) setOnboardings(await withChecklist(onRes.data))
      if (offRes.success) setOffboardings(await withChecklist(offRes.data))
    } finally {
      setLoading(false)
    }
  }, [pluginBase, filterStatus])

  useEffect(() => {
    fetchStats()
    fetchRequests()
  }, [fetchStats, fetchRequests])

  const handleRefresh = () => {
    fetchStats()
    fetchRequests()
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'onboarding', label: 'Onboardings', icon: <UserPlus className="w-4 h-4" /> },
    { id: 'offboarding', label: 'Offboardings', icon: <LogOut className="w-4 h-4" /> },
  ]

  const activeItems = [...onboardings, ...offboardings]
    .filter(r => r.status !== 'completed' && r.status !== 'cancelled')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Onboarding &amp; Offboarding</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Mitarbeiter-Lebenszyklus verwalten</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border hover:bg-accent transition-colors"
            title="Aktualisieren"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <a href="/onboarding/new?type=onboarding"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors">
            <UserPlus className="w-4 h-4" />
            Neues Onboarding
          </a>
          <a href="/onboarding/new?type=offboarding"
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 transition-colors">
            <LogOut className="w-4 h-4" />
            Neues Offboarding
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Dashboard */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5">
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard value={stats.active} label="Aktive Prozesse" />
              <StatCard value={stats.total_onboarding} label="Onboardings gesamt" color="text-emerald-600" />
              <StatCard value={stats.total_offboarding} label="Offboardings gesamt" color="text-rose-600" />
              <StatCard value={stats.completed_this_month} label="Diesen Monat abgeschlossen" color="text-primary" />
            </div>
          )}

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b bg-muted/30">
              <h2 className="text-sm font-semibold">Aktuelle Einträge</h2>
            </div>
            {activeItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CheckSquare className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Keine aktiven Prozesse</p>
              </div>
            ) : (
              <div className="divide-y">
                {activeItems.map(req => {
                  const cl = req.checklist ?? []
                  const done = cl.filter(c => c.done).length
                  return (
                    <div
                      key={req.id}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedRequest(req)}
                    >
                      <TypeBadge type={req.type} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{req.employee_name}</div>
                        <div className="text-xs text-muted-foreground">{req.department ?? ''} {req.department && req.start_date ? '·' : ''} {fmtDate(req.start_date)}</div>
                      </div>
                      <StatusBadge status={req.status} />
                      {cl.length > 0 && (
                        <div className="w-24">
                          <ProgressBar done={done} total={cl.length} />
                        </div>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Onboarding list */}
      {activeTab === 'onboarding' && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">Onboardings</h2>
            <select
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as RequestStatus | '')}
            >
              <option value="">Alle Status</option>
              {(Object.keys(statusLabels) as RequestStatus[]).map(s => (
                <option key={s} value={s}>{statusLabels[s]}</option>
              ))}
            </select>
          </div>
          <RequestsTable requests={onboardings} onSelect={setSelectedRequest} loading={loading} />
        </div>
      )}

      {/* Offboarding list */}
      {activeTab === 'offboarding' && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">Offboardings</h2>
            <select
              className="h-8 rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as RequestStatus | '')}
            >
              <option value="">Alle Status</option>
              {(Object.keys(statusLabels) as RequestStatus[]).map(s => (
                <option key={s} value={s}>{statusLabels[s]}</option>
              ))}
            </select>
          </div>
          <RequestsTable requests={offboardings} onSelect={setSelectedRequest} loading={loading} />
        </div>
      )}

      {showForm && (
        <RequestFormModal
          type={showForm}
          pluginBase={pluginBase}
          onClose={() => setShowForm(null)}
          onSaved={() => { setShowForm(null); handleRefresh() }}
        />
      )}

      {selectedRequest && (
        <DetailPanel
          request={selectedRequest}
          pluginBase={pluginBase}
          onClose={() => setSelectedRequest(null)}
          onRefresh={() => { setSelectedRequest(null); handleRefresh() }}
        />
      )}
    </div>
  )
}
