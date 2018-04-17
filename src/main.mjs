import token from './token-endpoint.mjs';
import associate from './associate-endpoint.mjs';
import { setup } from './settings.mjs';
import { clear } from './access-token.mjs';

const usage = 
`
Usage: oauth2-mfa-cli <command> [<subcommand>]

oauth2-mfa-cli is a simple app that shows how OAuth 2.0 MFA endpoints work.

Commands:
  token           Performs a resource owner password credentials grant request.
                  This command will request your username and password. It will
                  also allow you to input a scope and audience for the requested
                  token. If successful, it prints the access token and stores it
                  in a '.access-token' file in the directory the command was
                  run from.

  login           Alias for 'token'.

  associate       Without a subcommand, it lists the associated authenticators.
                  Performs a GET request against the associate endpoint. May
                  require your username and password if an access token has not
                  been obtained recently.

  authenticators  Alias for 'associate'.

  setup           This command allows you to setup common settings required
                  for other commands to work, such as the Auth0 client ID and
                  the Auth0 domain. These settings are stored under the
                  '.settings' file in the directory the command was run from.

  logout          Discards the current access token (if any).

Subcommands for 'associate':
  list            Alias for 'associate' without subcommand. Lists
                  authenticators.

  new             Associates a new authenticator.

  delete          Deletes an authenticator.

  delete-all      Delete all authenticators.

`;

function isVerbose() {
  return process.argv.includes('--verbose') || process.argv.includes('-v');
}

async function run() {
  switch(process.argv[2]) {
    case 'login':
    case 'token':
      return token(isVerbose());
    case 'associate':
    case 'authenticators':
      return associate(process.argv[3], isVerbose());
    case 'setup':
      return setup();
    case 'logout':
      await clear();
      console.log('Logged out');
      return;
    default:
      console.log(usage);
  }
}

process.on('SIGINT',  () => { 
  console.log('Exit requested, quitting.') 
  process.exit();
});
process.on('SIGTERM', () => {
  console.log('Exit requested, quitting.') 
  process.exit();
});

run().then(() => process.exit(), e => {
  console.log(e); 
  process.exit(-1);
});
