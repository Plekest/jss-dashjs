import { Resend } from 'resend'

// Resend's constructor throws synchronously if the key is missing — falls
// back to a placeholder so a dev environment without RESEND_API_KEY still
// boots; sends then fail (and get caught) at request time instead.
const resend = new Resend(process.env.RESEND_API_KEY || 're_dev_unset')
const FROM = process.env.EMAIL_FROM ?? 'JSS Dashjs <onboarding@resend.dev>'

export async function sendInviteEmail(to: string, tenantName: string, inviterName: string, link: string) {
  await resend.emails.send({
    from: FROM, to,
    subject: `${inviterName} convidou você para o time "${tenantName}" no JSS Dashjs`,
    html: `<p>${inviterName} convidou você para colaborar no tenant <b>${tenantName}</b>.</p><p><a href="${link}">Aceitar convite</a></p>`,
  })
}

export async function sendPasswordResetEmail(to: string, link: string) {
  await resend.emails.send({
    from: FROM, to,
    subject: 'Redefinir senha — JSS Dashjs',
    html: `<p>Clique para redefinir sua senha (expira em 1 hora):</p><p><a href="${link}">Redefinir senha</a></p>`,
  })
}
