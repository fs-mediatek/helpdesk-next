import type { HelpdeskPlugin } from '../../src/lib/plugins/types'
import { AssetsPage } from './components/AssetsPage'
import { NextResponse } from 'next/server'

const plugin: HelpdeskPlugin = {
  manifest: {
    id: 'assets',
    name: 'Asset-Verwaltung',
    version: '1.0.0',
    description: 'IT-Hardware Assets, Inventar und Lieferantenverwaltung',
    icon: 'Package',
    navItems: [
      { label: 'Assets', href: '/', icon: 'Monitor' },
      { label: 'Inventar', href: '/inventory', icon: 'Package' },
      { label: 'Lieferanten', href: '/suppliers', icon: 'Truck' },
    ],
  },

  migrations: [
    `CREATE TABLE IF NOT EXISTS assets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asset_tag VARCHAR(50) UNIQUE,
      type VARCHAR(50),
      brand VARCHAR(100),
      model VARCHAR(100),
      serial_number VARCHAR(100),
      status ENUM('available','assigned','maintenance','retired') DEFAULT 'available',
      assigned_to_user_id INT,
      purchase_date DATE,
      warranty_until DATE,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_assigned (assigned_to_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],

  api: {
    'GET /': async (_req, ctx) => {
      const assets = await ctx.db.query(
        `SELECT a.*, u.name as assigned_to_name
         FROM assets a LEFT JOIN users u ON a.assigned_to_user_id = u.id
         ORDER BY a.created_at DESC`
      )
      return NextResponse.json(assets)
    },

    'POST /': async (req, ctx) => {
      const body = await req.json()
      const { asset_tag, type, brand, model, serial_number, purchase_date, warranty_until, notes } = body
      if (!asset_tag || !type) {
        return NextResponse.json({ error: 'asset_tag und type erforderlich' }, { status: 400 })
      }
      const id = await ctx.db.insert(
        `INSERT INTO assets (asset_tag, type, brand, model, serial_number, purchase_date, warranty_until, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [asset_tag, type, brand, model, serial_number, purchase_date || null, warranty_until || null, notes || null]
      )
      return NextResponse.json({ id }, { status: 201 })
    },

    'GET /:id': async (_req, ctx) => {
      const asset = await ctx.db.queryOne(
        `SELECT a.*, u.name as assigned_to_name FROM assets a
         LEFT JOIN users u ON a.assigned_to_user_id = u.id WHERE a.id = ?`,
        [ctx.params.id]
      )
      if (!asset) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 })
      return NextResponse.json(asset)
    },

    'PUT /:id': async (req, ctx) => {
      const body = await req.json()
      const allowed = ['asset_tag','type','brand','model','serial_number','status','assigned_to_user_id','purchase_date','warranty_until','notes']
      const updates = Object.entries(body).filter(([k]) => allowed.includes(k))
      if (updates.length === 0) return NextResponse.json({ error: 'Keine Felder' }, { status: 400 })
      const sets = updates.map(([k]) => `${k} = ?`).join(', ')
      const vals = updates.map(([, v]) => v)
      await ctx.db.query(`UPDATE assets SET ${sets} WHERE id = ?`, [...vals, ctx.params.id])
      return NextResponse.json({ success: true })
    },

    'DELETE /:id': async (_req, ctx) => {
      await ctx.db.query('DELETE FROM assets WHERE id = ?', [ctx.params.id])
      return NextResponse.json({ success: true })
    },
  },

  Component: AssetsPage,
}

export default plugin
