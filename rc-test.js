const RC_SERVER = process.env.RC_SERVER_URL || 'https://platform.ringcentral.com';
const RC_CLIENT_ID = process.env.RC_CLIENT_ID;
const RC_CLIENT_SECRET = process.env.RC_CLIENT_SECRET;
const RC_JWT = process.env.RC_JWT;

async function getAccessToken() {
  const basic = Buffer.from(`${RC_CLIENT_ID}:${RC_CLIENT_SECRET}`).toString('base64');

  const body = new URLSearchParams();
  body.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  body.set('assertion', RC_JWT);

  const res = await fetch(`${RC_SERVER}/restapi/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(text);
    throw new Error('OAuth falló');
  }

  return JSON.parse(text);
}

async function createSubscription(accessToken) {
  const payload = {
    eventFilters: [
      '/restapi/v1.0/account/~/telephony/sessions'
    ],
    deliveryMode: {
      transportType: 'WebHook',
      address: 'https://gamipress-backend.onrender.com/webhook'
    },
    expiresIn: 3600
  };

  const res = await fetch(`${RC_SERVER}/restapi/v1.0/subscription`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  if (!res.ok) {
    console.error('ERROR SUBSCRIPTION:');
    console.error(text);
    throw new Error('Falló subscription');
  }

  return JSON.parse(text);
}

(async () => {
  try {
    console.log('1) Login...');
    const token = await getAccessToken();
    console.log('OK login');

    console.log('2) Creando subscription...');
    const sub = await createSubscription(token.access_token);

    console.log('🔥 SUBSCRIPTION OK:');
    console.log(JSON.stringify(sub, null, 2));

  } catch (e) {
    console.error('ERROR FINAL:', e.message);
  }
})();