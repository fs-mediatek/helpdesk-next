'use client'

import { useEffect, useState, useCallback } from 'react'
import { Wifi, Plus, Trash2, RefreshCw, Server, Router, Printer, Monitor, Camera, HelpCircle, Loader2, X } from 'lucide-react'

// ---- Types ----
interface NetworkDevice {
  id: number
  name: string
  ip_address: string
  type: 'router' | 'switch' | 'server' | 'printer' | 'camera' | 'other'
  description: string | null
  is_monitored: number
  created_at: string
  last_status: 'up' | 'down' | 'timeout' | null
  last_response_time: number | null
  last_check: string | null
}

interface DeviceStat {
  device_id: number
  name: string
  uptime_24h: string | null
  uptime_7d: string | null
}

interface PingResult {
  status: 'up' | 'down' | 'timeout'
  response_time_ms: number | null
}

// ---- Helpers ----
const typeLabels: Record<string, string> = {
  router: 'Router',
  switch: 'Switch',
  server: 'Server',
  printer: 'Drucker',
  camera: 'Kamera',
  other: 'Sonstiges',
}

const typeIcons: Record<string, React.ReactNode> = {
  router: <Router className="w-4 h-4" />,
  switch: <Wifi className="w-4 h-4" />,
  server: <Server className="w-4 h-4" />,
  printer: <Printer className="w-4 h-4" />,
  camera: <Camera className="w-4 h-4" />,
  other: <HelpCircle className="w-4 h-4" />,
}

function StatusDot({ status }: { status: 'up' | 'down' | 'timeout' | null }) {
  const colors: Record<string, string> = {
    up: 'bg-emerald-500',
    down: 'bg-red-500',
    timeout: 'bg-amber-500',
  }
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${status && colors[status] ? colors[status] : 'bg-muted-foreground/30'}`} />
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `vor ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `vor ${hrs}h`
  return `vor ${Math.floor(hrs / 24)}d`
}

