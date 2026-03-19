'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Smartphone, FileText, Building2, BarChart2,
  Plus, Upload, Download, Search, X, Eye, EyeOff,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle,
  CheckCircle2, CircleDot, Trash2, Pencil,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Contract {
  id: number
  phone_number: string
  base_price: number
  connection_costs: number
  discount: number
  total_net: number
  total_gross: number
  cost_center_1: string | null
  cost_center_2: string | null
  active_user: string | null
  device_id: string | null
  intune_registered: string | null
  pin: string | null
  puk: string | null
  pin2: string | null
  puk2: string | null
  second_user: string | null
  second_device_id: string | null
  comment: string | null
  status: string
  created_at: string
  updated_at: string
}

interface HistoryEntry {
  id: number
  field_name: string
  old_value: string
  new_value: string
  changed_at: string
  changed_by_name: string | null
}

interface Invoice {
  id: number
  filename: string
  invoice_month: number | null
  invoice_year: number | null
  total_net: number
  total_gross: number
  line_count: number
  imported_at: string
  imported_by_name: string | null
}

interface InvoiceLine {
  id: number
  phone_number: string
  tariff: string | null
  base_price: number
  discount: number
  total_net: number
  active_user: string | null
  cost_center_1: string | null
  status: string
}

interface Stats {
  total: number
  active: number
  cancelled: number
  monthly_gross: number
  cost_centers: Array<{ cc: string; cnt: number; gross: number }>
}

interface CostCenter {
  cost_center: string
  contract_count: number
  total_gross: number
}

interface TrendEntry {
  year: number
  month: number
  total_gross: number
  total_net: number
  line_count: number
}

interface Discrepancy {
  phone_number: string
  contract_id: number | null
  active_user: string | null
  contract_net: number
  invoice_net: number
  difference: number
  is_new?: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE = '/api/plugins/mobile-contracts'

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(BASE + path, opts)
  return r.json()
}

function fmtEur(v: any): string {
  const n = parseFloat(v) || 0
  return n.toFixed(2).replace('.', ',') + ' €'
}

const MONTH_NAMES = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

function monthName(m: number): string {
  return MONTH_NAMES[m] || ''
}

const FIELD_LABELS: Record<string, string> = {
  active_user: 'Aktiver Nutzer',
  cost_center_1: 'Kostenstelle 1',
  cost_center_2: 'Kostenstelle 2',
  status: 'Status',
  device_id: 'Geräte-ID',
  second_user: '2. Nutzer',
  comment: 'Kommentar',
  total_net: 'Gesamt netto',
}

// ─── Mini UI primitives ───────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'Gekündigt') return <Badge label="Gekündigt" color="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" />
  return <Badge label={status || 'Aktiv'} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" />
}

function InvoiceLineBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    matched: 'bg-emerald-100 text-emerald-700',
    discrepancy: 'bg-amber-100 text-amber-700',
    new: 'bg-blue-100 text-blue-700',
    ignored: 'bg-gray-100 text-gray-500',
    resolved: 'bg-purple-100 text-purple-700',
  }
  return <Badge label={status} color={cfg[status] || 'bg-gray-100 text-gray-500'} />
}

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: string | number; label: string; color: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 flex items-center gap-3 shadow-sm">
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children, footer, wide = false }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode
  footer?: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`bg-background rounded-xl shadow-xl flex flex-col max-h-[90vh] w-full ${wide ? 'max-w-5xl' : 'max-w-2xl'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">{footer}</div>}
      </div>
    </div>
  )
}

function Btn({ children, onClick, variant = 'primary', disabled = false, size = 'md', type = 'button' }: {
  children: React.ReactNode; onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean
  size?: 'sm' | 'md'; type?: 'button' | 'submit'
}) {
  const base = 'inline-flex items-center gap-1.5 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-4 py-2 text-sm' }
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'border border-border bg-background hover:bg-muted text-foreground',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    ghost: 'hover:bg-muted text-foreground',
  }
  return (
    <button type={type} className={`${base} ${sizes[size]} ${variants[variant]}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ─── Contract Form Modal ──────────────────────────────────────────────────────

