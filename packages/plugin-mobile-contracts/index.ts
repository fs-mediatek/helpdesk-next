import type { HelpdeskPlugin } from '../../src/lib/plugins/types'
import { MobileContractsPage } from './components/MobileContractsPage'
import { NextResponse } from 'next/server'

const plugin: HelpdeskPlugin = {
  manifest: {
    id: 'mobile-contracts',
    name: 'Mobilfunkverträge',
    version: '1.0.0',
    description: 'Verwaltung von Mobilfunkverträgen: Excel-Import, PDF-Rechnungsabgleich, Kostenstellenauswertung, Änderungshistorie.',
    icon: 'Smartphone',
    navItems: [
      { label: 'Mobilfunk', href: '/', icon: 'Smartphone' },
      { label: 'Rechnungen', href: '/invoices', icon: 'FileText' },
      { label: 'Kostenstellen', href: '/cost-centers', icon: 'Building2' },
      { label: 'Auswertung', href: '/analytics', icon: 'BarChart2' },
    ],
  },

  migrations: [
    `CREATE TABLE IF NOT EXISTS mobile_contracts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      phone_number VARCHAR(30) NOT NULL,
      base_price DECIMAL(10,2) DEFAULT 0,
      connection_costs DECIMAL(10,2) DEFAULT 0,
      discount DECIMAL(10,2) DEFAULT 0,
      total_net DECIMAL(10,2) DEFAULT 0,
      total_gross DECIMAL(10,2) DEFAULT 0,
      cost_center_1 VARCHAR(50) DEFAULT NULL,
      cost_center_2 VARCHAR(50) DEFAULT NULL,
      active_user VARCHAR(150) DEFAULT NULL,
      device_id VARCHAR(50) DEFAULT NULL,
      intune_registered VARCHAR(10) DEFAULT NULL,
      pin VARCHAR(20) DEFAULT NULL,
      puk VARCHAR(20) DEFAULT NULL,
      pin2 VARCHAR(20) DEFAULT NULL,
      puk2 VARCHAR(20) DEFAULT NULL,
      second_user VARCHAR(150) DEFAULT NULL,
      second_device_id VARCHAR(50) DEFAULT NULL,
      comment TEXT DEFAULT NULL,
      status VARCHAR(30) DEFAULT 'Aktiv',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_phone (phone_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS mobile_contract_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_id INT NOT NULL,
      field_name VARCHAR(50) NOT NULL,
      old_value TEXT DEFAULT NULL,
      new_value TEXT DEFAULT NULL,
      changed_by INT DEFAULT NULL,
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_contract (contract_id),
      INDEX idx_changed_at (changed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS mobile_invoices (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      invoice_month INT DEFAULT NULL,
      invoice_year INT DEFAULT NULL,
      invoice_date DATE DEFAULT NULL,
      total_net DECIMAL(12,2) DEFAULT 0,
      total_gross DECIMAL(12,2) DEFAULT 0,
      line_count INT DEFAULT 0,
      imported_by INT DEFAULT NULL,
      imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

    `CREATE TABLE IF NOT EXISTS mobile_invoice_lines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      phone_number VARCHAR(30) NOT NULL,
      tariff VARCHAR(100) DEFAULT NULL,
      base_price DECIMAL(10,2) DEFAULT 0,
      discount DECIMAL(10,2) DEFAULT 0,
      surcharges DECIMAL(10,2) DEFAULT 0,
      total_net DECIMAL(10,2) DEFAULT 0,
      contract_id INT DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'matched',
      INDEX idx_invoice (invoice_id),
      INDEX idx_phone (phone_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  ],

  api: {
    // ============================================
    // CONTRACTS — LIST
    // ============================================
    'GET /contracts': async (req, ctx) => {
      const search = ctx.searchParams.get('search')
      const cost_center = ctx.searchParams.get('cost_center')
      const status = ctx.searchParams.get('status')
      const page = parseInt(ctx.searchParams.get('page') || '1')
      const limit = parseInt(ctx.searchParams.get('limit') || '50')
      const offset = (page - 1) * limit

      let where = ' WHERE 1=1'
      const params: any[] = []

      if (search) {
        where += ' AND (c.phone_number LIKE ? OR c.active_user LIKE ? OR c.device_id LIKE ? OR c.second_user LIKE ?)'
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
      }
      if (cost_center) {
        where += ' AND (c.cost_center_1 LIKE ? OR c.cost_center_2 LIKE ?)'
        params.push(`%${cost_center}%`, `%${cost_center}%`)
      }
      if (status) {
        where += ' AND c.status = ?'
        params.push(status)
      }

      const countResult = await ctx.db.queryOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM mobile_contracts c${where}`, params
      )
      const paramsFull = [...params, limit, offset]
      const contracts = await ctx.db.query(
        `SELECT c.* FROM mobile_contracts c${where} ORDER BY c.phone_number ASC LIMIT ? OFFSET ?`,
        paramsFull
      )

      return NextResponse.json({
        success: true,
        data: contracts,
        pagination: {
          page,
          limit,
          total: countResult?.total ?? 0,
          pages: Math.ceil((countResult?.total ?? 0) / limit),
        },
      })
    },

    // ============================================
    // CONTRACTS — STATS
    // ============================================
    'GET /contracts/stats': async (_req, ctx) => {
      const total = await ctx.db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM mobile_contracts')
      const active = await ctx.db.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM mobile_contracts WHERE status != 'Gekündigt'")
      const cancelled = await ctx.db.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM mobile_contracts WHERE status = 'Gekündigt'")
      const totalCostGross = await ctx.db.queryOne<{ s: string }>("SELECT COALESCE(SUM(total_gross), 0) as s FROM mobile_contracts WHERE status != 'Gekündigt'")

      const costCenters = await ctx.db.query(
        `SELECT cost_center_1 as cc, COUNT(*) as cnt, SUM(total_gross) as gross
         FROM mobile_contracts WHERE status != 'Gekündigt' AND cost_center_1 IS NOT NULL AND cost_center_1 != ''
         GROUP BY cost_center_1 ORDER BY gross DESC`
      )

      return NextResponse.json({
        success: true,
        data: {
          total: total?.c ?? 0,
          active: active?.c ?? 0,
          cancelled: cancelled?.c ?? 0,
          monthly_gross: parseFloat(totalCostGross?.s ?? '0'),
          cost_centers: costCenters,
        },
      })
    },

    // ============================================
    // CONTRACTS — SINGLE
    // ============================================
    'GET /contracts/:id': async (_req, ctx) => {
      const contract = await ctx.db.queryOne('SELECT * FROM mobile_contracts WHERE id = ?', [ctx.params.id])
      if (!contract) return NextResponse.json({ success: false, error: 'Vertrag nicht gefunden' }, { status: 404 })
      return NextResponse.json({ success: true, data: contract })
    },

    // ============================================
    // CONTRACTS — CREATE
    // ============================================
    'POST /contracts': async (req, ctx) => {
      const body = await req.json()
      const { phone_number } = body
      if (!phone_number) return NextResponse.json({ success: false, error: 'Rufnummer erforderlich' }, { status: 400 })

      const existing = await ctx.db.queryOne('SELECT id FROM mobile_contracts WHERE phone_number = ?', [phone_number])
      if (existing) return NextResponse.json({ success: false, error: 'Rufnummer bereits vorhanden' }, { status: 409 })

      const fields = ['phone_number', 'base_price', 'connection_costs', 'discount', 'total_net', 'total_gross',
        'cost_center_1', 'cost_center_2', 'active_user', 'device_id', 'intune_registered',
        'pin', 'puk', 'pin2', 'puk2', 'second_user', 'second_device_id', 'comment', 'status']

      const vals = fields.map(f => body[f] !== undefined ? body[f] : null)
      const placeholders = fields.map(() => '?').join(',')
      const insertId = await ctx.db.insert(
        `INSERT INTO mobile_contracts (${fields.join(',')}) VALUES (${placeholders})`, vals
      )

      const contract = await ctx.db.queryOne('SELECT * FROM mobile_contracts WHERE id = ?', [insertId])
      return NextResponse.json({ success: true, data: contract })
    },

    // ============================================
    // CONTRACTS — UPDATE (with history)
    // ============================================
    'PUT /contracts/:id': async (req, ctx) => {
      const contract = await ctx.db.queryOne<Record<string, any>>('SELECT * FROM mobile_contracts WHERE id = ?', [ctx.params.id])
      if (!contract) return NextResponse.json({ success: false, error: 'Vertrag nicht gefunden' }, { status: 404 })

      const body = await req.json()

      const trackFields = ['active_user', 'cost_center_1', 'cost_center_2', 'status', 'device_id', 'second_user', 'comment']
      const allFields = ['phone_number', 'base_price', 'connection_costs', 'discount', 'total_net', 'total_gross',
        'cost_center_1', 'cost_center_2', 'active_user', 'device_id', 'intune_registered',
        'pin', 'puk', 'pin2', 'puk2', 'second_user', 'second_device_id', 'comment', 'status']

      // Track history for important fields
      for (const field of trackFields) {
        if (body[field] !== undefined && String(body[field] ?? '') !== String(contract[field] ?? '')) {
          await ctx.db.insert(
            'INSERT INTO mobile_contract_history (contract_id, field_name, old_value, new_value, changed_by) VALUES (?,?,?,?,?)',
            [contract.id, field, contract[field] ?? '', body[field] ?? '', ctx.session.userId]
          )
        }
      }

      // Build update
      const sets: string[] = []
      const params: any[] = []
      for (const field of allFields) {
        if (body[field] !== undefined) {
          sets.push(`${field} = ?`)
          params.push(body[field])
        }
      }

      if (sets.length > 0) {
        params.push(ctx.params.id)
        await ctx.db.query(`UPDATE mobile_contracts SET ${sets.join(', ')} WHERE id = ?`, params)
      }

      const updated = await ctx.db.queryOne('SELECT * FROM mobile_contracts WHERE id = ?', [ctx.params.id])
      return NextResponse.json({ success: true, data: updated })
    },

    // ============================================
    // CONTRACTS — DELETE
    // ============================================
    'DELETE /contracts/:id': async (_req, ctx) => {
      await ctx.db.query('DELETE FROM mobile_contract_history WHERE contract_id = ?', [ctx.params.id])
      await ctx.db.query('DELETE FROM mobile_contracts WHERE id = ?', [ctx.params.id])
      return NextResponse.json({ success: true })
    },

    // ============================================
    // HISTORY — per contract
    // ============================================
    'GET /contracts/:id/history': async (_req, ctx) => {
      const history = await ctx.db.query(
        `SELECT h.*, u.name as changed_by_name
         FROM mobile_contract_history h
         LEFT JOIN users u ON h.changed_by = u.id
         WHERE h.contract_id = ?
         ORDER BY h.changed_at DESC`,
        [ctx.params.id]
      )
      return NextResponse.json({ success: true, data: history })
    },

    // ============================================
    // EXCEL IMPORT
    // ============================================
    'POST /import/excel': async (req, ctx) => {
      let formData: FormData
      try {
        formData = await req.formData()
      } catch {
        return NextResponse.json({ success: false, error: 'Keine Datei hochgeladen' }, { status: 400 })
      }

      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ success: false, error: 'Keine Datei hochgeladen' }, { status: 400 })

      const sheet = (formData.get('sheet') as string | null) ?? undefined

      try {
        const XLSX = await import('xlsx')
        const buffer = Buffer.from(await file.arrayBuffer())
        const wb = XLSX.read(buffer, { type: 'buffer' })
        const sheetName = sheet || wb.SheetNames[0]
        const ws = wb.Sheets[sheetName]
        if (!ws) {
          return NextResponse.json(
            { success: false, error: `Sheet "${sheetName}" nicht gefunden. Verfügbar: ${wb.SheetNames.join(', ')}` },
            { status: 400 }
          )
        }

        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
        if (data.length < 2) return NextResponse.json({ success: false, error: 'Datei enthält keine Daten' }, { status: 400 })

        const header = data[0].map((h: any) => String(h ?? '').trim())
        const colMap: Record<string, number> = {
          phone_number: header.findIndex((h: string) => /rufnummer/i.test(h)),
          base_price: header.findIndex((h: string) => /basispreis/i.test(h)),
          connection_costs: header.findIndex((h: string) => /verbindungskosten/i.test(h)),
          discount: header.findIndex((h: string) => /rabatt/i.test(h)),
          total_net: header.findIndex((h: string) => /gesamtbetrag\s*netto/i.test(h)),
          total_gross: header.findIndex((h: string) => /gesamtbetrag\s*brutto/i.test(h)),
          cost_center_1: header.findIndex((h: string) => /kst.*1/i.test(h)),
          cost_center_2: header.findIndex((h: string) => /kst.*2/i.test(h)),
          active_user: header.findIndex((h: string) => /aktiver\s*nutzer/i.test(h)),
          device_id: header.findIndex((h: string) => /geräte.?id/i.test(h)),
          intune_registered: header.findIndex((h: string) => /intune/i.test(h)),
          pin: header.findIndex((h: string) => /^pin$/i.test(h)),
          puk: header.findIndex((h: string) => /^puk$/i.test(h)),
          pin2: header.findIndex((h: string) => /pin\s*2/i.test(h)),
          puk2: header.findIndex((h: string) => /puk\s*2/i.test(h)),
          second_user: header.findIndex((h: string) => /2\.\s*nutzer/i.test(h)),
          second_device_id: -1,
          comment: header.findIndex((h: string) => /kommentar/i.test(h)),
          status: header.findIndex((h: string) => /^status$/i.test(h)),
        }

        // second_device_id is the column right after second_user
        if (colMap.second_user >= 0) {
          colMap.second_device_id = colMap.second_user + 1
        }

        let imported = 0, updated = 0, skipped = 0

        for (let i = 1; i < data.length; i++) {
          const row = data[i]
          if (!row || !row[colMap.phone_number]) { skipped++; continue }

          const phone = String(row[colMap.phone_number]).trim()
          if (!phone) { skipped++; continue }

          const getValue = (col: number) => col >= 0 && row[col] !== undefined && row[col] !== null ? row[col] : null
          const getNum = (col: number) => {
            const v = getValue(col)
            if (v === null || v === '') return 0
            return parseFloat(v) || 0
          }
          const getStr = (col: number) => {
            const v = getValue(col)
            return v !== null ? String(v).trim() : null
          }

          const record: Record<string, any> = {
            phone_number: phone,
            base_price: getNum(colMap.base_price),
            connection_costs: getNum(colMap.connection_costs),
            discount: getNum(colMap.discount),
            total_net: getNum(colMap.total_net),
            total_gross: getNum(colMap.total_gross),
            cost_center_1: getStr(colMap.cost_center_1),
            cost_center_2: getStr(colMap.cost_center_2),
            active_user: getStr(colMap.active_user),
            device_id: getStr(colMap.device_id),
            intune_registered: getStr(colMap.intune_registered),
            pin: getStr(colMap.pin),
            puk: getStr(colMap.puk),
            pin2: getStr(colMap.pin2),
            puk2: getStr(colMap.puk2),
            second_user: getStr(colMap.second_user),
            second_device_id: getStr(colMap.second_device_id),
            comment: getStr(colMap.comment),
            status: getStr(colMap.status) || 'Aktiv',
          }

          const existing = await ctx.db.queryOne<{ id: number }>('SELECT id FROM mobile_contracts WHERE phone_number = ?', [phone])

          if (existing) {
            const current = await ctx.db.queryOne<Record<string, any>>('SELECT * FROM mobile_contracts WHERE id = ?', [existing.id])
            const trackFieldsImport = ['active_user', 'cost_center_1', 'cost_center_2', 'status']
            for (const field of trackFieldsImport) {
              if (record[field] !== null && String(record[field]) !== String(current?.[field] ?? '')) {
                await ctx.db.insert(
                  'INSERT INTO mobile_contract_history (contract_id, field_name, old_value, new_value, changed_by) VALUES (?,?,?,?,?)',
                  [existing.id, field, current?.[field] ?? '', record[field] ?? '', ctx.session.userId]
                )
              }
            }

            const sets = Object.keys(record).filter(k => k !== 'phone_number').map(k => `${k} = ?`)
            const vals = Object.keys(record).filter(k => k !== 'phone_number').map(k => record[k])
            vals.push(existing.id)
            await ctx.db.query(`UPDATE mobile_contracts SET ${sets.join(', ')} WHERE id = ?`, vals)
            updated++
          } else {
            const fields = Object.keys(record)
            const vals = fields.map(f => record[f])
            await ctx.db.insert(
              `INSERT INTO mobile_contracts (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
              vals
            )
            imported++
          }
        }

        return NextResponse.json({
          success: true,
          data: { imported, updated, skipped, total: data.length - 1 },
          sheets: wb.SheetNames,
        })
      } catch (err: any) {
        console.error('[MOBILE] Excel import error:', err)
        return NextResponse.json({ success: false, error: 'Import-Fehler: ' + err.message }, { status: 500 })
      }
    },

    // ============================================
    // EXCEL — get available sheets
    // ============================================
    'POST /import/excel/sheets': async (req, _ctx) => {
      let formData: FormData
      try {
        formData = await req.formData()
      } catch {
        return NextResponse.json({ success: false, error: 'Keine Datei' }, { status: 400 })
      }
      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ success: false, error: 'Keine Datei' }, { status: 400 })
      try {
        const XLSX = await import('xlsx')
        const buffer = Buffer.from(await file.arrayBuffer())
        const wb = XLSX.read(buffer, { type: 'buffer' })
        return NextResponse.json({ success: true, sheets: wb.SheetNames })
      } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
      }
    },

    // ============================================
    // PDF INVOICE IMPORT
    // ============================================
    'POST /import/invoice': async (req, ctx) => {
      let formData: FormData
      try {
        formData = await req.formData()
      } catch {
        return NextResponse.json({ success: false, error: 'Keine Datei hochgeladen' }, { status: 400 })
      }

      const file = formData.get('file') as File | null
      if (!file) return NextResponse.json({ success: false, error: 'Keine Datei hochgeladen' }, { status: 400 })

      const invoiceMonth = formData.get('month') ? parseInt(formData.get('month') as string) : null
      const invoiceYear = formData.get('year') ? parseInt(formData.get('year') as string) : null

      try {
        const pdfParse = (await import('pdf-parse')).default
        const pdfBuffer = Buffer.from(await file.arrayBuffer())
        const pdfData = await pdfParse(pdfBuffer)
        const text = pdfData.text

        // Extract invoice date
        const dateMatch = text.match(/Rechnungsdatum[:\s]+(\d{2}\.\d{2}\.\d{4})/i)
        const invoiceDate = dateMatch ? dateMatch[1] : null

        // Parse phone number lines from Vodafone invoice format
        const lines = text.split('\n')
        const invoiceLines: any[] = []

        const phoneRegex = /^(01[5-7][0-9][\s/]?\d{3,4}[\s]?\d{3,4})/
        const amountRegex = /(-?\d+[.,]\d{2})/g

        let i = 0
        while (i < lines.length) {
          const line = lines[i].trim()
          const phoneMatch = line.match(phoneRegex)

          if (phoneMatch) {
            let phoneNum = phoneMatch[1].replace(/\s+/g, '')
            if (!phoneNum.includes('/')) {
              const prefixLen = phoneNum.startsWith('015') ? 5 : 4
              phoneNum = phoneNum.substring(0, prefixLen) + '/' + phoneNum.substring(prefixLen)
            }

            const tariff = line.substring(phoneMatch[0].length).trim()

            let amounts: number[] = []
            for (let j = i; j < Math.min(i + 3, lines.length); j++) {
              const lineAmounts = lines[j].match(amountRegex)
              if (lineAmounts) {
                amounts = amounts.concat(lineAmounts.map((a: string) => parseFloat(a.replace(',', '.'))))
              }
            }

            invoiceLines.push({
              phone_number: phoneNum,
              tariff: tariff || null,
              base_price: amounts[0] || 0,
              discount: amounts.length > 2 ? amounts[1] || 0 : 0,
              surcharges: amounts.length > 3 ? amounts[2] || 0 : 0,
              total_net: amounts[amounts.length - 1] || 0,
            })
          }
          i++
        }

        const parsedDate = invoiceDate ? (() => {
          const [d, m, y] = invoiceDate.split('.')
          return `${y}-${m}-${d}`
        })() : null

        const totalNet = invoiceLines.reduce((s, l) => s + l.total_net, 0)
        const totalGross = totalNet * 1.19

        const invoiceId = await ctx.db.insert(
          'INSERT INTO mobile_invoices (filename, invoice_month, invoice_year, invoice_date, total_net, total_gross, line_count, imported_by) VALUES (?,?,?,?,?,?,?,?)',
          [file.name, invoiceMonth, invoiceYear, parsedDate, totalNet, totalGross, invoiceLines.length, ctx.session.userId]
        )

        let matched = 0, unmatched = 0
        const discrepancies: any[] = []

        for (const line of invoiceLines) {
          const contract = await ctx.db.queryOne<{ id: number; phone_number: string; total_net: string; active_user: string }>(
            'SELECT id, phone_number, total_net, active_user FROM mobile_contracts WHERE phone_number = ? OR REPLACE(phone_number, "/", "") = REPLACE(?, "/", "")',
            [line.phone_number, line.phone_number]
          )

          let contractId: number | null = null
          let lineStatus = 'unmatched'

          if (contract) {
            contractId = contract.id
            matched++

            const diff = Math.abs(line.total_net - parseFloat(contract.total_net ?? '0'))
            if (diff > 0.50) {
              lineStatus = 'discrepancy'
              discrepancies.push({
                phone_number: line.phone_number,
                contract_id: contract.id,
                active_user: contract.active_user,
                contract_net: parseFloat(contract.total_net ?? '0'),
                invoice_net: line.total_net,
                difference: line.total_net - parseFloat(contract.total_net ?? '0'),
              })
            } else {
              lineStatus = 'matched'
            }
          } else {
            unmatched++
            lineStatus = 'new'
            discrepancies.push({
              phone_number: line.phone_number,
              contract_id: null,
              active_user: null,
              contract_net: 0,
              invoice_net: line.total_net,
              difference: line.total_net,
              is_new: true,
            })
          }

          await ctx.db.insert(
            'INSERT INTO mobile_invoice_lines (invoice_id, phone_number, tariff, base_price, discount, surcharges, total_net, contract_id, status) VALUES (?,?,?,?,?,?,?,?,?)',
            [invoiceId, line.phone_number, line.tariff, line.base_price, line.discount, line.surcharges, line.total_net, contractId, lineStatus]
          )
        }

        return NextResponse.json({
          success: true,
          data: {
            invoice_id: invoiceId,
            filename: file.name,
            invoice_month: invoiceMonth,
            invoice_year: invoiceYear,
            invoice_date: invoiceDate,
            total_lines: invoiceLines.length,
            matched,
            unmatched,
            discrepancies,
            total_net: totalNet,
            total_gross: totalGross,
          },
        })
      } catch (err: any) {
        console.error('[MOBILE] PDF import error:', err)
        return NextResponse.json({ success: false, error: 'PDF-Import-Fehler: ' + err.message }, { status: 500 })
      }
    },

    // ============================================
    // INVOICES — LIST
    // ============================================
    'GET /invoices': async (_req, ctx) => {
      const invoices = await ctx.db.query(
        `SELECT i.*, u.name as imported_by_name
         FROM mobile_invoices i
         LEFT JOIN users u ON i.imported_by = u.id
         ORDER BY i.imported_at DESC`
      )
      return NextResponse.json({ success: true, data: invoices })
    },

    // ============================================
    // INVOICES — DETAIL (lines)
    // ============================================
    'GET /invoices/:id': async (_req, ctx) => {
      const invoice = await ctx.db.queryOne('SELECT * FROM mobile_invoices WHERE id = ?', [ctx.params.id])
      if (!invoice) return NextResponse.json({ success: false, error: 'Rechnung nicht gefunden' }, { status: 404 })

      const lines = await ctx.db.query(
        `SELECT l.*, c.active_user, c.cost_center_1
         FROM mobile_invoice_lines l
         LEFT JOIN mobile_contracts c ON l.contract_id = c.id
         WHERE l.invoice_id = ?
         ORDER BY l.phone_number`,
        [ctx.params.id]
      )

      return NextResponse.json({ success: true, data: { ...(invoice as object), lines } })
    },

    // ============================================
    // INVOICES — DELETE
    // ============================================
    'DELETE /invoices/:id': async (_req, ctx) => {
      await ctx.db.query('DELETE FROM mobile_invoice_lines WHERE invoice_id = ?', [ctx.params.id])
      await ctx.db.query('DELETE FROM mobile_invoices WHERE id = ?', [ctx.params.id])
      return NextResponse.json({ success: true })
    },

    // ============================================
    // COST CENTER REPORT
    // ============================================
    'GET /reports/cost-centers': async (_req, ctx) => {
      const invoice_id = ctx.searchParams.get('invoice_id')

      const contractCosts = await ctx.db.query(
        `SELECT
          COALESCE(cost_center_1, 'Ohne Kostenstelle') as cost_center,
          COUNT(*) as contract_count,
          SUM(total_gross) as total_gross
         FROM mobile_contracts
         WHERE status != 'Gekündigt'
         GROUP BY cost_center_1
         ORDER BY total_gross DESC`
      )

      let invoiceCosts = null
      if (invoice_id) {
        invoiceCosts = await ctx.db.query(
          `SELECT
            COALESCE(c.cost_center_1, 'Ohne Kostenstelle') as cost_center,
            COUNT(*) as line_count,
            SUM(l.total_net) as invoice_net
           FROM mobile_invoice_lines l
           LEFT JOIN mobile_contracts c ON l.contract_id = c.id
           WHERE l.invoice_id = ?
           GROUP BY c.cost_center_1
           ORDER BY invoice_net DESC`,
          [invoice_id]
        )
      }

      return NextResponse.json({ success: true, data: { contract_costs: contractCosts, invoice_costs: invoiceCosts } })
    },

    // ============================================
    // RECONCILE — update contract from invoice
    // ============================================
    'POST /reconcile': async (req, ctx) => {
      const body = await req.json()
      const { actions } = body

      if (!Array.isArray(actions)) {
        return NextResponse.json({ success: false, error: 'Aktionen erforderlich' }, { status: 400 })
      }

      let updated = 0, created = 0, ignored = 0

      for (const act of actions) {
        if (act.action === 'update_price') {
          const contract = await ctx.db.queryOne<Record<string, any>>(
            'SELECT * FROM mobile_contracts WHERE phone_number = ? OR REPLACE(phone_number, "/", "") = REPLACE(?, "/", "")',
            [act.phone_number, act.phone_number]
          )
          if (contract) {
            await ctx.db.insert(
              'INSERT INTO mobile_contract_history (contract_id, field_name, old_value, new_value, changed_by) VALUES (?,?,?,?,?)',
              [contract.id, 'total_net', contract.total_net, act.new_total_net, ctx.session.userId]
            )
            await ctx.db.query(
              'UPDATE mobile_contracts SET total_net = ?, total_gross = ? WHERE id = ?',
              [act.new_total_net, act.new_total_net * 1.19, contract.id]
            )
            updated++
          }
        } else if (act.action === 'create') {
          const existing = await ctx.db.queryOne('SELECT id FROM mobile_contracts WHERE phone_number = ?', [act.phone_number])
          if (!existing) {
            await ctx.db.insert(
              'INSERT INTO mobile_contracts (phone_number, total_net, total_gross, status) VALUES (?,?,?,?)',
              [act.phone_number, act.new_total_net || 0, (act.new_total_net || 0) * 1.19, 'Aktiv']
            )
            created++
          }
        } else {
          ignored++
        }

        if (act.invoice_line_id) {
          await ctx.db.query(
            'UPDATE mobile_invoice_lines SET status = ? WHERE id = ?',
            [act.action === 'ignore' ? 'ignored' : 'resolved', act.invoice_line_id]
          )
        }
      }

      return NextResponse.json({ success: true, data: { updated, created, ignored } })
    },

    // ============================================
    // COST TREND — monthly/yearly from invoices
    // ============================================
    'GET /reports/cost-trend': async (_req, ctx) => {
      const trend = await ctx.db.query(
        `SELECT invoice_year as year, invoice_month as month, SUM(total_gross) as total_gross, SUM(total_net) as total_net, SUM(line_count) as line_count
         FROM mobile_invoices
         WHERE invoice_year IS NOT NULL AND invoice_month IS NOT NULL
         GROUP BY invoice_year, invoice_month
         ORDER BY invoice_year ASC, invoice_month ASC`
      )
      return NextResponse.json({ success: true, data: trend })
    },

    // ============================================
    // EXPORT CSV
    // ============================================
    'GET /contracts/export/csv': async (_req, ctx) => {
      const contracts = await ctx.db.query<Record<string, any>>('SELECT * FROM mobile_contracts ORDER BY phone_number')
      const header = 'Rufnummer;Basispreis;Verbindungskosten;Rabattierung;Gesamt netto;Gesamt brutto;KST 1;KST 2;Aktiver Nutzer;Geräte-ID;Intune;Status'
      const rows = contracts.map(c =>
        [c.phone_number, c.base_price, c.connection_costs, c.discount, c.total_net, c.total_gross,
          c.cost_center_1, c.cost_center_2, c.active_user, c.device_id, c.intune_registered, c.status]
          .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(';')
      )
      const csv = '\uFEFF' + [header, ...rows].join('\n')
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename=mobilfunkvertraege.csv',
        },
      }) as any
    },
  },

  Component: MobileContractsPage,
}

export default plugin