function UptimeBadge({ value, label }: { value: string | null; label: string }) {
  if (!value) return null
  const num = parseFloat(value)
  const color = num >= 99
    ? 'bg-emerald-500/10 text-emerald-600'
    : num >= 95
    ? 'bg-amber-500/10 text-amber-600'
    : 'bg-red-500/10 text-red-600'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${color}`}>
      {label}: {value}%
    </span>
  )
}

const inputClass = 'flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

// ---- Add/Edit Modal ----
interface DeviceFormProps {
  device?: NetworkDevice | null
  onClose: () => void
  onSaved: () => void
  pluginBase: string
}

function DeviceFormModal({ device, onClose, onSaved, pluginBase }: DeviceFormProps) {
  const [name, setName] = useState(device?.name ?? '')
  const [ip, setIp] = useState(device?.ip_address ?? '')
  const [type, setType] = useState(device?.type ?? 'other')
  const [description, setDescription] = useState(device?.description ?? '')
  const [isMonitored, setIsMonitored] = useState(device ? !!device.is_monitored : true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim() || !ip.trim()) {
      setError('Name und IP-Adresse sind erforderlich')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = device ? `${pluginBase}/devices/${device.id}` : `${pluginBase}/devices`
      const method = device ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ip_address: ip, type, description, is_monitored: isMonitored }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Fehler beim Speichern')
      onSaved()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card rounded-2xl border shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{device ? 'Gerät bearbeiten' : 'Neues Gerät'}</h2>
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
              <input type="text" className={inputClass} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">IP-Adresse *</label>
              <input type="text" className={inputClass} value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Typ</label>
            <select className={inputClass} value={type} onChange={e => setType(e.target.value as any)}>
              {Object.entries(typeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Beschreibung</label>
            <input type="text" className={inputClass} value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isMonitored}
              onChange={e => setIsMonitored(e.target.checked)}
              className="rounded accent-primary"
            />
            <span>Monitoring aktiv</span>
          </label>
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
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Speichern...</> : device ? 'Speichern' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----
export default function NetworkPage({ slug }: { slug: string[] }) {
  void slug
  const pluginBase = '/api/plugins/network-monitor'

  const [devices, setDevices] = useState<NetworkDevice[]>([])
  const [stats, setStats] = useState<Map<number, DeviceStat>>(new Map())
  const [loading, setLoading] = useState(true)
  const [pingingId, setPingingId] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editDevice, setEditDevice] = useState<NetworkDevice | null>(null)
  const [pingMessages, setPingMessages] = useState<Map<number, string>>(new Map())

  const fetchData = useCallback(async () => {
    try {
      const [devRes, statsRes] = await Promise.all([
        fetch(`${pluginBase}/devices`).then(r => r.json()),
        fetch(`${pluginBase}/stats`).then(r => r.json()),
      ])
      if (devRes.success) setDevices(devRes.data)
      if (statsRes.success) {
        const map = new Map<number, DeviceStat>()
        for (const s of statsRes.data) map.set(s.device_id, s)
        setStats(map)
      }
    } catch (e) {
      console.error('Failed to load network data', e)
    } finally {
      setLoading(false)
    }
  }, [pluginBase])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handlePing = async (device: NetworkDevice) => {
    setPingingId(device.id)
    try {
      const res = await fetch(`${pluginBase}/devices/${device.id}/ping`, { method: 'POST' })
      const data: { success: boolean; data?: PingResult; error?: string } = await res.json()
      if (data.success && data.data) {
        const r = data.data
        const msg = r.status === 'up'
          ? `Online (${r.response_time_ms}ms)`
          : r.status === 'down' ? 'Offline' : 'Timeout'
        setPingMessages(prev => new Map(prev).set(device.id, msg))
        setDevices(prev =>
          prev.map(d =>
            d.id === device.id
              ? { ...d, last_status: r.status, last_response_time: r.response_time_ms, last_check: new Date().toISOString() }
              : d
          )
        )
        setTimeout(() => {
          setPingMessages(prev => { const next = new Map(prev); next.delete(device.id); return next })
        }, 5000)
      }
    } catch { /* ignore */ } finally {
      setPingingId(null)
    }
  }

  const handleDelete = async (device: NetworkDevice) => {
    if (!confirm(`Gerät "${device.name}" wirklich löschen?`)) return
    await fetch(`${pluginBase}/devices/${device.id}`, { method: 'DELETE' })
    setDevices(prev => prev.filter(d => d.id !== device.id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const online  = devices.filter(d => d.last_status === 'up').length
  const offline = devices.filter(d => d.last_status === 'down').length
  const unknown = devices.filter(d => !d.last_status || d.last_status === 'timeout').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wifi className="w-6 h-6 text-primary" />
            Netzwerk-Monitor
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Verfügbarkeit der Infrastrukturgeräte</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Aktualisieren
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Gerät hinzufügen
          </button>
        </div>
      </div>

      {/* Status Summary */}
      {devices.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border bg-card p-5 text-center shadow-sm">
            <div className="text-3xl font-bold text-emerald-600">{online}</div>
            <div className="text-sm text-muted-foreground mt-1">Online</div>
          </div>
          <div className="rounded-xl border bg-card p-5 text-center shadow-sm">
            <div className="text-3xl font-bold text-red-600">{offline}</div>
            <div className="text-sm text-muted-foreground mt-1">Offline</div>
          </div>
          <div className="rounded-xl border bg-card p-5 text-center shadow-sm">
            <div className="text-3xl font-bold text-foreground">{unknown}</div>
            <div className="text-sm text-muted-foreground mt-1">Unbekannt</div>
          </div>
        </div>
      )}

      {/* Devices Table */}
      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed text-muted-foreground">
          <Wifi className="w-10 h-10 mb-3 opacity-30" />
          <p className="font-medium">Keine Geräte konfiguriert</p>
          <p className="text-sm mt-1">Fügen Sie Netzwerkgeräte hinzu, um deren Verfügbarkeit zu überwachen.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Erstes Gerät hinzufügen
          </button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                {['Gerät','IP-Adresse','Typ','Status','Uptime','Letzter Check',''].map((h, i) => (
                  <th key={i} className="h-10 px-4 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map(device => {
                const stat = stats.get(device.id)
                const pingMsg = pingMessages.get(device.id)
                return (
                  <tr key={device.id} className="border-b hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{typeIcons[device.type] ?? typeIcons.other}</span>
                        <div>
                          <div className="font-medium">{device.name}</div>
                          {device.description && (
                            <div className="text-xs text-muted-foreground">{device.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{device.ip_address}</td>
                    <td className="px-4 py-3 text-muted-foreground">{typeLabels[device.type] ?? device.type}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusDot status={device.last_status} />
                        <span className={
                          device.last_status === 'up' ? 'text-emerald-600'
                          : device.last_status === 'down' ? 'text-red-600'
                          : device.last_status === 'timeout' ? 'text-amber-600'
                          : 'text-muted-foreground'
                        }>
                          {device.last_status === 'up'
                            ? `Online${device.last_response_time ? ` (${device.last_response_time}ms)` : ''}`
                            : device.last_status === 'down' ? 'Offline'
                            : device.last_status === 'timeout' ? 'Timeout'
                            : 'Unbekannt'}
                        </span>
                        {pingMsg && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                            {pingMsg}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <UptimeBadge value={stat?.uptime_24h ?? null} label="24h" />
                        <UptimeBadge value={stat?.uptime_7d ?? null} label="7d" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {device.last_check ? timeAgo(device.last_check) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handlePing(device)}
                          disabled={pingingId === device.id}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground disabled:opacity-40"
                          title="Ping"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${pingingId === device.id ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                          onClick={() => setEditDevice(device)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                          title="Bearbeiten"
                        >
                          <Monitor className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(device)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors"
                          title="Löschen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(showAddModal || editDevice) && (
        <DeviceFormModal
          device={editDevice}
          pluginBase={pluginBase}
          onClose={() => { setShowAddModal(false); setEditDevice(null) }}
          onSaved={() => { setShowAddModal(false); setEditDevice(null); fetchData() }}
        />
      )}
    </div>
  )
}
