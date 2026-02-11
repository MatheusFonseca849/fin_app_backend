const FormData = require('form-data');
const Mailgun = require('mailgun.js');

class EmailService {
  constructor() {
    const mailgun = new Mailgun(FormData);
    this.mg = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY
    });
    this.domain = process.env.MAILGUN_DOMAIN;
    this.from = process.env.MAILGUN_FROM || `Fin App <postmaster@${this.domain}>`;
  }

  async sendVerificationEmail(to, token) {
    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${token}&email=${encodeURIComponent(to)}`;

    const data = await this.mg.messages.create(this.domain, {
      from: this.from,
      to: [to],
      subject: 'Verifique seu email - Fin App',
      text: `Olá! Clique no link abaixo para verificar seu email:\n\n${verificationUrl}\n\nEste link expira em 24 horas.\n\nSe você não criou uma conta, ignore este email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Verificação de Email</h2>
          <p>Olá! Obrigado por se cadastrar no Fin App.</p>
          <p>Clique no botão abaixo para verificar seu email:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #4ECDC4; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-size: 16px;">
              Verificar Email
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Este link expira em 24 horas.</p>
          <p style="color: #666; font-size: 14px;">Se você não criou uma conta, ignore este email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Fin App - Gerenciamento Financeiro</p>
        </div>
      `
    });

    return data;
  }
}

module.exports = new EmailService();
