import express from 'express'
import cors from 'cors'
import datasetsRouter from './routes/datasets.js'
import dashboardsRouter from './routes/dashboards.js'
import connectionsRouter from './routes/connections.js'
import publicRouter from './routes/public.js'
import authRouter from './routes/auth.js'
import membersRouter from './routes/members.js'
import { pool } from './db.js'
import { sessionMiddleware } from './auth.js'
import { startRefreshScheduler } from './refreshScheduler.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '450mb' }))
app.use(sessionMiddleware)

app.use('/api/auth', authRouter)
app.use('/api/members', membersRouter)
app.use('/api/datasets', datasetsRouter)
app.use('/api/dashboards', dashboardsRouter)
app.use('/api/connections', connectionsRouter)
app.use('/api/public', publicRouter)
app.get('/api/health', (_req, res) => res.json({ ok: true }))

startRefreshScheduler(pool)

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`API running on port ${port}`)
})
