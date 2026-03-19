'use client'
import { useState, useEffect, useCallback } from 'react'
import { Server, Database, HardDrive, Loader2, Trash2, Download, RefreshCw } from 'lucide-react'

type SystemInfo = {
  appVersion: string
  nodeVersion: string
  platform: string
  uptime: number
  memory: {
    rss: number
    heapUsed: number
    heapTotal: number
    external: number
  }
}

type BackupFile = {
  name: string
  size: number
  date: string
}

type DbResult = {
  table: string
  status: string
}

const TABS = [
  { id: 'system', label: 'System', icon: Server },
  { id: 'database', label: 'Datenbank', icon: Database },
  { id: 'backups', label: 'Backups', icon: HardDrive },
] as const

type TabId = (typeof TABS)[number]['id']

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold truncate">{value}</p>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  parts.push(`${m}m`)
  return parts.join(' ')
}

function toMB(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

// ---- System Tab ----
function SystemTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/plugins/system-maintenance/info')
      .then((r) => r.json())
      .then((d) => { setInfo(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (!info) return <p className="text-sm text-muted-foreground py-8 text-center">Keine Daten</p>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <InfoCard label="App-Version" value={`v${info.appVersion}`} />
        <InfoCard label="Node.js" value={info.nodeVersion} />
        <InfoCard label="Platform" value={info.platform} />
        <InfoCard label="Uptime" value={formatUptime(info.uptime)} />
        <InfoCard
          label="Memory (verwendet)"
          value={`${toMB(info.memory.heapUsed)} / ${toMB(info.memory.heapTotal)}`}
        />
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-2">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Memory Details
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">RSS</p>
            <p className="font-medium">{toMB(info.memory.rss)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Heap Used</p>
            <p className="font-medium">{toMB(info.memory.heapUsed)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Heap Total</p>
            <p className="font-medium">{toMB(info.memory.heapTotal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">External</p>
            <p className="font-medium">{toMB(info.memory.external)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Database Tab ----
function DatabaseTab() {
  const [optimizeLoading, setOptimizeLoading] = useState(false)
  const [optimizeResults, setOptimizeResults] = useState<DbResult[] | null>(null)
  const [checkLoading, setCheckLoading] = useState(false)
  const [checkResults, setCheckResults] = useState<DbResult[] | null>(null)

  async function runOptimize() {
    setOptimizeLoading(true)
    setOptimizeResults(null)
    try {
      const res = await fetch('/api/plugins/system-maintenance/db/optimize', { method: 'POST' })
      const data = await res.json()
      setOptimizeResults(data.results ?? [])
    } catch {
      setOptimizeResults([{ table: 'Fehler', status: 'Anfrage fehlgeschlagen' }])
    }
    setOptimizeLoading(false)
  }

  async function runCheck() {
    setCheckLoading(true)
    setCheckResults(null)
    try {
      const res = await fetch('/api/plugins/system-maintenance/db/check', { method: 'POST' })
      const data = await res.json()
      setCheckResults(data.results ?? [])
    } catch {
      setCheckResults([{ table: 'Fehler', status: 'Anfrage fehlgeschlagen' }])
    }
    setCheckLoading(false)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Optimize */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <h3 className="font-semibold">Tabellen optimieren</h3>
        <p className="text-sm text-muted-foreground">
          Führt OPTIMIZE TABLE auf den Kern-Tabellen aus, um die Performance zu verbessern.
        </p>
        <button
          onClick={runOptimize}
          disabled={optimizeLoading}
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          {optimizeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Tabellen optimieren
        </button>
        {optimizeResults && (
          <div className="mt-2 rounded-lg border overflow-auto max-h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Tabelle</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {optimizeResults.map((r) => (
                  <tr key={r.table} className="border-b last:border-0">
                    <td className="px-3 py-1.5 font-mono">{r.table}</td>
                    <td className={`px-3 py-1.5 ${r.status === 'OK' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Check */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
        <h3 className="font-semibold">Tabellenintegrität prüfen</h3>
        <p className="text-sm text-muted-foreground">
          Führt CHECK TABLE aus und zeigt Fehler oder Inkonsistenzen an.
        </p>
        <button
          onClick={runCheck}
          disabled={checkLoading}
          className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          {checkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          Tabellenintegrität prüfen
        </button>
        {checkResults && (
          <div className="mt-2 rounded-lg border overflow-auto max-h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Tabelle</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {checkResults.map((r) => (
                  <tr key={r.table} className="border-b last:border-0">
                    <td className="px-3 py-1.5 font-mono">{r.table}</td>
                    <td className={`px-3 py-1.5 ${r.status === 'OK' ? 'text-emerald-600' : 'text-red-500'}`}>
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- Backups Tab ----
function BackupsTab() {
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/plugins/system-maintenance/backups')
      .then((r) => r.json())
      .then((d) => { setBackups(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function createBackup() {
    setCreating(true)
    try {
      await fetch('/api/plugins/system-maintenance/backup', { method: 'POST' })
      load()
    } finally {
      setCreating(false)
    }
  }

  async function deleteBackup(filename: string) {
    await fetch(`/api/plugins/system-maintenance/backups/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    })
    setConfirmDelete(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Datenbank-Backups</h3>
        <button
          onClick={createBackup}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
          Backup erstellen
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : backups.length === 0 ? (
        <div className="rounded-xl border bg-card py-16 text-center text-muted-foreground text-sm">
          Keine Backups vorhanden
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {['Dateiname', 'Größe', 'Erstellt', 'Aktionen'].map((h) => (
                  <th key={h} className="h-10 px-4 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.name} className="border-b hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs">{b.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatSize(b.size)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(b.date).toLocaleString('de-DE')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          window.open(
                            `/api/plugins/system-maintenance/backups/${encodeURIComponent(b.name)}/download`
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                        title="Herunterladen"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </button>

                      {confirmDelete === b.name ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteBackup(b.name)}
                            className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-600 transition-colors"
                          >
                            Löschen
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                          >
                            Abbruch
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(b.name)}
                          className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          title="Löschen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---- Main Component ----
export function MaintenancePage({ slug }: { slug: string[] }) {
  const [activeTab, setActiveTab] = useState<TabId>('system')

  void slug

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Systemwartung</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Backups, Datenbank und Systeminformationen
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
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

      {activeTab === 'system' && <SystemTab />}
      {activeTab === 'database' && <DatabaseTab />}
      {activeTab === 'backups' && <BackupsTab />}
    </div>
  )
}