function ContractFormModal({
  contract,
  onClose,
  onSaved,
}: {
  contract: Partial<Contract> | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!contract?.id
  const [form, setForm] = useState<Partial<Contract>>(contract ?? {
    phone_number: '', status: 'Aktiv', base_price: 0, connection_costs: 0,
    discount: 0, total_net: 0, total_gross: 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof Contract, v: any) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.phone_number?.trim()) { setError('Rufnummer erforderlich'); return }
    setSaving(true)
    const url = isEdit ? `/contracts/${contract!.id}` : '/contracts'
    const res = await apiFetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.success) { onSaved(); onClose() }
    else setError(res.error || 'Fehler beim Speichern')
  }

  async function deleteContract() {
    if (!confirm('Rufnummer wirklich löschen? Alle Historie-Einträge gehen verloren.')) return
    const res = await apiFetch(`/contracts/${contract!.id}`, { method: 'DELETE' })
    if (res.success) { onSaved(); onClose() }
  }

  return (
    <Modal
      title={isEdit ? 'Rufnummer bearbeiten' : 'Neue Rufnummer'}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Abbrechen</Btn>
          {isEdit && <Btn variant="danger" onClick={deleteContract}>Löschen</Btn>}
          <Btn onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Speichern
          </Btn>
        </>
      }
    >
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Rufnummer *">
          <input className="input" value={form.phone_number ?? ''} onChange={e => set('phone_number', e.target.value)} readOnly={isEdit} />
        </Field>
        <Field label="Status">
          <select className="input" value={form.status ?? 'Aktiv'} onChange={e => set('status', e.target.value)}>
            <option value="Aktiv">Aktiv</option>
            <option value="Gekündigt">Gekündigt</option>
          </select>
        </Field>
        <Field label="Aktiver Nutzer">
          <input className="input" value={form.active_user ?? ''} onChange={e => set('active_user', e.target.value)} />
        </Field>
        <Field label="Geräte-ID">
          <input className="input" value={form.device_id ?? ''} onChange={e => set('device_id', e.target.value)} />
        </Field>
        <Field label="Kostenstelle 1">
          <input className="input" value={form.cost_center_1 ?? ''} onChange={e => set('cost_center_1', e.target.value)} />
        </Field>
        <Field label="Kostenstelle 2">
          <input className="input" value={form.cost_center_2 ?? ''} onChange={e => set('cost_center_2', e.target.value)} />
        </Field>
        <Field label="Basispreis (€)">
          <input type="number" step="0.01" className="input" value={form.base_price ?? 0} onChange={e => set('base_price', parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Rabattierung (€)">
          <input type="number" step="0.01" className="input" value={form.discount ?? 0} onChange={e => set('discount', parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Gesamt netto (€)">
          <input type="number" step="0.01" className="input" value={form.total_net ?? 0} onChange={e => set('total_net', parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Gesamt brutto (€)">
          <input type="number" step="0.01" className="input" value={form.total_gross ?? 0} onChange={e => set('total_gross', parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="2. Nutzer">
          <input className="input" value={form.second_user ?? ''} onChange={e => set('second_user', e.target.value)} />
        </Field>
        <Field label="2. Geräte-ID">
          <input className="input" value={form.second_device_id ?? ''} onChange={e => set('second_device_id', e.target.value)} />
        </Field>
        <Field label="Intune registriert">
          <select className="input" value={form.intune_registered ?? ''} onChange={e => set('intune_registered', e.target.value)}>
            <option value="">-</option>
            <option value="Ja">Ja</option>
            <option value="Nein">Nein</option>
          </select>
        </Field>
        <Field label="Verbindungskosten (€)">
          <input type="number" step="0.01" className="input" value={form.connection_costs ?? 0} onChange={e => set('connection_costs', parseFloat(e.target.value) || 0)} />
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-3 mt-4">
        {(['pin', 'puk', 'pin2', 'puk2'] as const).map(k => (
          <Field key={k} label={k.toUpperCase().replace('2', ' 2')}>
            <input className="input font-mono" value={(form as any)[k] ?? ''} onChange={e => set(k as any, e.target.value)} />
          </Field>
        ))}
      </div>
      <div className="mt-4">
        <Field label="Kommentar">
          <textarea className="input resize-none" rows={2} value={form.comment ?? ''} onChange={e => set('comment', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

// ─── Contract Detail Modal ────────────────────────────────────────────────────

function ContractDetailModal({
  contractId,
  onClose,
  onEdit,
}: {
  contractId: number
  onClose: () => void
  onEdit: (c: Contract) => void
}) {
  const [contract, setContract] = useState<Contract | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showPins, setShowPins] = useState(false)

  useEffect(() => {
    Promise.all([
      apiFetch(`/contracts/${contractId}`),
      apiFetch(`/contracts/${contractId}/history`),
    ]).then(([cr, hr]) => {
      if (cr.success) setContract(cr.data)
      if (hr.success) setHistory(hr.data)
    })
  }, [contractId])

  if (!contract) {
    return (
      <Modal title="Vertrag laden..." onClose={onClose}>
        <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      </Modal>
    )
  }

  return (
    <Modal
      title={<span className="flex items-center gap-2"><Smartphone className="w-5 h-5" />{contract.phone_number}</span>}
      onClose={onClose}
      wide
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Schließen</Btn>
          <Btn onClick={() => { onClose(); onEdit(contract) }}>
            <Pencil className="w-4 h-4" /> Bearbeiten
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Vertragsdaten */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Vertragsdaten</h3>
          <table className="w-full text-sm">
            <tbody>
              {[
                ['Rufnummer', contract.phone_number],
                ['Aktiver Nutzer', contract.active_user || '-'],
                ['2. Nutzer', contract.second_user || '-'],
                ['Geräte-ID', contract.device_id || '-'],
                ['2. Geräte-ID', contract.second_device_id || '-'],
                ['Intune', contract.intune_registered || '-'],
              ].map(([l, v]) => (
                <tr key={l} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground w-28 text-xs">{l}</td>
                  <td className="py-1.5 font-medium">{v}</td>
                </tr>
              ))}
              <tr className="border-b">
                <td className="py-1.5 text-muted-foreground w-28 text-xs">Status</td>
                <td className="py-1.5"><StatusBadge status={contract.status} /></td>
              </tr>
              {contract.comment && (
                <tr>
                  <td className="py-1.5 text-muted-foreground w-28 text-xs">Kommentar</td>
                  <td className="py-1.5">{contract.comment}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Kosten */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Kosten & Kostenstelle</h3>
          <table className="w-full text-sm">
            <tbody>
              {[
                ['Basispreis', fmtEur(contract.base_price)],
                ['Verbindungskosten', fmtEur(contract.connection_costs)],
                ['Rabattierung', contract.discount ? fmtEur(contract.discount) : '-'],
                ['Gesamt netto', fmtEur(contract.total_net)],
                ['Gesamt brutto', fmtEur(contract.total_gross)],
                ['Kostenstelle 1', contract.cost_center_1 || '-'],
                ['Kostenstelle 2', contract.cost_center_2 || '-'],
              ].map(([l, v]) => (
                <tr key={l} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground w-28 text-xs">{l}</td>
                  <td className="py-1.5 font-medium">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* SIM-Daten */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center justify-between">
            SIM-Daten
            <button
              onClick={() => setShowPins(p => !p)}
              className="text-muted-foreground hover:text-foreground"
            >
              {showPins ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </h3>
          <table className="w-full text-sm">
            <tbody>
              {(['pin', 'puk', 'pin2', 'puk2'] as const).map(k => (
                <tr key={k} className="border-b last:border-0">
                  <td className="py-1.5 text-muted-foreground w-16 text-xs">{k.toUpperCase().replace('2', ' 2')}</td>
                  <td className="py-1.5">
                    <span className="font-mono bg-muted px-2 py-0.5 rounded text-sm">
                      {contract[k] ? (showPins ? contract[k] : '••••') : '-'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {/* History */}
      {history.length > 0 ? (
        <section className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Änderungshistorie</h3>
          <div className="rounded-lg border overflow-auto max-h-64">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {['Datum', 'Feld', 'Alt', 'Neu', 'Geändert von'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(h.changed_at).toLocaleString('de-DE')}
                    </td>
                    <td className="px-3 py-2">{FIELD_LABELS[h.field_name] || h.field_name}</td>
                    <td className="px-3 py-2 line-through text-red-500">{h.old_value || '-'}</td>
                    <td className="px-3 py-2 font-medium text-emerald-600">{h.new_value || '-'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{h.changed_by_name || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">Keine Änderungshistorie vorhanden.</p>
      )}
    </Modal>
  )
}

// ─── Excel Import Modal ───────────────────────────────────────────────────────

function ExcelImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [sheet, setSheet] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function doImport() {
    if (!file) return
    setLoading(true)
    const fd = new FormData()
    fd.append('file', file)
    if (sheet) fd.append('sheet', sheet)
    const res = await apiFetch('/import/excel', { method: 'POST', body: fd })
    setLoading(false)
    setResult(res)
    if (res.success) onDone()
  }

  return (
    <Modal
      title={<span className="flex items-center gap-2"><Upload className="w-5 h-5" />Excel Import</span>}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Schließen</Btn>
          <Btn onClick={doImport} disabled={!file || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importieren
          </Btn>
        </>
      }
    >
      <p className="text-sm text-muted-foreground mb-4">
        Excel-Datei (.xlsx) mit Rufnummern hochladen. Erwartete Spalten: Rufnummer, Basispreis, Rabattierung, Gesamtbetrag netto/brutto, KST, aktiver Nutzer, etc.
      </p>
      <div className="space-y-4">
        <Field label="Datei wählen">
          <input
            type="file" accept=".xlsx,.xls" className="input text-sm"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="Sheet-Name (leer = erstes Sheet)">
          <input className="input" placeholder="z.B. Rufnummern_ÜAG" value={sheet} onChange={e => setSheet(e.target.value)} />
        </Field>
        {result && (
          <div className={`p-4 rounded-lg text-sm ${result.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:text-red-300'}`}>
            {result.success ? (
              <>
                <strong>Import erfolgreich!</strong><br />
                {result.data.imported} neu importiert, {result.data.updated} aktualisiert, {result.data.skipped} übersprungen (von {result.data.total} Zeilen)
              </>
            ) : result.error}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Invoice Import Modal ─────────────────────────────────────────────────────

function InvoiceImportModal({
  onClose,
  onResult,
}: {
  onClose: () => void
  onResult: (data: any) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i)

  async function doImport() {
    if (!file) return
    setLoading(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    fd.append('month', month)
    fd.append('year', year)
    const res = await apiFetch('/import/invoice', { method: 'POST', body: fd })
    setLoading(false)
    if (res.success) {
      onResult(res.data)
      onClose()
    } else {
      setError(res.error || 'Fehler beim Import')
    }
  }

  return (
    <Modal
      title={<span className="flex items-center gap-2"><FileText className="w-5 h-5" />Rechnung importieren (PDF)</span>}
      onClose={onClose}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Schließen</Btn>
          <Btn onClick={doImport} disabled={!file || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importieren & Abgleichen
          </Btn>
        </>
      }
    >
      <p className="text-sm text-muted-foreground mb-4">
        Mobilfunk-Rechnung als PDF hochladen. Die Rufnummern und Kosten werden automatisch extrahiert und mit den gespeicherten Verträgen abgeglichen.
      </p>
      <div className="space-y-4">
        <Field label="PDF-Rechnung">
          <input type="file" accept=".pdf" className="input text-sm" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Monat">
            <select className="input" value={month} onChange={e => setMonth(e.target.value)}>
              {MONTH_NAMES.slice(1).map((name, i) => (
                <option key={i + 1} value={String(i + 1)}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Jahr">
            <select className="input" value={year} onChange={e => setYear(e.target.value)}>
              {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </Field>
        </div>
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/20 dark:text-red-300 text-sm">{error}</div>
        )}
      </div>
    </Modal>
  )
}

// ─── Reconciliation Modal ─────────────────────────────────────────────────────

function ReconciliationModal({
  importResult,
  onClose,
  onDone,
}: {
  importResult: any
  onClose: () => void
  onDone: () => void
}) {
  const d = importResult
  const [actions, setActions] = useState<Record<number, string>>(() =>
    Object.fromEntries((d.discrepancies as Discrepancy[]).map((disc, idx) =>
      [idx, disc.is_new ? 'create' : 'update_price']
    ))
  )
  const [checked, setChecked] = useState<Record<number, boolean>>(() =>
    Object.fromEntries((d.discrepancies as Discrepancy[]).map((_: any, idx: number) => [idx, true]))
  )
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function resolve() {
    setSaving(true)
    const actionList = (d.discrepancies as Discrepancy[]).map((disc: any, idx: number) => ({
      phone_number: disc.phone_number,
      action: checked[idx] ? actions[idx] : 'ignore',
      new_total_net: disc.invoice_net,
      invoice_line_id: disc.invoice_line_id ?? null,
    }))
    const res = await apiFetch('/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actions: actionList }),
    })
    setSaving(false)
    setResult(res)
    if (res.success) { onDone(); onClose() }
  }

  const newCount = (d.discrepancies as Discrepancy[]).filter((x: any) => x.is_new).length
  const discCount = (d.discrepancies as Discrepancy[]).filter((x: any) => !x.is_new).length
  const matchedOk = d.matched - discCount

  return (
    <Modal
      title={`Rechnungsabgleich — ${d.total_lines} Positionen`}
      onClose={onClose}
      wide
      footer={
        <>
          <Btn variant="secondary" onClick={() => { onClose(); onDone() }}>Ohne Änderungen schließen</Btn>
          <Btn onClick={resolve} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Ausgewählte Aktionen ausführen
          </Btn>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} value={matchedOk} label="Übereinstimmend" color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} value={discCount} label="Preisabweichungen" color="bg-amber-100 text-amber-600 dark:bg-amber-900/30" />
        <StatCard icon={<Plus className="w-5 h-5" />} value={newCount} label="Neue Rufnummern" color="bg-blue-100 text-blue-600 dark:bg-blue-900/30" />
        <StatCard icon={<BarChart2 className="w-5 h-5" />} value={fmtEur(d.total_gross)} label="Gesamt brutto" color="bg-purple-100 text-purple-600 dark:bg-purple-900/30" />
      </div>

      {result && !result.success && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{result.error}</div>
      )}

      <h3 className="text-sm font-semibold mb-3">Abweichungen klären ({d.discrepancies.length})</h3>
      <div className="rounded-lg border overflow-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="px-3 py-2 w-8">
                <input type="checkbox" defaultChecked onChange={e => {
                  const v = e.target.checked
                  setChecked(Object.fromEntries((d.discrepancies as any[]).map((_: any, i: number) => [i, v])))
                }} />
              </th>
              {['Rufnummer', 'Aktiver Nutzer', 'Typ', 'Vertrag brutto', 'Rechnung', 'Differenz', 'Aktion'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(d.discrepancies as Discrepancy[]).map((disc: any, idx: number) => (
              <tr key={idx} className={`border-t ${disc.is_new ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'bg-amber-50/50 dark:bg-amber-900/10'}`}>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={!!checked[idx]} onChange={e => setChecked(c => ({ ...c, [idx]: e.target.checked }))} />
                </td>
                <td className="px-3 py-2 font-medium whitespace-nowrap">{disc.phone_number}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{disc.active_user || '-'}</td>
                <td className="px-3 py-2">
                  {disc.is_new
                    ? <Badge label="Neu" color="bg-blue-100 text-blue-700" />
                    : <Badge label="Abweichung" color="bg-amber-100 text-amber-700" />}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{disc.is_new ? '-' : fmtEur(disc.contract_net * 1.19)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{fmtEur(disc.invoice_net * 1.19)}</td>
                <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${disc.difference > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {disc.difference > 0 ? '+' : ''}{fmtEur(disc.difference * 1.19)}
                </td>
                <td className="px-3 py-2">
                  <select className="input text-xs py-1" value={actions[idx]} onChange={e => setActions(a => ({ ...a, [idx]: e.target.value }))}>
                    {disc.is_new ? (
                      <>
                        <option value="create">Rufnummer anlegen</option>
                        <option value="ignore">Ignorieren</option>
                      </>
                    ) : (
                      <>
                        <option value="update_price">Preis übernehmen</option>
                        <option value="ignore">Ignorieren</option>
                      </>
                    )}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────

function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const [invoice, setInvoice] = useState<(Invoice & { lines: InvoiceLine[] }) | null>(null)

  useEffect(() => {
    apiFetch(`/invoices/${invoiceId}`).then(r => { if (r.success) setInvoice(r.data) })
  }, [invoiceId])

  if (!invoice) return (
    <Modal title="Rechnung laden..." onClose={onClose}>
      <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
    </Modal>
  )

  return (
    <Modal
      title={<span className="flex items-center gap-2"><FileText className="w-5 h-5" />{invoice.filename}</span>}
      onClose={onClose}
      wide
      footer={<Btn variant="secondary" onClick={onClose}>Schließen</Btn>}
    >
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard icon={<Smartphone className="w-5 h-5" />} value={invoice.line_count} label="Rufnummern" color="bg-blue-100 text-blue-600 dark:bg-blue-900/30" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} value={invoice.lines.filter(l => l.status === 'matched').length} label="Zugeordnet" color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" />
        <StatCard icon={<AlertTriangle className="w-5 h-5" />} value={invoice.lines.filter(l => l.status === 'discrepancy').length} label="Abweichungen" color="bg-amber-100 text-amber-600 dark:bg-amber-900/30" />
        <StatCard icon={<BarChart2 className="w-5 h-5" />} value={fmtEur(invoice.total_net)} label="Gesamt netto" color="bg-purple-100 text-purple-600 dark:bg-purple-900/30" />
      </div>
      <div className="rounded-lg border overflow-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {['Rufnummer', 'Tarif', 'Basispreis', 'Rabatt', 'Gesamt', 'Nutzer', 'KST', 'Status'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map(l => (
              <tr key={l.id} className={`border-t hover:bg-muted/30 ${l.status === 'discrepancy' ? 'bg-amber-50/50 dark:bg-amber-900/10' : l.status === 'new' ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}>
                <td className="px-3 py-2 font-medium">{l.phone_number}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.tariff || '-'}</td>
                <td className="px-3 py-2">{fmtEur(l.base_price)}</td>
                <td className="px-3 py-2">{l.discount ? fmtEur(l.discount) : '-'}</td>
                <td className="px-3 py-2 font-medium">{fmtEur(l.total_net)}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.active_user || '-'}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.cost_center_1 || '-'}</td>
                <td className="px-3 py-2"><InvoiceLineBadge status={l.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

// ─── Verträge Tab ─────────────────────────────────────────────────────────────

function VertraegeTab() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [costCenter, setCostCenter] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ pages: 1, total: 0 })
  const [detailId, setDetailId] = useState<number | null>(null)
  const [editContract, setEditContract] = useState<Partial<Contract> | null | false>(false)
  const [showExcel, setShowExcel] = useState(false)
  const [showInvoice, setShowInvoice] = useState(false)
  const [reconcileData, setReconcileData] = useState<any>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadStats = useCallback(() => {
    apiFetch('/contracts/stats').then(r => { if (r.success) setStats(r.data) })
  }, [])

  const loadContracts = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page), limit: '50' })
    if (search) p.set('search', search)
    if (costCenter) p.set('cost_center', costCenter)
    if (status) p.set('status', status)
    apiFetch('/contracts?' + p.toString()).then(r => {
      if (r.success) {
        setContracts(r.data)
        setPagination(r.pagination)
      }
      setLoading(false)
    })
  }, [search, costCenter, status, page])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadContracts() }, [loadContracts])

  function handleSearch(v: string) {
    setSearch(v)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setPage(1), 300)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Mobilfunkverträge</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Rufnummern, Kosten und Verträge verwalten</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="secondary" onClick={() => setShowExcel(true)}>
            <Upload className="w-4 h-4" /> Excel Import
          </Btn>
          <Btn variant="secondary" onClick={() => setShowInvoice(true)}>
            <FileText className="w-4 h-4" /> Rechnung importieren
          </Btn>
          <a
            href="/api/plugins/mobile-contracts/contracts/export/csv"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-lg bg-background hover:bg-muted transition-colors"
            target="_blank" rel="noopener noreferrer"
          >
            <Download className="w-4 h-4" /> Export
          </a>
          <Btn onClick={() => setEditContract({})}>
            <Plus className="w-4 h-4" /> Neue Rufnummer
          </Btn>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Smartphone className="w-5 h-5" />} value={stats.total} label="Rufnummern" color="bg-blue-100 text-blue-600 dark:bg-blue-900/30" />
          <StatCard icon={<CheckCircle2 className="w-5 h-5" />} value={stats.active} label="Aktiv" color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" />
          <StatCard icon={<CircleDot className="w-5 h-5" />} value={stats.cancelled} label="Gekündigt" color="bg-gray-100 text-gray-600 dark:bg-gray-800" />
          <StatCard icon={<BarChart2 className="w-5 h-5" />} value={fmtEur(stats.monthly_gross)} label="Monatl. brutto" color="bg-purple-100 text-purple-600 dark:bg-purple-900/30" />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="input pl-9 w-56"
            placeholder="Rufnummer, Nutzer suchen..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={costCenter} onChange={e => { setCostCenter(e.target.value); setPage(1) }}>
          <option value="">Alle Kostenstellen</option>
          {stats?.cost_centers?.filter(cc => cc.cc).map(cc => (
            <option key={cc.cc} value={cc.cc}>{cc.cc} ({cc.cnt})</option>
          ))}
        </select>
        <select className="input w-auto" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Alle Status</option>
          <option value="Aktiv">Aktiv</option>
          <option value="Gekündigt">Gekündigt</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Rufnummer', 'Aktiver Nutzer', 'KST', 'Basispreis', 'Rabatt', 'Gesamt brutto', 'Geräte-ID', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin inline" />
                </td></tr>
              ) : contracts.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Keine Rufnummern gefunden</td></tr>
              ) : contracts.map(c => (
                <tr
                  key={c.id}
                  className={`border-t hover:bg-muted/40 cursor-pointer ${c.status === 'Gekündigt' ? 'opacity-50' : ''}`}
                  onClick={() => setDetailId(c.id)}
                >
                  <td className="px-4 py-3 font-medium">{c.phone_number}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.active_user || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.cost_center_1 || '-'}</td>
                  <td className="px-4 py-3">{fmtEur(c.base_price)}</td>
                  <td className="px-4 py-3">{c.discount ? fmtEur(c.discount) : '-'}</td>
                  <td className="px-4 py-3 font-medium">{fmtEur(c.total_gross)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.device_id || '-'}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3">
                    <button
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                      onClick={e => { e.stopPropagation(); setEditContract(c) }}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-1 p-3 border-t">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(pagination.pages, 10) }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded text-sm ${p === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                {p}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="p-1.5 rounded hover:bg-muted disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {detailId !== null && (
        <ContractDetailModal
          contractId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={c => setEditContract(c)}
        />
      )}
      {editContract !== false && (
        <ContractFormModal
          contract={editContract}
          onClose={() => setEditContract(false)}
          onSaved={() => { loadStats(); loadContracts() }}
        />
      )}
      {showExcel && (
        <ExcelImportModal
          onClose={() => setShowExcel(false)}
          onDone={() => { loadStats(); loadContracts() }}
        />
      )}
      {showInvoice && (
        <InvoiceImportModal
          onClose={() => setShowInvoice(false)}
          onResult={data => { setShowInvoice(false); setReconcileData(data) }}
        />
      )}
      {reconcileData && (
        <ReconciliationModal
          importResult={reconcileData}
          onClose={() => setReconcileData(null)}
          onDone={() => { loadStats(); loadContracts() }}
        />
      )}
    </div>
  )
}

// ─── Rechnungen Tab ───────────────────────────────────────────────────────────

function RechnungenTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [reconcileData, setReconcileData] = useState<any>(null)

  const load = useCallback(() => {
    setLoading(true)
    apiFetch('/invoices').then(r => {
      if (r.success) setInvoices(r.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => { load() }, [load])

  async function deleteInvoice(id: number) {
    if (!confirm('Rechnung und alle zugehörigen Einträge löschen?')) return
    const res = await apiFetch(`/invoices/${id}`, { method: 'DELETE' })
    if (res.success) load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Rechnungsübersicht</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Importierte Mobilfunk-Rechnungen</p>
        </div>
        <Btn onClick={() => setShowImport(true)}>
          <FileText className="w-4 h-4" /> Rechnung importieren
        </Btn>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Datei', 'Monat', 'Rufnummern', 'Gesamt netto', 'Gesamt brutto', 'Importiert am', 'Von', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-muted-foreground" /></td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Keine Rechnungen importiert</td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => setDetailId(inv.id)}>
                  <td className="px-4 py-3 font-medium">{inv.filename}</td>
                  <td className="px-4 py-3">{inv.invoice_month && inv.invoice_year ? `${monthName(inv.invoice_month)} ${inv.invoice_year}` : '-'}</td>
                  <td className="px-4 py-3">{inv.line_count}</td>
                  <td className="px-4 py-3">{fmtEur(inv.total_net)}</td>
                  <td className="px-4 py-3 font-medium">{fmtEur(inv.total_gross)}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(inv.imported_at).toLocaleString('de-DE')}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.imported_by_name || '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      className="p-1.5 rounded hover:bg-red-50 text-red-500"
                      onClick={e => { e.stopPropagation(); deleteInvoice(inv.id) }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detailId !== null && <InvoiceDetailModal invoiceId={detailId} onClose={() => setDetailId(null)} />}
      {showImport && (
        <InvoiceImportModal
          onClose={() => setShowImport(false)}
          onResult={data => { setShowImport(false); setReconcileData(data); load() }}
        />
      )}
      {reconcileData && (
        <ReconciliationModal
          importResult={reconcileData}
          onClose={() => setReconcileData(null)}
          onDone={load}
        />
      )}
    </div>
  )
}

// ─── Kostenstellen Tab ────────────────────────────────────────────────────────

function KostenstellenTab() {
  const [costs, setCosts] = useState<CostCenter[]>([])
  const [loading, setLoading] = useState(true)
  const totalGross = costs.reduce((s, c) => s + parseFloat(String(c.total_gross) || '0'), 0)

  useEffect(() => {
    apiFetch('/reports/cost-centers').then(r => {
      if (r.success) setCosts(r.data.contract_costs)
      setLoading(false)
    })
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Kostenstellenübersicht</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Mobilfunkkosten nach Kostenstelle</p>
      </div>

      {!loading && costs.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<Building2 className="w-5 h-5" />} value={costs.length} label="Kostenstellen" color="bg-blue-100 text-blue-600 dark:bg-blue-900/30" />
          <StatCard icon={<Smartphone className="w-5 h-5" />} value={costs.reduce((s, c) => s + Number(c.contract_count), 0)} label="Rufnummern gesamt" color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" />
          <StatCard icon={<BarChart2 className="w-5 h-5" />} value={fmtEur(totalGross)} label="Monatl. brutto" color="bg-purple-100 text-purple-600 dark:bg-purple-900/30" />
        </div>
      )}

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {['Kostenstelle', 'Rufnummern', 'Monatl. brutto', 'Anteil'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-muted-foreground" /></td></tr>
            ) : costs.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">Keine Daten</td></tr>
            ) : costs.map(c => {
              const pct = totalGross > 0 ? (parseFloat(String(c.total_gross)) / totalGross * 100) : 0
              return (
                <tr key={c.cost_center} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.cost_center}</td>
                  <td className="px-4 py-3">{c.contract_count}</td>
                  <td className="px-4 py-3 font-medium">{fmtEur(c.total_gross)}</td>
                  <td className="px-4 py-3 w-64">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Auswertung Tab ───────────────────────────────────────────────────────────

function AuswertungTab() {
  const [trend, setTrend] = useState<TrendEntry[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiFetch('/reports/cost-trend'),
      apiFetch('/contracts/stats'),
    ]).then(([tr, sr]) => {
      if (tr.success) setTrend(tr.data)
      if (sr.success) setStats(sr.data)
      setLoading(false)
    })
  }, [])

  const last12 = trend.slice(-12)
  const maxGross = Math.max(...last12.map(t => parseFloat(String(t.total_gross)) || 0), 1)
  const avgCost = stats && stats.active > 0 ? stats.monthly_gross / stats.active : 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Auswertung</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Kostentrend und Übersicht</p>
      </div>

      {!loading && stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<BarChart2 className="w-5 h-5" />} value={fmtEur(stats.monthly_gross)} label="Monatliche Kosten (brutto)" color="bg-purple-100 text-purple-600 dark:bg-purple-900/30" />
          <StatCard icon={<Smartphone className="w-5 h-5" />} value={stats.active} label="Aktive Verträge" color="bg-blue-100 text-blue-600 dark:bg-blue-900/30" />
          <StatCard icon={<BarChart2 className="w-5 h-5" />} value={fmtEur(avgCost)} label="Ø Kosten / Vertrag" color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : last12.length === 0 ? (
        <div className="rounded-xl border p-12 text-center text-muted-foreground">
          Noch keine Rechnungsdaten vorhanden. Importieren Sie eine Rechnung, um den Kostenverlauf zu sehen.
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold mb-4">Kostenverlauf (letzte {last12.length} Monate)</h2>
          <div className="flex items-end gap-2 h-48">
            {last12.map((t, i) => {
              const gross = parseFloat(String(t.total_gross)) || 0
              const pct = (gross / maxGross * 100)
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1 group">
                  <div className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {fmtEur(gross)}
                  </div>
                  <div
                    className="w-full bg-primary rounded-t transition-all hover:opacity-80"
                    style={{ height: `${Math.max(pct, 2)}%`, minHeight: 4 }}
                    title={`${monthName(t.month)} ${t.year}: ${fmtEur(gross)}`}
                  />
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {monthName(t.month).substring(0, 3)} {t.year}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'contracts', label: 'Verträge', icon: Smartphone },
  { id: 'invoices', label: 'Rechnungen', icon: FileText },
  { id: 'cost-centers', label: 'Kostenstellen', icon: Building2 },
  { id: 'analytics', label: 'Auswertung', icon: BarChart2 },
] as const

type TabId = typeof TABS[number]['id']

export function MobileContractsPage({ slug }: { slug: string[] }) {
  const subpath = slug[0] || ''
  const defaultTab: TabId =
    subpath === 'invoices' ? 'invoices'
    : subpath === 'cost-centers' ? 'cost-centers'
    : subpath === 'analytics' ? 'analytics'
    : 'contracts'

  const [activeTab, setActiveTab] = useState<TabId>(defaultTab)

  return (
    <div className="p-6 space-y-5">
      {/* Tab navigation */}
      <div className="flex gap-1 border-b">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'contracts' && <VertraegeTab />}
      {activeTab === 'invoices' && <RechnungenTab />}
      {activeTab === 'cost-centers' && <KostenstellenTab />}
      {activeTab === 'analytics' && <AuswertungTab />}

      {/* Tailwind input utility class */}
      <style>{`.input { display: block; width: 100%; padding: 0.5rem 0.75rem; font-size: 0.875rem; border: 1px solid hsl(var(--border)); border-radius: 0.5rem; background: hsl(var(--background)); color: hsl(var(--foreground)); outline: none; } .input:focus { border-color: hsl(var(--primary)); box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15); }`}</style>
    </div>
  )
}
