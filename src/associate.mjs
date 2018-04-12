import { load } from './access-token.mjs';
import token from './token.mjs';
import { get as getSettings } from './settings.mjs';

import request from 'request-promise-native';
import inquirer from 'inquirer';

async function listAuthenticators(settings, accessToken) {
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
  } catch(e) {
    console.log('Failed to list authenticators: ', e);
  }
}

async function deleteAuthenticator(settings, accessToken) {
  const answer = await inquirer.prompt([{
    name: 'id',
    message: 'Please enter the authenticator ID',
    validate: input => input.length > 0
  }]);

  const id = encodeURIComponent(answer.id);

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

async function newAuthenticator(settings, accessToken) {
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
    oobChannels: answers.type === 'oob' ? [answers.oobChannel] : undefined
  };

  const opts = {
    method: 'POST',
    uri: `https://${settings.domain}/mfa/authenticators`,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: body,
    json: true
  };

  try {
    const response = await request(opts);
    
    console.log('Authenticator associated:');
    
    if(response.barcode_uri) {
      console.log(`- Barcode/QR URL: ${response.barcode_uri}`);    
    }
    
    if(response.recovery_codes) {
      console.log(`- Recovery codes: ${response.recovery_codes}`);
    }
  } catch(e) {
    console.log('Failed to associate authenticator, response: ', e);
  }
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
      return newAuthenticator(settings, accessToken);
      break;
    case 'delete':
      return deleteAuthenticator(settings, accessToken);
      break;
    default:
      return listAuthenticators(settings, accessToken);
  }
}
