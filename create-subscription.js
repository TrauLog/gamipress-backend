const { SDK } = require('@ringcentral/sdk');

const rcsdk = new SDK({
  server: process.env.RC_SERVER_URL || 'https://platform.ringcentral.com',
  clientId: process.env.RC_CLIENT_ID,
  clientSecret: process.env.RC_CLIENT_SECRET
});

const platform = rcsdk.platform();

async function main() {
  try {
    console.log('Iniciando login con JWT...');

    await platform.login({
      jwt: process.env.RC_JWT
    });

    console.log('Login exitoso. Creando suscripción...');

    const response = await platform.post('/restapi/v1.0/subscription', {
      eventFilters: [
        '/restapi/v1.0/account/~/telephony/sessions'
      ],
      deliveryMode: {
        transportType: 'WebHook',
        address: 'https://gamipress-backend.onrender.com/webhook'
      },
      expiresIn: 3600
    });

    const data = await response.json();

    console.log('Suscripción creada correctamente:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error creando la suscripción:');

    if (error?.message) {
      console.error('Mensaje:', error.message);
    }

    if (error?.response?._json) {
      console.error('Respuesta JSON:');
      console.error(JSON.stringify(error.response._json, null, 2));
    } else if (error?.response?._text) {
      console.error('Respuesta texto:');
      console.error(error.response._text);
    } else if (error?.stack) {
      console.error(error.stack);
    } else {
      console.error(error);
    }
  }
}

main();