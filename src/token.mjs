import { load, save } from './access-token.mjs';
import { get as getSettings } from './settings.mjs';

import request from 'request-promise-native';
import inquirer from 'inquirer';
import delay from 'delay';

export default async function token() {
  const settings = await getSettings();
  let accessToken = await load();

  if(accessToken && await isTokenValid(settings.domain, accessToken)) {
    console.log('Found valid access token in storage, using that.');
    printAccessToken(accessToken);
    return;
  }

  // Begin resource owner password credentials grant.
  console.log('No access token available in storage, ' + 
              'performing a resource owner password credentials grant');

  // 1. Ask user for username and password.
  const credentials = await getCredentials();

  // 2. Perform resource owner password credentials request to the /token
  // endpoint.
  let opts = {
    method: 'POST',
    uri: `https://${settings.domain}/oauth/token`,    
    body: {
      grant_type: 'password',
      username: credentials.username,
      password: credentials.password,
      scope: 'openid profile read:authenticators write:authenticators',
      client_id: settings.clientId
    },
    json: true,
    simple: false
  };

  let response = await request(opts);
  if(response.access_token) {
    console.log('Logged in (MFA is disabled)');

    await save(response.access_token);
    printAccessToken(response.access_token);

    return;
  }

  if(response.error && response.error !== 'mfa_required') {
    console.log('Non MFA error code, failing. Response: ', response);
    return;
  }

  console.log(`MFA required. MFA token is ${response.mfa_token}`);

  // 3. MFA required, perform request to 'challenge' endpoint. Accept all
  // authenticator types.  
  const mfaToken = response.mfa_token;

  opts = {
    method: 'POST',
    uri: `https://${settings.domain}/mfa/challenge`,    
    body: {
      mfa_token: mfaToken,
      challenge_type: 'otp oob',      
      client_id: settings.clientId
    },
    json: true,
    simple: false
  };

  response = await request(opts);

  if(!response.challenge_type) {
    console.log('Error in MFA challenge response: ', response);
    return;
  }

  console.log(`Selected MFA type is: ${response.challenge_type}`);

  // 4. Select MFA method and act on it.
  const grantOpts = {};
  switch(response.challenge_type) {
    case 'otp':
      console.log('MFA mechanism is: TOTP');
      
      grantOpts.otp = await promptForCode();
      grantOpts.grant_type = 'http://auth0.com/oauth/grant-type/mfa-otp';      
      
      break;
    case 'oob':
      grantOpts.grant_type = 'http://auth0.com/oauth/grant-type/mfa-oob';
      grantOpts.oob_code = response.oob_code;

      if(response.binding_method && response.binding_method === 'prompt') {
        console.log('MFA mechanism is: OOB with binding code prompt');
      
        grantOpts.binding_code = await promptForCode();
      } else {
        console.log('MFA mechanism is: OOB without binding code');
      }
      break;
  }

  // 5. According to MFA type, request the final strong authorization grant.
  // If the MFA mechanism is OOB without a binding code prompt, we need to poll
  // the auth server as long as the error coded returned is 
  // 'authorization_pending'.
  opts = {
    method: 'POST',
    uri: `https://${settings.domain}/oauth/token`,    
    body: {
      mfa_token: mfaToken,
      client_id: settings.clientId,
      ...grantOpts
    },
    json: true,
    simple: false
  };

  do {
    response = await request(opts);
  } while(response.error &&
          response.error === 'authorization_pending' &&
          await delay(5000, true));

  if(response.error) {
    console.log('Strong grant authorization request failed, response: ',
                response);
    return;
  }

  console.log(`Got access token, expires in: ${response.expires_in}`);
  printAccessToken(response.access_token);
  save(response.access_token);
}

/*****************************/
/***** Support functions *****/
/*****************************/

function printAccessToken(accessToken) {
  console.log(`The access token is: ${accessToken}`);
}

async function isTokenValid(domain, accessToken) {
  // To validate a token, this example makes a request to an endpoint that
  // requires a valid access token: the /userinfo endpoint. If it works,
  // the token is still valid.

  const opts = {
    uri: `https://${domain}/userinfo`,
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    json: true
  };

  return request(opts).then(() => true, () => false);
}

async function getCredentials() {
  return inquirer.prompt([{
    name: 'username',
    message: 'Please enter your username',
    validate: input => input.length > 0
  }, {
    type: 'password',
    name: 'password',
    message: 'Please enter your password',
    validate: input => input.length > 0
  }]);
}

async function promptForCode() {
  const answer = await inquirer.prompt([{
    name: 'code',
    message: 'Please enter code'
  }]);
  return answer.code;
}
