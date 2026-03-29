export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { request_type, guest_name, house, details } = req.body;
  const msg = `New ${request_type || 'Request'} from ${guest_name || 'Guest'}${house ? ' (' + house + ')' : ''}${details ? ': ' + details : ''}`;

  // Get notification targets from Supabase config
  let notifyPhone = '';
  let notifyEmail = '';
  
  try {
    const configRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/concierge_configs?project_name=eq.guess-coachella-2026&select=config`,
      {
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );
    const configData = await configRes.json();
    if (configData && configData[0] && configData[0].config) {
      notifyPhone = configData[0].config.notifyPhone || '';
      notifyEmail = configData[0].config.notifyEmail || '';
    }
  } catch (e) {
    console.log('Config fetch failed:', e);
  }

  const results = { sms: null, email: null };

  // Send SMS via Twilio
  if (notifyPhone) {
    try {
      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_SID}:${process.env.TWILIO_AUTH}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            To: notifyPhone,
            From: process.env.TWILIO_FROM,
            Body: msg
          }).toString()
        }
      );
      results.sms = twilioRes.ok ? 'sent' : 'failed';
    } catch (e) {
      results.sms = 'error';
      console.log('Twilio error:', e);
    }
  }

  // Send Email via Resend
  if (notifyEmail) {
    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: process.env.NOTIFICATION_FROM_EMAIL,
          to: notifyEmail,
          subject: `Concierge Request: ${request_type || 'New'}`,
          text: msg
        })
      });
      results.email = emailRes.ok ? 'sent' : 'failed';
    } catch (e) {
      results.email = 'error';
      console.log('Resend error:', e);
    }
  }

  return res.status(200).json(results);
}
