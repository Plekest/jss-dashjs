import { CronExpressionParser } from 'cron-parser'

export function nextRunFromCron(cronExpr: string, from = new Date()): Date {
  return CronExpressionParser.parse(cronExpr, { currentDate: from }).next().toDate()
}
