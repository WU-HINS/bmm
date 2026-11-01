/**
 * 压测数据播种
 *
 *   DB_CONNECTION_URL=file:./perf.db node bench/seed.mjs
 *
 * 结构：60 个公共标签 + 5000 条公共书签（每条 3 个标签）+ 1 个用户（300 条用户书签）
 * ! 会先清空同名数据库中的业务数据，只用于本地压测
 */
import { createClient } from '@libsql/client'
import crypto from 'node:crypto'

const url = process.env.DB_CONNECTION_URL || 'file:./perf.db'
const db = createClient({ url })

const TAG_COUNT = 60
const BOOKMARK_COUNT = 5000
const USER_BOOKMARK_COUNT = 300
const TAGS_PER_BOOKMARK = 3
const BATCH = 500

const now = Date.now()

async function reset() {
  const tables = [
    'publicBookmarkToTag',
    'publicTagToTag',
    'publicTags',
    'publicBookmarks',
    'userBookmarkToTag',
    'userTagToTag',
    'userTags',
    'userBookmarks',
    'bookmarkHostChecks',
    'userConfigs',
    'siteConfigs',
    'credential',
    'account',
    'session',
    'user',
  ]
  for (const t of tables) {
    await db.execute(`DELETE FROM "${t}"`).catch(() => {})
  }
}

async function seedTags() {
  const stmts = []
  for (let i = 1; i <= TAG_COUNT; i++) {
    const name = '标签' + String(i).padStart(2, '0')
    stmts.push({
      sql: 'INSERT INTO publicTags (name, icon, color, pinyin, isMain, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [name, 'tabler:tag', '#3b82f6', 'biaoqian' + i, i <= 6 ? 1 : 0, i, now, now],
    })
  }
  for (let i = 0; i < stmts.length; i += BATCH) await db.batch(stmts.slice(i, i + BATCH))
}

async function seedBookmarks() {
  const tagRows = await db.execute('SELECT id FROM publicTags ORDER BY id')
  const tagIds = tagRows.rows.map((r) => Number(r.id))
  const hosts = ['github.com', 'developer.mozilla.org', 'stackoverflow.com', 'nextjs.org', 'react.dev', 'nodejs.org']

  for (let start = 0; start < BOOKMARK_COUNT; start += BATCH) {
    const stmts = []
    for (let i = start; i < Math.min(start + BATCH, BOOKMARK_COUNT); i++) {
      const host = hosts[i % hosts.length]
      stmts.push({
        sql: 'INSERT INTO publicBookmarks (name, url, hostKey, icon, pinyin, description, isPinned, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [
          '压测站点 ' + String(i).padStart(4, '0'),
          `https://${host}/docs/${i}`,
          host,
          'https://github.com/favicon.ico',
          'yaceshizhandian' + i,
          '这是第 ' + i + ' 条用于压测的站点描述，包含一些中文与 English 关键词 nextjs react sqlite。',
          i % 50 === 0 ? 1 : 0,
          now - i * 1000,
          now - i * 1000,
        ],
      })
    }
    await db.batch(stmts)
  }

  // 书签与标签的关系（自增 id 不保证从 1 开始，需回查真实 id）
  const bookmarkRows = await db.execute('SELECT id FROM publicBookmarks ORDER BY id')
  const bookmarkIds = bookmarkRows.rows.map((r) => Number(r.id))
  for (let start = 0; start < bookmarkIds.length; start += BATCH) {
    const stmts = []
    for (let i = start; i < Math.min(start + BATCH, bookmarkIds.length); i++) {
      for (let k = 0; k < TAGS_PER_BOOKMARK; k++) {
        const tId = tagIds[(i * TAGS_PER_BOOKMARK + k) % tagIds.length]
        stmts.push({
          sql: 'INSERT OR IGNORE INTO publicBookmarkToTag (bId, tId) VALUES (?, ?)',
          args: [bookmarkIds[i], tId],
        })
      }
    }
    await db.batch(stmts)
  }

  // 标签之间的关系
  const tagStmts = []
  for (let i = 0; i < tagIds.length; i++) {
    tagStmts.push({
      sql: 'INSERT OR IGNORE INTO publicTagToTag (a, b) VALUES (?, ?)',
      args: [tagIds[i], tagIds[(i + 1) % tagIds.length]],
    })
  }
  await db.batch(tagStmts)
}

async function seedUser() {
  const userId = 'perf-user-0001'
  const salt = crypto.randomBytes(16).toString('hex')
  const password = 'abcd1234'
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 32, 'sha256').toString('hex')

  await db.execute({
    sql: 'INSERT INTO user (id, name, email, image, role, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    args: [userId, '压测用户', 'perf@example.com', null, 'admin', now],
  })
  await db.execute({
    sql: 'INSERT INTO credential (userId, password, salt) VALUES (?, ?, ?)',
    args: [userId, hash, salt],
  })
  await db.execute({
    sql: 'INSERT INTO account (userId, type, provider, providerAccountId) VALUES (?, ?, ?, ?)',
    args: [userId, 'email', 'credentials', 'perf@example.com'],
  })

  for (let start = 0; start < USER_BOOKMARK_COUNT; start += BATCH) {
    const stmts = []
    for (let i = start; i < Math.min(start + BATCH, USER_BOOKMARK_COUNT); i++) {
      stmts.push({
        sql: 'INSERT INTO userBookmarks (name, url, hostKey, icon, pinyin, description, isPinned, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [
          '我的站点 ' + String(i).padStart(4, '0'),
          `https://user-site${i}.example.com/p/${i}`,
          `user-site${i}.example.com`,
          null,
          'wodezhandian' + i,
          '用户空间压测数据 ' + i,
          0,
          userId,
          now - i * 1000,
          now - i * 1000,
        ],
      })
    }
    await db.batch(stmts)
  }
}

await reset()
await seedTags()
await seedBookmarks()
await seedUser()

const counts = {}
for (const t of ['publicTags', 'publicBookmarks', 'publicBookmarkToTag', 'userBookmarks', 'user']) {
  const r = await db.execute(`SELECT COUNT(*) AS c FROM "${t}"`)
  counts[t] = Number(r.rows[0].c)
}
console.log('seed done:', JSON.stringify(counts))
process.exit(0)