import { sendEmail } from '../../../lib/mailer';

export async function GET() {
  try {
    await sendEmail({
      to: 'payements@centresportifhp.com',
      subject: 'Test SMTP CSHP ✅',
      html: '<p>Le système de courriel fonctionne correctement.</p>',
    });
    return Response.json({ success: true, message: 'Courriel envoyé ✅' });
  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
