import { Resend } from 'resend'

// Resend's constructor throws synchronously if the key is missing — falls
// back to a placeholder so a dev environment without RESEND_API_KEY still
// boots; sends then fail (and get caught) at request time instead.
const resend = new Resend(process.env.RESEND_API_KEY || 're_dev_unset')
const FROM = process.env.EMAIL_FROM ?? 'JSS Dashjs <onboarding@resend.dev>'

// User-controlled strings (profile name, tenant/alert/dataset/report name...)
// are interpolated into these templates — escape before building any HTML
// (spec-security.md Vuln 3).
function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendInviteEmail(to: string, tenantName: string, inviterName: string, link: string) {
  const name = escapeHtml(inviterName)
  const tenant = escapeHtml(tenantName)
  await resend.emails.send({
    from: FROM, to,
    subject: `${inviterName} convidou você para o time "${tenantName}" no JSS Dashjs`,
    html: `<p>${name} convidou você para colaborar no tenant <b>${tenant}</b>.</p><p><a href="${link}">Aceitar convite</a></p>`,
  })
}

export async function sendPasswordResetEmail(to: string, link: string) {
  await resend.emails.send({
    from: FROM, to,
    subject: 'Redefinir senha — JSS Dashjs',
    html: `<p>Clique para redefinir sua senha (expira em 1 hora):</p><p><a href="${link}">Redefinir senha</a></p>`,
  })
}

export async function sendReportEmail(
  to: string[], reportName: string, dashboardName: string, dashboardLink: string,
  metrics: { label: string; value: number }[],
) {
  const rows = metrics.map((m) => `<tr><td>${escapeHtml(m.label)}</td><td><b>${escapeHtml(m.value)}</b></td></tr>`).join('')
  await resend.emails.send({
    from: FROM, to,
    subject: `Relatório "${reportName}" — ${dashboardName}`,
    html: `<p>Resumo agendado do dashboard <b>${escapeHtml(dashboardName)}</b>:</p>
           <table>${rows}</table>
           <p><a href="${dashboardLink}">Abrir dashboard</a></p>`,
  })
}

export async function sendAlertEmail(
  to: string[], alertName: string, datasetName: string,
  value: number, operator: string, threshold: number,
) {
  await resend.emails.send({
    from: FROM, to,
    subject: `Alerta "${alertName}" disparado — ${datasetName}`,
    html: `<p>O alerta <b>${escapeHtml(alertName)}</b> no dataset <b>${escapeHtml(datasetName)}</b> foi disparado.</p>
           <p>Valor atual: <b>${escapeHtml(value)}</b> (limite: ${escapeHtml(operator)} ${escapeHtml(threshold)})</p>`,
  })
}
