import type { HelpdeskPlugin } from '../../src/lib/plugins/types'
import { NextResponse } from 'next/server'
import OnboardingPage from './components/OnboardingPage'

const plugin: HelpdeskPlugin = {
  manifest: {
    id: 'onboarding',
    name: 'On- & Offboarding',
    version: '1.0.0',
    description: 'Mitarbeiter-Onboarding und -Offboarding Workflows',
    icon: 'UserPlus',
    navItems: [
      { label: 'On- & Offboarding', href: '/', icon: 'UserPlus' },
      { label: 'Onboarding', href: '/onboarding', icon: 'UserPlus' },
      { label: 'Offboarding', href: '/offboarding', icon: 'UserMinus' },
      { label: 'Konfiguration', href: '/settings', icon: 'Settings' },
    ],
  },

  migrations: [
    `CREATE TABLE IF NOT EXISTS onboarding_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type ENUM('onboarding','offboarding') DEFAULT 'onboarding',
      employee_name VARCHAR(200) NOT NULL,
      employee_email VARCHAR(200),
      department VARCHAR(100),
      start_date DATE,
      end_date DATE,
      status ENUM('pending','in_progress','completed','cancelled') DEFAULT 'pending',
      assigned_to_id INT,
      form_data JSON,
      hardware_json JSON,
      checklist JSON,
      notes TEXT,
      created_by_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // Ensure columns exist for tables created by the legacy system.
    // Each runs independently — "Duplicate column" errors are caught and ignored by the runner.
    `ALTER TABLE onboarding_requests ADD COLUMN type ENUM('onboarding','offboarding') DEFAULT 'onboarding'`,
    `ALTER TABLE onboarding_requests ADD COLUMN employee_email VARCHAR(200)`,
    `ALTER TABLE onboarding_requests ADD COLUMN department VARCHAR(100)`,
    `ALTER TABLE onboarding_requests ADD COLUMN start_date DATE`,
    `ALTER TABLE onboarding_requests ADD COLUMN end_date DATE`,
    `ALTER TABLE onboarding_requests ADD COLUMN assigned_to_id INT`,
    `ALTER TABLE onboarding_requests ADD COLUMN form_data JSON`,
    `ALTER TABLE onboarding_requests ADD COLUMN hardware_json JSON`,
    `ALTER TABLE onboarding_requests ADD COLUMN notes TEXT`,
    `ALTER TABLE onboarding_requests ADD COLUMN created_by_id INT`,
    `ALTER TABLE onboarding_requests ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,

    `CREATE TABLE IF NOT EXISTS onboarding_checklist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL,
      item VARCHAR(300) NOT NULL,
      done TINYINT(1) DEFAULT 0,
      done_by_id INT,
      done_at TIMESTAMP NULL,
      INDEX idx_request (request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS onboarding_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type ENUM('onboarding','offboarding') DEFAULT 'onboarding',
      default_checklist JSON,
      form_fields JSON,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],

  api: {
    // GET / — list all requests with optional type= and status= filters
    'GET /': async (_req, ctx) => {
      const type = ctx.searchParams.get('type')
      const status = ctx.searchParams.get('status')

      let sql = `
        SELECT r.*, u.name as assigned_to_name
        FROM onboarding_requests r
        LEFT JOIN users u ON r.assigned_to_id = u.id
        WHERE 1=1
      `
      const params: any[] = []
      if (type) { sql += ' AND r.type = ?'; params.push(type) }
      if (status) { sql += ' AND r.status = ?'; params.push(status) }
      sql += ' ORDER BY r.created_at DESC'

      const requests = await ctx.db.query(sql, params)
      return NextResponse.json({ success: true, data: requests })
    },

    // POST / — create request and seed checklist from config
    'POST /': async (req, ctx) => {
      const body = await req.json()
      const { type = 'onboarding', employee_name, employee_email, department, start_date, end_date, notes } = body

      if (!employee_name) {
        return NextResponse.json({ success: false, error: 'Mitarbeitername erforderlich' }, { status: 400 })
      }

      const id = await ctx.db.insert(
        `INSERT INTO onboarding_requests
          (type, employee_name, employee_email, department, start_date, end_date, notes, created_by_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [type, employee_name, employee_email || null, department || null,
         start_date || null, end_date || null, notes || null, ctx.session.userId]
      )

      // Seed checklist from onboarding_config
      const config = await ctx.db.queryOne<{ default_checklist: any }>(
        'SELECT default_checklist FROM onboarding_config WHERE type = ? ORDER BY id DESC LIMIT 1',
        [type]
      )
      if (config?.default_checklist) {
        let items: string[] = []
        try {
          items = typeof config.default_checklist === 'string'
            ? JSON.parse(config.default_checklist)
            : config.default_checklist
        } catch { /* ignore parse error */ }
        for (const item of items) {
          if (item) {
            await ctx.db.insert(
              'INSERT INTO onboarding_checklist (request_id, item) VALUES (?, ?)',
              [id, item]
            )
          }
        }
      }

      const request = await ctx.db.queryOne('SELECT * FROM onboarding_requests WHERE id = ?', [id])
      return NextResponse.json({ success: true, data: request }, { status: 201 })
    },

    // GET /:id — request detail with checklist items
    'GET /:id': async (_req, ctx) => {
      const { id } = ctx.params
      const request = await ctx.db.queryOne(`
        SELECT r.*, u.name as assigned_to_name
        FROM onboarding_requests r
        LEFT JOIN users u ON r.assigned_to_id = u.id
        WHERE r.id = ?
      `, [id])
      if (!request) {
        return NextResponse.json({ success: false, error: 'Nicht gefunden' }, { status: 404 })
      }
      const checklist = await ctx.db.query(
        'SELECT * FROM onboarding_checklist WHERE request_id = ? ORDER BY id',
        [id]
      )
      return NextResponse.json({ success: true, data: { ...request, checklist } })
    },

    // PUT /:id — update status, assigned_to_id, notes
    'PUT /:id': async (req, ctx) => {
      const { id } = ctx.params
      const body = await req.json()
      const { status, assigned_to_id, notes } = body
      await ctx.db.insert(
        'UPDATE onboarding_requests SET status=COALESCE(?,status), assigned_to_id=COALESCE(?,assigned_to_id), notes=COALESCE(?,notes) WHERE id=?',
        [status ?? null, assigned_to_id ?? null, notes ?? null, id]
      )
      const request = await ctx.db.queryOne('SELECT * FROM onboarding_requests WHERE id = ?', [id])
      return NextResponse.json({ success: true, data: request })
    },

    // GET /:id/checklist — get checklist items
    'GET /:id/checklist': async (_req, ctx) => {
      const { id } = ctx.params
      const checklist = await ctx.db.query(
        'SELECT * FROM onboarding_checklist WHERE request_id = ? ORDER BY id',
        [id]
      )
      return NextResponse.json({ success: true, data: checklist })
    },

    // POST /:id/checklist/:itemId/toggle — toggle done state
    'POST /:id/checklist/:itemId/toggle': async (_req, ctx) => {
      const { itemId } = ctx.params
      const item = await ctx.db.queryOne<{ id: number; done: number }>(
        'SELECT * FROM onboarding_checklist WHERE id = ?',
        [itemId]
      )
      if (!item) {
        return NextResponse.json({ success: false, error: 'Nicht gefunden' }, { status: 404 })
      }
      const newDone = item.done ? 0 : 1
      await ctx.db.insert(
        'UPDATE onboarding_checklist SET done=?, done_by_id=?, done_at=? WHERE id=?',
        [newDone, newDone ? ctx.session.userId : null, newDone ? new Date() : null, itemId]
      )
      const updated = await ctx.db.queryOne('SELECT * FROM onboarding_checklist WHERE id = ?', [itemId])
      return NextResponse.json({ success: true, data: updated })
    },

    // GET /stats — aggregate stats
    'GET /stats': async (_req, ctx) => {
      const now = new Date()
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString().slice(0, 10)

      const [totalOnboarding, totalOffboarding, active, completedThisMonth] = await Promise.all([
        ctx.db.queryOne<{ c: number }>(
          "SELECT COUNT(*) as c FROM onboarding_requests WHERE type='onboarding'"
        ),
        ctx.db.queryOne<{ c: number }>(
          "SELECT COUNT(*) as c FROM onboarding_requests WHERE type='offboarding'"
        ),
        ctx.db.queryOne<{ c: number }>(
          "SELECT COUNT(*) as c FROM onboarding_requests WHERE status IN ('pending','in_progress')"
        ),
        ctx.db.queryOne<{ c: number }>(
          "SELECT COUNT(*) as c FROM onboarding_requests WHERE status='completed' AND updated_at >= ?",
          [firstOfMonth]
        ),
      ])

      return NextResponse.json({
        success: true,
        data: {
          total_onboarding: totalOnboarding?.c ?? 0,
          total_offboarding: totalOffboarding?.c ?? 0,
          active: active?.c ?? 0,
          completed_this_month: completedThisMonth?.c ?? 0,
        },
      })
    },

    // GET /config — get onboarding_config entries
    'GET /config': async (_req, ctx) => {
      const configs = await ctx.db.query('SELECT * FROM onboarding_config ORDER BY id')
      return NextResponse.json({ success: true, data: configs })
    },

    // PUT /config — update onboarding_config
    'PUT /config': async (req, ctx) => {
      const body = await req.json()
      const { type = 'onboarding', default_checklist, form_fields } = body

      const existing = await ctx.db.queryOne<{ id: number }>(
        'SELECT id FROM onboarding_config WHERE type = ? LIMIT 1',
        [type]
      )
      if (existing) {
        await ctx.db.insert(
          'UPDATE onboarding_config SET default_checklist=?, form_fields=? WHERE id=?',
          [JSON.stringify(default_checklist), JSON.stringify(form_fields), existing.id]
        )
      } else {
        await ctx.db.insert(
          'INSERT INTO onboarding_config (type, default_checklist, form_fields) VALUES (?, ?, ?)',
          [type, JSON.stringify(default_checklist), JSON.stringify(form_fields)]
        )
      }
      const config = await ctx.db.queryOne('SELECT * FROM onboarding_config WHERE type = ?', [type])
      return NextResponse.json({ success: true, data: config })
    },
  },

  Component: OnboardingPage,
}

export default plugin
