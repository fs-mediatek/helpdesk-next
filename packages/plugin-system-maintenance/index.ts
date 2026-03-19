import type { HelpdeskPlugin } from '../../src/lib/plugins/types'
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { MaintenancePage } from './components/MaintenancePage'

const BACKUP_DIR = path.join(process.cwd(), 'backups')

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }
}

const plugin: HelpdeskPlugin = {
  manifest: {
    id: 'system-maintenance',
    name: 'Systemwartung',
    version: '1.0.0',
    description: 'System-Wartung, Backups und Datenbankpflege',
    icon: 'Wrench',
    navItems: [
      { label: 'Systemwartung', href: '/', icon: 'Wrench' },
    ],
  },

  api: {
    // ---- System Info ----
    'GET /info': async (_req, _ctx) => {
      const pkgPath = path.join(process.cwd(), 'package.json')
      let appVersion = '?'
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        appVersion = pkg.version || '?'
      } catch {
        // ignore
      }

      return NextResponse.json({
        appVersion,
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      })
    },

    // ---- Optimize Tables ----
    'POST /db/optimize': async (_req, ctx) => {
      const tables = ['tickets', 'users', 'ticket_comments', 'assets', 'inventory_items', 'knowledge_base']
      const results: { table: string; status: string }[] = []

      for (const table of tables) {
        try {
          await ctx.db.query(`OPTIMIZE TABLE \`${table}\``)
          results.push({ table, status: 'OK' })
        } catch (err: unknown) {
          // Table may not exist — record but don't fail
          results.push({
            table,
            status: err instanceof Error ? err.message.slice(0, 80) : 'Error',
          })
        }
      }

      return NextResponse.json({ results, message: `${results.length} Tabellen verarbeitet` })
    },

    // ---- Check Tables ----
    'POST /db/check': async (_req, ctx) => {
      const tables = ['tickets', 'users', 'ticket_comments', 'assets', 'inventory_items', 'knowledge_base']
      const results: { table: string; status: string }[] = []

      for (const table of tables) {
        try {
          const check = await ctx.db.query<Record<string, unknown>>(
            `CHECK TABLE \`${table}\``
          )
          const row = check[0] ?? {}
          results.push({
            table,
            status: String(row['Msg_text'] ?? row['msg_text'] ?? 'OK'),
          })
        } catch (err: unknown) {
          results.push({
            table,
            status: err instanceof Error ? err.message.slice(0, 80) : 'Error',
          })
        }
      }

      return NextResponse.json({ results })
    },

    // ---- Create Backup ----
    'POST /backup': async (_req, ctx) => {
      ensureBackupDir()

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19)
      const filename = `backup-${timestamp}.json`
      const filePath = path.join(BACKUP_DIR, filename)

      // Collect table names
      const tableRows = await ctx.db.query<Record<string, string>>(
        'SHOW TABLES'
      )
      const backup: Record<string, unknown[]> = {}

      for (const row of tableRows) {
        const tableName = Object.values(row)[0]
        try {
          const rows = await ctx.db.query(`SELECT * FROM \`${tableName}\``)
          backup[tableName] = rows
        } catch {
          backup[tableName] = []
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf8')
      const stat = fs.statSync(filePath)

      return NextResponse.json({
        filename,
        size: stat.size,
      })
    },

    // ---- List Backups ----
    'GET /backups': async (_req, _ctx) => {
      ensureBackupDir()

      let files: { name: string; size: number; date: string }[] = []
      try {
        files = fs
          .readdirSync(BACKUP_DIR)
          .filter((f) => f.endsWith('.json') || f.endsWith('.sql'))
          .map((f) => {
            const stat = fs.statSync(path.join(BACKUP_DIR, f))
            return { name: f, size: stat.size, date: stat.mtime.toISOString() }
          })
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      } catch {
        // empty
      }

      return NextResponse.json(files)
    },

    // ---- Delete Backup ----
    'DELETE /backups/:filename': async (_req, ctx) => {
      const rawName = ctx.params.filename
      // Prevent path traversal
      const safe = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '')
      if (!safe) {
        return NextResponse.json({ error: 'Ungültiger Dateiname' }, { status: 400 })
      }
      const filePath = path.join(BACKUP_DIR, safe)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      return NextResponse.json({ success: true })
    },

    // ---- Download Backup ----
    'GET /backups/:filename/download': async (_req, ctx) => {
      const rawName = ctx.params.filename
      const safe = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '')
      if (!safe) {
        return NextResponse.json({ error: 'Ungültiger Dateiname' }, { status: 400 })
      }
      const filePath = path.join(BACKUP_DIR, safe)
      if (!fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'Backup nicht gefunden' }, { status: 404 })
      }
      const content = fs.readFileSync(filePath)
      return new NextResponse(content, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${safe}"`,
        },
      })
    },
  },

  Component: MaintenancePage,
}

export default plugin
