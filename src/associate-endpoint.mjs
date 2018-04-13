import { load, save } from './access-token.mjs';
import token, { strongAuthGrantRequest } from './token-endpoint.mjs';
import { get as getSettings } from './settings.mjs';

import request from 'request-promise-native';
import inquirer from 'inquirer';

export async function
associateListAuthenticatorsRequest(settings, accessToken) {
  console.log('Getting list of authenticators...');

  const opts = {
    uri: `https://${settings.domain}/mfa/authenticators`,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    json: true
  };

  try {
    const authenticators = await request(opts);
    console.log('Authenticators:');
    console.log(JSON.stringify(authenticators, null, 2));
    return authenticators;
  } catch(e) {
    console.log('Failed to list authenticators: ', e);
  }
}

export async function
associateDeleteAuthenticatorRequest(settings, accessToken, id) {
  if(typeof id === 'undefined') {
    const answer = await inquirer.prompt([{
      name: 'id',
      message: 'Please enter the authenticator ID',
      validate: input => input.length > 0
    }]);

    id = encodeURIComponent(answer.id);
  } else {
    id = encodeURIComponent(id);
  }

  const opts = {
    method: 'DELETE',
    uri: `https://${settings.domain}/mfa/authenticators/${id}`,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    resolveWithFullResponse: true,
    simple: false
  };

  const response = await request(opts);
  if(response.statusCode === 204) {
    console.log('Successfully deleted authenticator');
  } else {
    console.log('Failed to delete authenticator, response: ', response);
  }
}

export async function associateNewAuthenticatorRequest(settings, accessToken) {
  const answers = await inquirer.prompt([{
    type: 'list',
    name: 'type',
    message: 'What type of MFA mechanism would you like to enable?',
    choices: ['otp', 'oob']
  }, {
    type: 'list',
    name: 'oobChannel',
    message: 'What type of OOB authenticator would you like to use?',
    choices: ['sms', 'email', 'auth0'],
    when: answers => answers.type === 'oob'
  }, {
    name: 'phone',
    message: 'Please enter your cellphone number (only numbers and plus sign)',
    validate: input => /[\d\+]/.test(input),
    when: answers => answers.oobChannel === 'sms'
  }, {
    name: 'email',
    message: 'Please enter your e-mail address',
    validate: input => input.length > 0,
    when: answers => answers.oobChannel === 'email'
  }]);

  const body = {
    authenticator_types: [answers.type],
    phone_number: answers.phone,
    email: answers.email,
    oob_channels: answers.type === 'oob' ? [answers.oobChannel] : undefined
  };

  let opts = {
    method: 'POST',
    uri: `https://${settings.domain}/mfa/associate`,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: body,
    json: true
  };

  let oobCode;
  try {
    const response = await request(opts);
    
    console.log('Authenticator partially associated, confirmation required.');

    oobCode = response.oob_code;

    if(response.barcode_uri) {
      console.log(`- Barcode/QR URL: ${response.barcode_uri}`);
      console.log('Use this URL in your browser:\n');
      // Warning: using an external URL to share this is a SECURITY ISSUE.
      // Do not do this in production.
      console.log('https://chart.googleapis.com/' +
                  'chart?chs=166x166&chld=L|0&cht=qr&chl=' +
                  encodeURIComponent(response.barcode_uri));
      console.log('');
    }
    
    if(response.recovery_codes) {
      console.log(`- Recovery codes: ${response.recovery_codes}`);
    }    
  } catch(e) {
    console.log('Failed to associate authenticator, response: ', e);
    return;
  }

  // Confirm association by making request to /token endpoint.
  let response;

  const bindingMethod = answers.oobChannel === 'sms' ? 'prompt' : null;
  do {
    response = await strongAuthGrantRequest(settings,
                                            accessToken,
                                            answers.type,
                                            bindingMethod,
                                            oobCode);
  } while(response.body.error &&
          response.body.error === 'authorization_pending' &&
          await delay(5000, true));
  
  if(response.body.error || !response.body.access_token) {
    console.log('Association confirmation failed: ', response);
    return;
  }

  console.log('Association confirmed.');
  console.log(`Got access token, expires in: ${response.body.expires_in}`);
  console.log(`The access token is: ${response.body.access_token}`);
  await save(response.body.access_token);
}

export async function associateDeleteAllAuthenticators(settings, accessToken) {
  const authenticators = 
    await associateListAuthenticatorsRequest(settings, accessToken);
  
  const requests = [];
  for(const authenticator of authenticators) {
    if(authenticator.id.indexOf('recovery-code') !== -1) {
      continue;
    }
    
    requests.push(
      associateDeleteAuthenticatorRequest(
        settings, accessToken, authenticator.id));
  }

  console.log('Deleting all authenticators...');
  await Promise.all(requests);
  console.log('Done.');
}

export default async function associate(action) {
  const settings = await getSettings();

  let accessToken = await load();
  while(!accessToken) {
    console.log('To use the associate endpoint you must be logged-in, ' + 
                'attempting to log in.');
    await token();
    accessToken = await load();
  }

  switch(action) {
    case 'new':
      return associateNewAuthenticatorRequest(settings, accessToken);
      break;
    case 'delete':
      return associateDeleteAuthenticatorRequest(settings, accessToken);
      break;
    case 'delete-all':
      return associateDeleteAllAuthenticators(settings, accessToken);
    default:
      return associateListAuthenticatorsRequest(settings, accessToken);
  }
}
