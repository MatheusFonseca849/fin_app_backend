require('dotenv').config();
const FormData = require('form-data');
const Mailgun = require('mailgun.js');

async function sendTestEmail() {
  const mailgun = new Mailgun(FormData);
  const mg = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY
  });

  try {
    console.log('📧 Sending test email...');
    console.log('   Domain:', process.env.MAILGUN_DOMAIN);
    console.log('   From:', process.env.MAILGUN_FROM);
    console.log('   To: matheusfonseca849@gmail.com\n');

    const data = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: process.env.MAILGUN_FROM,
      to: ['matheusfonseca849@gmail.com'],
      subject: 'Fin App - Teste de Email',
      text: 'Se você recebeu este email, a integração com Mailgun está funcionando corretamente!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Teste de Email - Fin App</h2>
          <p>Se você recebeu este email, a integração com <strong>Mailgun</strong> está funcionando corretamente!</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="background-color: #4ECDC4; color: white; padding: 12px 30px; border-radius: 5px; font-size: 16px;">
              ✅ Mailgun Configurado
            </span>
          </div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Fin App - Gerenciamento Financeiro</p>
        </div>
      `
    });

    console.log('✅ Email sent successfully!');
    console.log('   Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Failed to send email:');
    console.error('   Status:', error.status);
    console.error('   Message:', error.message);
    if (error.details) console.error('   Details:', error.details);
  }
}

sendTestEmail();
