import { createClient } from '@libsql/client'
const db = createClient({ url: 'file:./perf.db' })
await db.execute('CREATE INDEX IF NOT EXISTS publicBookmarks_updatedAt_idx ON publicBookmarks(updatedAt)')
await db.execute('CREATE INDEX IF NOT EXISTS userBookmarks_updatedAt_idx ON userBookmarks(updatedAt)')
const rows = await db.execute("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%updatedAt_idx'")
console.log('indexes:', rows.rows.map((r) => r.name).join(', '))
process.exit(0)
