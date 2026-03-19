import type { HelpdeskPlugin } from '../../src/lib/plugins/types'
import { NextResponse } from 'next/server'
import NetworkPage from './components/NetworkPage'

// ---- Ping helper (server-side) ----
import { exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)

async function pingHost(ip: string): Promise<{ status: 'up' | 'down' | 'timeout'; response_time_ms: number | null }> {
  const isWindows = process.platform === 'win32'
  const cmd = isWindows ? `ping -n 1 -w 1000 ${ip}` : `ping -c 1 -W 1 ${ip}`
  try {
    const start = Date.now()
    const { stdout } = await execAsync(cmd, { timeout: 3000 })
    const elapsed = Date.now() - start
    const isUp = isWindows ? stdout.includes('TTL=') : stdout.includes('1 received')
    return isUp ? { status: 'up', response_time_ms: elapsed } : { status: 'down', response_time_ms: null }
  } catch {
    return { status: 'timeout', response_time_ms: null }
  }
}

const plugin: HelpdeskPlugin = {
  manifest: {
    id: 'network-monitor',
    name: 'Netzwerk',
    version: '1.0.0',
    description: 'Netzwerk-Geräteüberwachung mit Ping und HTTP-Checks',
    icon: 'Wifi',
    navItems: [
      { label: 'Netzwerk', href: '/', icon: 'Wifi' },
    ],
  },

  migrations: [
    `CREATE TABLE IF NOT EXISTS network_devices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      ip_address VARCHAR(45) NOT NULL,
      type ENUM('router','switch','server','printer','camera','other') DEFAULT 'other',
      description TEXT,
      is_monitored TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS ping_results (
      id INT AUTO_INCREMENT PRIMARY KEY,
      device_id INT NOT NULL,
      status ENUM('up','down','timeout') NOT NULL,
      response_time_ms INT,
      checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_device_time (device_id, checked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    // Remove duplicate devices — keep only the row with the lowest id per (name, ip_address)
    `DELETE n1 FROM network_devices n1
     INNER JOIN network_devices n2
     WHERE n1.name = n2.name AND n1.ip_address = n2.ip_address AND n1.id > n2.id`,
  ],

  api: {
    // GET /devices — list all devices with latest status
    'GET /devices': async (_req, ctx) => {
      const devices = await ctx.db.query(`
        SELECT d.*,
          (SELECT status FROM ping_results WHERE device_id = d.id ORDER BY checked_at DESC LIMIT 1) as last_status,
          (SELECT response_time_ms FROM ping_results WHERE device_id = d.id ORDER BY checked_at DESC LIMIT 1) as last_response_time,
          (SELECT checked_at FROM ping_results WHERE device_id = d.id ORDER BY checked_at DESC LIMIT 1) as last_check
        FROM network_devices d ORDER BY d.name
      `)
      return NextResponse.json({ success: true, data: devices })
    },

    // POST /devices — create device
    'POST /devices': async (req, ctx) => {
      const body = await req.json()
      const { name, ip_address, type, description } = body
      if (!name || !ip_address) {
        return NextResponse.json({ success: false, error: 'Name und IP erforderlich' }, { status: 400 })
      }
      const id = await ctx.db.insert(
        'INSERT INTO network_devices (name, ip_address, type, description) VALUES (?, ?, ?, ?)',
        [name, ip_address, type || 'other', description || null]
      )
      const device = await ctx.db.queryOne('SELECT * FROM network_devices WHERE id = ?', [id])
      return NextResponse.json({ success: true, data: device }, { status: 201 })
    },

    // PUT /devices/:id — update device
    'PUT /devices/:id': async (req, ctx) => {
      const { id } = ctx.params
      const body = await req.json()
      const { name, ip_address, type, description, is_monitored } = body
      await ctx.db.query(
        'UPDATE network_devices SET name=?, ip_address=?, type=?, description=?, is_monitored=? WHERE id=?',
        [name, ip_address, type, description, is_monitored ? 1 : 0, id]
      )
      const device = await ctx.db.queryOne('SELECT * FROM network_devices WHERE id = ?', [id])
      return NextResponse.json({ success: true, data: device })
    },

    // DELETE /devices/:id — delete device and its ping results
    'DELETE /devices/:id': async (_req, ctx) => {
      const { id } = ctx.params
      await ctx.db.query('DELETE FROM ping_results WHERE device_id = ?', [id])
      await ctx.db.query('DELETE FROM network_devices WHERE id = ?', [id])
      return NextResponse.json({ success: true })
    },

    // POST /devices/:id/ping — manually ping a device
    'POST /devices/:id/ping': async (_req, ctx) => {
      const { id } = ctx.params
      const device = await ctx.db.queryOne<{ id: number; ip_address: string }>('SELECT * FROM network_devices WHERE id = ?', [id])
      if (!device) {
        return NextResponse.json({ success: false, error: 'Gerät nicht gefunden' }, { status: 404 })
      }
      const result = await pingHost(device.ip_address)
      await ctx.db.insert(
        'INSERT INTO ping_results (device_id, status, response_time_ms) VALUES (?, ?, ?)',
        [id, result.status, result.response_time_ms]
      )
      return NextResponse.json({ success: true, data: result })
    },

    // GET /devices/:id/history — last 50 ping results for a device
    'GET /devices/:id/history': async (_req, ctx) => {
      const { id } = ctx.params
      const history = await ctx.db.query(
        'SELECT status, response_time_ms, checked_at FROM ping_results WHERE device_id = ? ORDER BY checked_at DESC LIMIT 50',
        [id]
      )
      return NextResponse.json({ success: true, data: history })
    },

    // GET /stats — uptime stats per device
    'GET /stats': async (_req, ctx) => {
      const devices = await ctx.db.query<{ id: number; name: string }>('SELECT id, name FROM network_devices ORDER BY name')
      const stats = await Promise.all(
        devices.map(async (d) => {
          const total24h = await ctx.db.queryOne<{ c: number }>(
            'SELECT COUNT(*) as c FROM ping_results WHERE device_id = ? AND checked_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)',
            [d.id]
          )
          const up24h = await ctx.db.queryOne<{ c: number }>(
            "SELECT COUNT(*) as c FROM ping_results WHERE device_id = ? AND checked_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) AND status = 'up'",
            [d.id]
          )
          const total7d = await ctx.db.queryOne<{ c: number }>(
            'SELECT COUNT(*) as c FROM ping_results WHERE device_id = ? AND checked_at > DATE_SUB(NOW(), INTERVAL 7 DAY)',
            [d.id]
          )
          const up7d = await ctx.db.queryOne<{ c: number }>(
            "SELECT COUNT(*) as c FROM ping_results WHERE device_id = ? AND checked_at > DATE_SUB(NOW(), INTERVAL 7 DAY) AND status = 'up'",
            [d.id]
          )
          return {
            device_id: d.id,
            name: d.name,
            uptime_24h: (total24h?.c ?? 0) > 0
              ? (((up24h?.c ?? 0) / (total24h?.c ?? 1)) * 100).toFixed(1)
              : null,
            uptime_7d: (total7d?.c ?? 0) > 0
              ? (((up7d?.c ?? 0) / (total7d?.c ?? 1)) * 100).toFixed(1)
              : null,
          }
        })
      )
      return NextResponse.json({ success: true, data: stats })
    },
  },

  Component: NetworkPage,

  onLoad: () => {
    const mysql = require('mysql2/promise')
    const { exec: execCb } = require('child_process')
    const { promisify: prom } = require('util')
    const execA = prom(execCb)

    const intervalMs = parseInt(process.env.PING_INTERVAL_MINUTES || '5') * 60 * 1000

    const doCheck = async () => {
      let conn: any
      try {
        conn = await mysql.createConnection({
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '3306'),
          database: process.env.DB_NAME || 'helpdesk',
          user: process.env.DB_USER || 'root',
          password: process.env.DB_PASSWORD || '',
        })
        const [devices] = await conn.execute('SELECT id, ip_address FROM network_devices WHERE is_monitored = 1')
        for (const device of devices as any[]) {
          const isWindows = process.platform === 'win32'
          const cmd = isWindows
            ? `ping -n 1 -w 1000 ${device.ip_address}`
            : `ping -c 1 -W 1 ${device.ip_address}`
          let status = 'timeout'
          let response_time_ms: number | null = null
          try {
            const start = Date.now()
            const { stdout } = await execA(cmd, { timeout: 3000 })
            const elapsed = Date.now() - start
            const isUp = isWindows ? stdout.includes('TTL=') : stdout.includes('1 received')
            status = isUp ? 'up' : 'down'
            response_time_ms = isUp ? elapsed : null
          } catch { /* timeout or error → status stays 'timeout' */ }
          await conn.execute(
            'INSERT INTO ping_results (device_id, status, response_time_ms) VALUES (?, ?, ?)',
            [device.id, status, response_time_ms]
          )
        }
        // Cleanup results older than 7 days
        await conn.execute("DELETE FROM ping_results WHERE checked_at < DATE_SUB(NOW(), INTERVAL 7 DAY)")
      } catch (e) {
        console.error('[network-monitor] polling error:', e)
      } finally {
        if (conn) await conn.end().catch(() => {})
      }
    }

    // Run immediately, then on interval
    doCheck().catch(console.error)
    setInterval(() => doCheck().catch(console.error), intervalMs)
    console.log(`[network-monitor] Background polling started, interval: ${intervalMs / 60000}min`)
  },
}

export default plugin
