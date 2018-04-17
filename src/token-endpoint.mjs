import { load, save, clear } from './access-token.mjs';
import { get as getSettings } from './settings.mjs';
import { associateNewAuthenticatorRequest } from './associate-endpoint.mjs';

import requestPrinter from './request-printer.mjs';

import inquirer from 'inquirer';
import delay from 'delay';

const request = requestPrinter(console.error);

export async function 
strongAuthGrantRequest(settings, 
                       mfaToken,
                       challengeType,
                       bindingMethod,
                       oobCode, 
                       verbose) {
  const body = {};
  
  switch(challengeType) {
    case 'otp':
      console.log('MFA mechanism is: TOTP');
      
      body.otp = await promptForCode();
      body.grant_type = 'http://auth0.com/oauth/grant-type/mfa-otp';      
      
      break;
    case 'oob':
      body.grant_type = 'http://auth0.com/oauth/grant-type/mfa-oob';
      
      if(typeof oobCode !== 'undefined') {
        body.oob_code = oobCode;
      }

      if(bindingMethod && bindingMethod === 'prompt') {
        console.log('MFA mechanism is: OOB with binding code prompt');
      
        body.binding_code = await promptForCode();
      } else {
        console.log('MFA mechanism is: OOB without binding code');
      }
      break;
  }

  const opts = {
    method: 'POST',
    uri: `https://${settings.domain}/oauth/token`,    
    body: {
      mfa_token: mfaToken,
      client_id: settings.clientId,
      ...body
    },
    json: true,
    simple: false,
    resolveWithFullResponse: true
  };

  if(verbose === false) {
    verbose: false
  }

  return request(opts);
}

export async function
resourceOwnerGrantRequest(settings, credentials, scope, audience, verbose) {
  const opts = {
    method: 'POST',
    uri: `https://${settings.domain}/oauth/token`,    
    body: {
      grant_type: 'password',
      username: credentials.username,
      password: credentials.password,
      scope: scope,
      client_id: settings.clientId
    },
    json: true,
    simple: false,
    resolveWithFullResponse: true    
  };

  if(audience) {
    opts.body.audience = audience;
  }

  if(verbose === false) {
    verbose: false
  }

  return request(opts);
}

export async function 
challengeRequest(settings, mfaToken, challengeTypes, verbose) {
  const opts = {
    method: 'POST',
    uri: `https://${settings.domain}/mfa/challenge`,    
    body: {
      mfa_token: mfaToken,
      challenge_type: challengeTypes,      
      client_id: settings.clientId
    },
    json: true,
    simple: false,
    resolveWithFullResponse: true
  };

  if(verbose === false) {
    verbose: false
  }

  return request(opts);  
}

export default async function token(verbose) {
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
  let response = await resourceOwnerGrantRequest(
    settings,
    credentials,
    'openid profile enroll read:authenticators remove:authenticators',
    `https://${settings.domain}/mfa/`,
    verbose);
  
  if(response.body.access_token) {
    console.log('Logged in (MFA is disabled).');

    await save(response.body.access_token);
    printAccessToken(response.body.access_token);

    return;
  }  

  if(response.body.error && response.body.error !== 'mfa_required') {
    console.log('Non MFA error code, failing. Response: ', response);
    return;
  }

  console.log(`MFA required. Got MFA token!`);

  // 3. MFA required, perform request to 'challenge' endpoint. Accept all
  // authenticator types.  
  const mfaToken = response.body.mfa_token;

  response = await challengeRequest(settings, mfaToken, 'otp oob', verbose);
  
  if(response.body.error && response.body.error === 'association_required') {
    console.log('An authenticator factor must be associated to continue, ' + 
                'starting the association process...');
    
    await associateNewAuthenticatorRequest(settings, mfaToken);
    // After the association request either we have a valid access token
    // or everything failed, so we can return here.
    return;
  }  

  if(!response.body.challenge_type) {
    console.log('Error in MFA challenge response: ', response);
    return;
  }

  console.log(`Selected MFA type is: ${response.body.challenge_type}`);

  // 4. According to MFA type, request the final strong authorization grant.
  // If the MFA mechanism is OOB without a binding code prompt, we need to poll
  // the auth server as long as the error coded returned is 
  // 'authorization_pending'.
  const challengeType = response.body.challenge_type;
  const bindingMethod = response.body.binding_method;
  const oobCode = response.body.oob_code;
  
  while(true) {
    response = await strongAuthGrantRequest(settings,
                                            mfaToken,
                                            challengeType,
                                            bindingMethod,
                                            oobCode, 
                                            verbose);

    if(response.body.error === 'authorization_pending') {
      console.log('Authorization pending, retrying in 5 seconds...');
      await delay(5000);
    } else {
      break;
    }
  }  

  if(response.body.error) {
    console.log('Strong grant authorization request failed, response: ',
                response);
    return;
  }

  console.log(`Got access token, expires in: ${response.body.expires_in}`);
  printAccessToken(response.body.access_token);
  await save(response.body.access_token);
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
