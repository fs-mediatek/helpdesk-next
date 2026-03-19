'use client'
import { useState, useEffect } from 'react'
import { Monitor, Plus, Search, Loader2 } from 'lucide-react'

// Minimal UI - uses Tailwind classes from the host app
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-card text-card-foreground shadow-sm ${className}`}>{children}</div>
}

const ASSET_TYPES = ['Laptop', 'Desktop', 'Monitor', 'Drucker', 'Telefon', 'Tablet', 'Server', 'Netzwerk', 'Sonstiges']

const statusConfig: Record<string, { label: string; color: string }> = {
  available:    { label: 'Verfügbar',   color: 'bg-emerald-500/10 text-emerald-600' },
  assigned:     { label: 'Zugewiesen',  color: 'bg-blue-500/10 text-blue-600' },
  maintenance:  { label: 'Wartung',     color: 'bg-amber-500/10 text-amber-600' },
  retired:      { label: 'Ausgemustert',color: 'bg-gray-500/10 text-gray-500' },
}

function AssetsList() {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ asset_tag: '', type: 'Laptop', brand: '', model: '', serial_number: '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/api/plugins/assets')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d)) {
          setAssets(d)
        } else {
          setError(d.error || 'Unbekannter Fehler beim Laden')
          setAssets([])
        }
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }
  useEffect(load, [])

  const filtered = assets.filter(a =>
    !search || [a.asset_tag, a.brand, a.model, a.serial_number, a.assigned_to_name]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  )

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/plugins/assets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error || `Fehler ${res.status}`)
        setSaving(false)
        return
      }
      setShowNew(false)
      setForm({ asset_tag: '', type: 'Laptop', brand: '', model: '', serial_number: '' })
      load()
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assets</h1>
          <p className="text-muted-foreground text-sm mt-0.5">IT-Hardware verwalten</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> Neues Asset
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          placeholder="Assets suchen..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-200 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          API-Fehler: {error}
        </div>
      )}

      <Card>
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Monitor className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Keine Assets gefunden</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {['Asset-Tag','Typ','Marke / Modell','Seriennummer','Status','Zugewiesen an'].map(h => (
                    <th key={h} className="h-10 px-4 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a: any) => {
                  const s = statusConfig[a.status] || { label: a.status, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={a.id} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{a.asset_tag}</td>
                      <td className="px-4 py-3">{a.type}</td>
                      <td className="px-4 py-3">{[a.brand, a.model].filter(Boolean).join(' ') || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{a.serial_number || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{a.assigned_to_name || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* New Asset Dialog */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowNew(false)}>
          <div className="bg-card rounded-2xl border p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Neues Asset</h2>
            <form onSubmit={create} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Asset-Tag *</label>
                  <input required value={form.asset_tag} onChange={e => setForm(f => ({ ...f, asset_tag: e.target.value }))}
                    className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium">Typ *</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                    className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Marke</label>
                  <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                    className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium">Modell</label>
                  <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                    className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Seriennummer</label>
                <input value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                  className="mt-1 flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </div>
              {saveError && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  {saveError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowNew(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent">Abbrechen</button>
                <button type="submit" disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Speichere...</> : 'Erstellen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export function AssetsPage({ slug }: { slug: string[] }) {
  const page = slug[0] || ''
  if (page === 'inventory') return <div className="space-y-5"><h1 className="text-2xl font-bold">Inventar</h1><p className="text-muted-foreground">Lagerverwaltung — coming soon</p></div>
  if (page === 'suppliers') return <div className="space-y-5"><h1 className="text-2xl font-bold">Lieferanten</h1><p className="text-muted-foreground">Lieferantenverwaltung — coming soon</p></div>
  return <AssetsList />
}
