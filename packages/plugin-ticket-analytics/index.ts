import type { HelpdeskPlugin } from '../../src/lib/plugins/types'
import { NextResponse } from 'next/server'
import { AnalyticsPage } from './components/AnalyticsPage'

// Helper: build date range from `days` query param (default 30)
function getDateRange(searchParams: URLSearchParams): { from: string; to: string } {
  const now = new Date()
  const days = parseInt(searchParams.get('days') || '30', 10) || 30
  const to = now.toISOString().slice(0, 19).replace('T', ' ')
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')
  return { from, to }
}

const plugin: HelpdeskPlugin = {
  manifest: {
    id: 'ticket-analytics',
    name: 'Auswertungen',
    version: '1.0.0',
    description: 'Ticket-Auswertungen, KPIs und Agenten-Performance',
    icon: 'BarChart2',
    navItems: [
      { label: 'Auswertungen', href: '/', icon: 'BarChart2' },
    ],
  },

  api: {
    // ---- KPI Overview ----
    'GET /kpis': async (_req, ctx) => {
      const { from, to } = getDateRange(ctx.searchParams)

      const [total, open, resolved, closed, avgResolve, slaOk, slaBreach, firstResponse] =
        await Promise.all([
          ctx.db.queryOne<{ c: number }>(
            `SELECT COUNT(*) as c FROM tickets WHERE created_at BETWEEN ? AND ?`,
            [from, to]
          ),
          ctx.db.queryOne<{ c: number }>(
            `SELECT COUNT(*) as c FROM tickets WHERE status IN ('open','in_progress','pending') AND created_at BETWEEN ? AND ?`,
            [from, to]
          ),
          ctx.db.queryOne<{ c: number }>(
            `SELECT COUNT(*) as c FROM tickets WHERE status = 'resolved' AND created_at BETWEEN ? AND ?`,
            [from, to]
          ),
          ctx.db.queryOne<{ c: number }>(
            `SELECT COUNT(*) as c FROM tickets WHERE status = 'closed' AND created_at BETWEEN ? AND ?`,
            [from, to]
          ),
          ctx.db.queryOne<{ avg_hours: string | null }>(
            `SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, resolved_at)) as avg_hours FROM tickets WHERE resolved_at IS NOT NULL AND created_at BETWEEN ? AND ?`,
            [from, to]
          ),
          ctx.db.queryOne<{ c: number }>(
            `SELECT COUNT(*) as c FROM tickets WHERE sla_due_at IS NOT NULL AND (resolved_at <= sla_due_at OR (resolved_at IS NULL AND sla_due_at > NOW())) AND created_at BETWEEN ? AND ?`,
            [from, to]
          ),
          ctx.db.queryOne<{ c: number }>(
            `SELECT COUNT(*) as c FROM tickets WHERE sla_due_at IS NOT NULL AND ((resolved_at > sla_due_at) OR (resolved_at IS NULL AND sla_due_at < NOW() AND status NOT IN ('resolved','closed'))) AND created_at BETWEEN ? AND ?`,
            [from, to]
          ),
          ctx.db.queryOne<{ avg_hours: string | null }>(
            `SELECT AVG(first_resp_hours) as avg_hours FROM (SELECT TIMESTAMPDIFF(HOUR, t.created_at, MIN(c.created_at)) as first_resp_hours FROM tickets t JOIN ticket_comments c ON c.ticket_id = t.id AND c.user_id != t.requester_id WHERE t.created_at BETWEEN ? AND ? GROUP BY t.id) sub`,
            [from, to]
          ),
        ])

      const slaTotal = (slaOk?.c || 0) + (slaBreach?.c || 0)

      return NextResponse.json({
        total_tickets: total?.c ?? 0,
        open_tickets: open?.c ?? 0,
        resolved_tickets: resolved?.c ?? 0,
        closed_tickets: closed?.c ?? 0,
        avg_resolution_hours:
          Math.round(parseFloat(avgResolve?.avg_hours || '0') * 10) / 10,
        sla_compliance_pct:
          slaTotal > 0
            ? Math.round(((slaOk?.c || 0) / slaTotal) * 1000) / 10
            : null,
        sla_ok: slaOk?.c || 0,
        sla_breached: slaBreach?.c || 0,
        avg_first_response_hours:
          Math.round(parseFloat(firstResponse?.avg_hours || '0') * 10) / 10,
        period: { from, to },
      })
    },

    // ---- Ticket Volume over time ----
    'GET /volume': async (_req, ctx) => {
      const { from, to } = getDateRange(ctx.searchParams)
      const group = ctx.searchParams.get('group') || 'day'

      let dateGroup: string
      if (group === 'month') dateGroup = "DATE_FORMAT(created_at, '%Y-%m')"
      else if (group === 'week') dateGroup = "DATE_FORMAT(created_at, '%Y-W%u')"
      else dateGroup = 'DATE(created_at)'

      const [created, resolvedRows] = await Promise.all([
        ctx.db.query<{ period: string; count: number }>(
          `SELECT ${dateGroup} as period, COUNT(*) as count FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY ${dateGroup} ORDER BY period`,
          [from, to]
        ),
        ctx.db.query<{ period: string; count: number }>(
          `SELECT ${dateGroup} as period, COUNT(*) as count FROM tickets WHERE resolved_at IS NOT NULL AND resolved_at BETWEEN ? AND ? GROUP BY ${dateGroup} ORDER BY period`,
          [from, to]
        ),
      ])

      return NextResponse.json({ created, resolved: resolvedRows, group })
    },

    // ---- Agent Performance ----
    'GET /agents': async (_req, ctx) => {
      const { from, to } = getDateRange(ctx.searchParams)

      const agents = await ctx.db.query(
        `SELECT u.id, u.name,
          COUNT(t.id) as total_assigned,
          SUM(CASE WHEN t.status IN ('resolved','closed') THEN 1 ELSE 0 END) as total_resolved,
          SUM(CASE WHEN t.status IN ('open','in_progress','pending') THEN 1 ELSE 0 END) as total_open,
          ROUND(AVG(CASE WHEN t.resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, t.created_at, t.resolved_at) END), 1) as avg_resolution_hours,
          SUM(CASE WHEN t.sla_due_at IS NOT NULL AND t.resolved_at IS NOT NULL AND t.resolved_at <= t.sla_due_at THEN 1 ELSE 0 END) as sla_met
        FROM users u
        LEFT JOIN tickets t ON t.assignee_id = u.id AND t.created_at BETWEEN ? AND ?
        WHERE u.role IN ('admin','agent') AND u.active = 1
        GROUP BY u.id, u.name
        ORDER BY total_resolved DESC`,
        [from, to]
      )

      return NextResponse.json(agents)
    },

    // ---- Category Breakdown ----
    'GET /categories': async (_req, ctx) => {
      const { from, to } = getDateRange(ctx.searchParams)

      const data = await ctx.db.query(
        `SELECT category, COUNT(*) as count,
          ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) END), 1) as avg_hours
         FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY category ORDER BY count DESC`,
        [from, to]
      )

      return NextResponse.json(data)
    },

    // ---- Priority Distribution ----
    'GET /priorities': async (_req, ctx) => {
      const { from, to } = getDateRange(ctx.searchParams)

      const data = await ctx.db.query(
        `SELECT priority, COUNT(*) as count,
          SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved,
          ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) END), 1) as avg_hours
         FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY priority ORDER BY FIELD(priority, 'critical','high','medium','low')`,
        [from, to]
      )

      return NextResponse.json(data)
    },

    // ---- Top Requesters ----
    'GET /requesters': async (_req, ctx) => {
      const { from, to } = getDateRange(ctx.searchParams)

      const data = await ctx.db.query(
        `SELECT u.name, u.email, u.department, u.location, COUNT(t.id) as ticket_count
         FROM tickets t JOIN users u ON t.requester_id = u.id
         WHERE t.created_at BETWEEN ? AND ?
         GROUP BY u.id ORDER BY ticket_count DESC LIMIT 20`,
        [from, to]
      )

      return NextResponse.json(data)
    },

    // ---- CSV Export ----
    'GET /export': async (_req, ctx) => {
      const { from, to } = getDateRange(ctx.searchParams)

      const tickets = await ctx.db.query<Record<string, unknown>>(
        `SELECT t.ticket_number, t.title, t.status, t.priority, t.category, t.source,
          r.name as requester, r.department, r.location,
          a.name as assignee,
          DATE_FORMAT(t.created_at, '%d.%m.%Y %H:%i') as created,
          DATE_FORMAT(t.resolved_at, '%d.%m.%Y %H:%i') as resolved,
          DATE_FORMAT(t.sla_due_at, '%d.%m.%Y %H:%i') as sla_due,
          CASE WHEN t.sla_due_at IS NOT NULL AND t.resolved_at IS NOT NULL AND t.resolved_at <= t.sla_due_at THEN 'Ja'
               WHEN t.sla_due_at IS NOT NULL AND ((t.resolved_at > t.sla_due_at) OR (t.resolved_at IS NULL AND t.sla_due_at < NOW())) THEN 'Nein'
               ELSE '' END as sla_eingehalten,
          CASE WHEN t.resolved_at IS NOT NULL THEN ROUND(TIMESTAMPDIFF(MINUTE, t.created_at, t.resolved_at) / 60, 1) ELSE NULL END as loesung_stunden
        FROM tickets t
        LEFT JOIN users r ON t.requester_id = r.id
        LEFT JOIN users a ON t.assignee_id = a.id
        WHERE t.created_at BETWEEN ? AND ?
        ORDER BY t.created_at DESC`,
        [from, to]
      )

      const header =
        'Ticket-Nr.;Titel;Status;Prioritaet;Kategorie;Quelle;Ersteller;Abteilung;Standort;Bearbeiter;Erstellt;Geloest;SLA-Frist;SLA eingehalten;Loesung (Std.)'
      const rows = tickets.map((t) =>
        [
          t.ticket_number,
          t.title,
          t.status,
          t.priority,
          t.category,
          t.source,
          t.requester,
          t.department,
          t.location,
          t.assignee,
          t.created,
          t.resolved,
          t.sla_due,
          t.sla_eingehalten,
          t.loesung_stunden,
        ]
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(';')
      )

      const csvString =
        '\uFEFF' + [header, ...rows].join('\n')

      return new NextResponse(csvString, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ticket-report-${from.slice(0, 10)}-${to.slice(0, 10)}.csv"`,
        },
      })
    },

    // ---- HTML / PDF Report ----
    'GET /report': async (_req, ctx) => {
      const { from, to } = getDateRange(ctx.searchParams)
      const days = parseInt(ctx.searchParams.get('days') || '30', 10) || 30

      // Fetch all data in parallel
      const [kpiRows, categories, agents, priorities, volume, settings] = await Promise.all([
        ctx.db.query<Record<string, unknown>>(
          `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
            SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved_count,
            ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) END), 1) as avg_hours,
            SUM(CASE WHEN sla_due_at IS NOT NULL AND resolved_at IS NOT NULL AND resolved_at <= sla_due_at THEN 1 ELSE 0 END) as sla_ok,
            SUM(CASE WHEN sla_due_at IS NOT NULL AND ((resolved_at > sla_due_at) OR (resolved_at IS NULL AND sla_due_at < NOW())) THEN 1 ELSE 0 END) as sla_breached
           FROM tickets WHERE created_at BETWEEN ? AND ?`, [from, to]),
        ctx.db.query<Record<string, unknown>>(
          `SELECT category, COUNT(*) as count,
            ROUND(AVG(CASE WHEN resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) END), 1) as avg_hours
           FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY category ORDER BY count DESC`, [from, to]),
        ctx.db.query<Record<string, unknown>>(
          `SELECT u.name, COUNT(t.id) as total_assigned,
            SUM(CASE WHEN t.status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved,
            ROUND(AVG(CASE WHEN t.resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, t.created_at, t.resolved_at) END), 1) as avg_hours
           FROM tickets t JOIN users u ON t.assignee_id = u.id
           WHERE t.created_at BETWEEN ? AND ?
           GROUP BY u.id ORDER BY resolved DESC LIMIT 15`, [from, to]),
        ctx.db.query<Record<string, unknown>>(
          `SELECT priority, COUNT(*) as count
           FROM tickets WHERE created_at BETWEEN ? AND ? GROUP BY priority
           ORDER BY FIELD(priority, 'critical','high','medium','low')`, [from, to]),
        ctx.db.query<Record<string, unknown>>(
          `SELECT DATE(created_at) as day, COUNT(*) as count
           FROM tickets WHERE created_at BETWEEN ? AND ?
           GROUP BY DATE(created_at) ORDER BY day`, [from, to]),
        ctx.db.query<Record<string, unknown>>(
          `SELECT key_name, value FROM settings WHERE key_name IN ('company_name','primary_color')`),
      ])

      const kpi = (kpiRows as any[])[0] || {}
      const companyName = (settings as any[]).find((s: any) => s.key_name === 'company_name')?.value || 'HelpDesk'
      const primaryColor = (settings as any[]).find((s: any) => s.key_name === 'primary_color')?.value || '#4F46E5'
      const fromLabel = from.slice(0, 10).split('-').reverse().join('.')
      const toLabel = to.slice(0, 10).split('-').reverse().join('.')
      const slaTotal = (kpi.sla_ok || 0) + (kpi.sla_breached || 0)
      const slaPct = slaTotal > 0 ? Math.round(((kpi.sla_ok || 0) / slaTotal) * 100) : null

      // Priority label/color
      const prioLabel: Record<string, string> = { critical: 'Kritisch', high: 'Hoch', medium: 'Mittel', low: 'Niedrig' }
      const prioColor: Record<string, string> = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#22c55e' }

      // Volume chart: SVG bar chart
      const volData = volume as any[]
      const maxVol = Math.max(...volData.map((v: any) => v.count), 1)
      const barWidth = volData.length > 0 ? Math.max(Math.floor(600 / volData.length) - 2, 4) : 10
      const volSvg = volData.length > 0 ? `
        <svg width="100%" viewBox="0 0 ${volData.length * (barWidth + 2)} 120" style="max-width:700px">
          ${volData.map((v: any, i: number) => {
            const h = Math.round((v.count / maxVol) * 100)
            return `<rect x="${i * (barWidth + 2)}" y="${100 - h}" width="${barWidth}" height="${h}" rx="2" fill="${primaryColor}" opacity="0.8"/>
                    <text x="${i * (barWidth + 2) + barWidth / 2}" y="115" font-size="7" fill="#888" text-anchor="middle">${String(v.day).slice(5)}</text>`
          }).join('')}
        </svg>` : '<p style="color:#888">Keine Daten</p>'

      // Category bars
      const catData = categories as any[]
      const maxCat = Math.max(...catData.map((c: any) => c.count), 1)

      // Donut SVG for priorities
      const prioData = priorities as any[]
      const prioTotal = prioData.reduce((s: number, p: any) => s + p.count, 0) || 1
      let prioArc = 0
      const donutSegments = prioData.map((p: any) => {
        const pct = p.count / prioTotal
        const start = prioArc
        prioArc += pct
        const r = 70, cx = 90, cy = 90
        const x1 = cx + r * Math.cos(2 * Math.PI * start - Math.PI / 2)
        const y1 = cy + r * Math.sin(2 * Math.PI * start - Math.PI / 2)
        const x2 = cx + r * Math.cos(2 * Math.PI * (start + pct) - Math.PI / 2)
        const y2 = cy + r * Math.sin(2 * Math.PI * (start + pct) - Math.PI / 2)
        const large = pct > 0.5 ? 1 : 0
        return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z" fill="${prioColor[p.priority] || '#888'}" opacity="0.85"/>`
      }).join('')

      // Resolved rate
      const resolvedPct = kpi.total > 0 ? Math.round(((kpi.resolved_count || 0) / kpi.total) * 100) : 0

      const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${companyName} — IT-Report ${fromLabel} – ${toLabel}</title>
<style>
  @page { margin: 0; size: A4 landscape; }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .slide { page-break-after: always; page-break-inside: avoid; }
    .slide:last-child { page-break-after: auto; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; color: #e8eaed; background: #0d1117; }

  .slide { width: 100vw; min-height: 100vh; padding: 60px 80px; display: flex; flex-direction: column; justify-content: center; position: relative; overflow: hidden; background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #1c2333 100%); }
  .slide::before { content: ''; position: absolute; top: -50%; right: -30%; width: 80%; height: 200%; background: radial-gradient(ellipse, ${primaryColor}08 0%, transparent 70%); pointer-events: none; }

  .top-bar { position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, ${primaryColor}, ${primaryColor}88, transparent); }
  .slide-num { position: absolute; bottom: 30px; right: 50px; font-size: 13px; color: #484f58; font-weight: 500; }
  .watermark { position: absolute; bottom: 30px; left: 50px; font-size: 12px; color: #30363d; }

  h1 { font-size: 42px; font-weight: 700; letter-spacing: -1px; line-height: 1.1; }
  h1 span { color: ${primaryColor}; }
  h2 { font-size: 28px; font-weight: 600; margin-bottom: 30px; letter-spacing: -0.5px; }
  h2::after { content: ''; display: block; width: 40px; height: 3px; background: ${primaryColor}; margin-top: 10px; border-radius: 2px; }
  .subtitle { font-size: 18px; color: #8b949e; margin-top: 12px; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 10px; }
  .kpi-card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 28px; position: relative; overflow: hidden; }
  .kpi-card::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 16px 16px 0 0; }
  .kpi-card.accent::after { background: ${primaryColor}; }
  .kpi-card.green::after { background: #22c55e; }
  .kpi-card.amber::after { background: #f59e0b; }
  .kpi-card.red::after { background: #ef4444; }
  .kpi-value { font-size: 44px; font-weight: 800; letter-spacing: -2px; line-height: 1; }
  .kpi-value.accent { color: ${primaryColor}; }
  .kpi-value.green { color: #22c55e; }
  .kpi-value.amber { color: #f59e0b; }
  .kpi-label { font-size: 13px; color: #8b949e; margin-top: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 500; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: start; }
  .three-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; }

  .chart-card { background: #161b22; border: 1px solid #30363d; border-radius: 16px; padding: 28px; }
  .chart-title { font-size: 14px; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }

  .bar-row { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
  .bar-label { width: 130px; font-size: 14px; color: #c9d1d9; flex-shrink: 0; font-weight: 500; }
  .bar-track { flex: 1; height: 28px; background: #21262d; border-radius: 14px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 14px; background: linear-gradient(90deg, ${primaryColor}, ${primaryColor}bb); }
  .bar-val { width: 100px; text-align: right; font-size: 13px; color: #8b949e; flex-shrink: 0; }

  .sla-ring { width: 180px; height: 180px; position: relative; }
  .sla-ring svg { transform: rotate(-90deg); }
  .sla-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .sla-pct { font-size: 42px; font-weight: 800; letter-spacing: -2px; }

  .agent-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid #21262d; }
  .agent-row:last-child { border-bottom: none; }
  .agent-avatar { width: 36px; height: 36px; border-radius: 10px; background: ${primaryColor}22; color: ${primaryColor}; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
  .agent-name { font-weight: 600; font-size: 15px; color: #e8eaed; }
  .agent-stats { display: flex; gap: 20px; margin-left: auto; font-size: 13px; color: #8b949e; }
  .agent-stats strong { color: #e8eaed; }

  .prio-legend { display: flex; gap: 24px; flex-wrap: wrap; margin-top: 20px; }
  .prio-item { display: flex; align-items: center; gap: 8px; font-size: 15px; }
  .prio-dot { width: 14px; height: 14px; border-radius: 4px; }
  .prio-count { font-size: 24px; font-weight: 700; }

  .volume-chart { overflow-x: auto; }

  .print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #161b22; border-top: 1px solid #30363d; padding: 12px 40px; display: flex; align-items: center; justify-content: center; gap: 12px; z-index: 100; }
  .btn { padding: 10px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
  .btn-primary { background: ${primaryColor}; color: #fff; }
  .btn-primary:hover { opacity: 0.9; }
  .btn-ghost { background: transparent; border: 1px solid #30363d; color: #8b949e; }
  .btn-ghost:hover { border-color: #484f58; color: #e8eaed; }
</style>
</head>
<body>

<!-- Print bar -->
<div class="print-bar no-print">
  <button class="btn btn-primary" onclick="window.print()">Als PDF speichern</button>
  <button class="btn btn-ghost" onclick="document.body.style.background='#fff';document.querySelectorAll('.slide').forEach(s=>{s.style.background='#fff';s.style.color='#1a1a2e'})">Heller Modus</button>
  <button class="btn btn-ghost" onclick="document.body.style.background='#0d1117';document.querySelectorAll('.slide').forEach(s=>{s.style.background='';s.style.color=''})">Dunkler Modus</button>
</div>

<!-- SLIDE 1: Cover -->
<div class="slide" style="justify-content:center;align-items:center;text-align:center">
  <div class="top-bar"></div>
  <div style="font-size:14px;color:${primaryColor};text-transform:uppercase;letter-spacing:3px;font-weight:600;margin-bottom:24px">IT Service Report</div>
  <h1><span>${companyName}</span></h1>
  <p class="subtitle">${fromLabel} – ${toLabel} · ${days} Tage</p>
  <div style="margin-top:60px;display:flex;gap:40px;justify-content:center">
    <div style="text-align:center"><div style="font-size:48px;font-weight:800;color:${primaryColor}">${kpi.total || 0}</div><div style="font-size:13px;color:#8b949e;margin-top:4px">TICKETS</div></div>
    <div style="width:1px;background:#30363d"></div>
    <div style="text-align:center"><div style="font-size:48px;font-weight:800;color:#22c55e">${resolvedPct}%</div><div style="font-size:13px;color:#8b949e;margin-top:4px">GELÖST</div></div>
    <div style="width:1px;background:#30363d"></div>
    <div style="text-align:center"><div style="font-size:48px;font-weight:800;color:#f59e0b">${kpi.avg_hours || '—'}h</div><div style="font-size:13px;color:#8b949e;margin-top:4px">Ø LÖSUNGSZEIT</div></div>
  </div>
  <div class="watermark">${companyName}</div>
  <div class="slide-num">1</div>
</div>

<!-- SLIDE 2: KPIs -->
<div class="slide">
  <div class="top-bar"></div>
  <h2>Kennzahlen im Überblick</h2>
  <div class="kpi-grid">
    <div class="kpi-card accent"><div class="kpi-card-inner"><div class="kpi-value accent">${kpi.total || 0}</div><div class="kpi-label">Tickets gesamt</div></div></div>
    <div class="kpi-card amber"><div class="kpi-value amber">${kpi.open_count || 0}</div><div class="kpi-label">Aktuell offen</div></div>
    <div class="kpi-card green"><div class="kpi-value green">${kpi.resolved_count || 0}</div><div class="kpi-label">Gelöst / Geschlossen</div></div>
    <div class="kpi-card"><div class="kpi-value" style="color:#e8eaed">${kpi.avg_hours || '—'}<span style="font-size:24px;color:#8b949e">h</span></div><div class="kpi-label">Ø Lösungszeit</div></div>
  </div>
  ${slaPct !== null ? `
  <div style="margin-top:40px" class="two-col">
    <div class="chart-card" style="display:flex;align-items:center;gap:30px">
      <div class="sla-ring">
        <svg width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="70" fill="none" stroke="#21262d" stroke-width="14"/>
          <circle cx="90" cy="90" r="70" fill="none" stroke="${slaPct >= 80 ? '#22c55e' : slaPct >= 60 ? '#f59e0b' : '#ef4444'}" stroke-width="14" stroke-linecap="round"
            stroke-dasharray="${Math.round(slaPct * 4.4)} 440"/>
        </svg>
        <div class="sla-center">
          <div class="sla-pct" style="color:${slaPct >= 80 ? '#22c55e' : slaPct >= 60 ? '#f59e0b' : '#ef4444'}">${slaPct}%</div>
          <div style="font-size:11px;color:#8b949e">SLA</div>
        </div>
      </div>
      <div>
        <div class="chart-title">SLA-Einhaltung</div>
        <div style="font-size:14px;color:#c9d1d9;line-height:1.8">
          <span style="color:#22c55e;font-weight:600">${kpi.sla_ok || 0}</span> eingehalten<br>
          <span style="color:#ef4444;font-weight:600">${kpi.sla_breached || 0}</span> überschritten
        </div>
      </div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Prioritäten</div>
      <svg viewBox="0 0 180 180" width="160" height="160" style="display:block;margin:0 auto">
        ${donutSegments}
        <circle cx="90" cy="90" r="45" fill="#161b22"/>
        <text x="90" y="86" text-anchor="middle" fill="#e8eaed" font-size="28" font-weight="800">${prioTotal}</text>
        <text x="90" y="105" text-anchor="middle" fill="#8b949e" font-size="11">GESAMT</text>
      </svg>
      <div class="prio-legend" style="justify-content:center;margin-top:12px">
        ${prioData.map((p: any) => `<div class="prio-item"><div class="prio-dot" style="background:${prioColor[p.priority]||'#888'}"></div><span style="color:#8b949e">${prioLabel[p.priority]||p.priority}</span> <strong style="color:#e8eaed;margin-left:4px">${p.count}</strong></div>`).join('')}
      </div>
    </div>
  </div>` : ''}
  <div class="watermark">${companyName}</div>
  <div class="slide-num">2</div>
</div>

<!-- SLIDE 3: Volume + Categories -->
<div class="slide">
  <div class="top-bar"></div>
  <h2>Ticket-Volumen & Kategorien</h2>
  <div class="two-col">
    <div class="chart-card">
      <div class="chart-title">Tickets pro Tag</div>
      <div class="volume-chart">
        <svg width="100%" viewBox="0 0 ${Math.max(volData.length * (barWidth + 2), 100)} 140" preserveAspectRatio="none">
          <defs><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${primaryColor}"/><stop offset="100%" stop-color="${primaryColor}44"/></linearGradient></defs>
          ${volData.map((v: any, i: number) => {
            const h = Math.round((v.count / maxVol) * 110)
            return `<rect x="${i * (barWidth + 2)}" y="${120 - h}" width="${barWidth}" height="${h}" rx="3" fill="url(#vg)"/>
                    ${i % Math.max(Math.floor(volData.length / 8), 1) === 0 ? `<text x="${i * (barWidth + 2) + barWidth / 2}" y="136" font-size="8" fill="#484f58" text-anchor="middle">${String(v.day).slice(5)}</text>` : ''}`
          }).join('')}
        </svg>
      </div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Nach Kategorie</div>
      ${catData.slice(0, 8).map((c: any) => `
        <div class="bar-row">
          <div class="bar-label">${c.category || 'Sonstiges'}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((c.count / maxCat) * 100)}%"></div></div>
          <div class="bar-val"><strong>${c.count}</strong> · Ø ${c.avg_hours || '—'}h</div>
        </div>
      `).join('')}
    </div>
  </div>
  <div class="watermark">${companyName}</div>
  <div class="slide-num">3</div>
</div>

<!-- SLIDE 4: Agents -->
<div class="slide">
  <div class="top-bar"></div>
  <h2>Team-Performance</h2>
  <div class="chart-card">
    ${(agents as any[]).length === 0 ? '<p style="color:#8b949e;text-align:center;padding:40px">Keine Agenten-Daten im Zeitraum</p>' :
      (agents as any[]).map((a: any) => {
        const initials = a.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        return `<div class="agent-row">
          <div class="agent-avatar">${initials}</div>
          <div class="agent-name">${a.name}</div>
          <div class="agent-stats">
            <div><strong>${a.total_assigned}</strong> zugewiesen</div>
            <div><strong style="color:#22c55e">${a.resolved}</strong> gelöst</div>
            <div><strong>${a.avg_hours !== null ? a.avg_hours + 'h' : '—'}</strong> Ø Zeit</div>
          </div>
        </div>`
      }).join('')}
  </div>
  <div class="watermark">${companyName}</div>
  <div class="slide-num">4</div>
</div>

<!-- SLIDE 5: Closing -->
<div class="slide" style="justify-content:center;align-items:center;text-align:center">
  <div class="top-bar"></div>
  <div style="font-size:14px;color:#8b949e;text-transform:uppercase;letter-spacing:3px;margin-bottom:20px">Zusammenfassung</div>
  <div style="display:flex;gap:60px;margin-bottom:50px">
    <div>
      <div style="font-size:64px;font-weight:800;color:${primaryColor}">${kpi.total || 0}</div>
      <div style="font-size:14px;color:#8b949e;margin-top:4px">Tickets bearbeitet</div>
    </div>
    <div>
      <div style="font-size:64px;font-weight:800;color:#22c55e">${resolvedPct}%</div>
      <div style="font-size:14px;color:#8b949e;margin-top:4px">Lösungsquote</div>
    </div>
    <div>
      <div style="font-size:64px;font-weight:800;color:#f59e0b">${kpi.avg_hours || '—'}<span style="font-size:32px">h</span></div>
      <div style="font-size:14px;color:#8b949e;margin-top:4px">Ø Lösungszeit</div>
    </div>
  </div>
  <p style="color:#30363d;font-size:13px">${companyName} · IT Service Report · ${fromLabel} – ${toLabel}</p>
  <p style="color:#21262d;font-size:11px;margin-top:8px">Generiert am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</p>
  <div class="watermark">${companyName}</div>
  <div class="slide-num">5</div>
</div>

</body>
</html>`

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    },
  },

  Component: AnalyticsPage,
}

export default plugin
