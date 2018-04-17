import http from 'http';
import request from 'request-promise-native';
import urlModule from 'url';
import _ from 'lodash';

const URL = urlModule.URL;

function filterBody(body) {  
  if(!body) {
    return body;
  }

  const result = _.cloneDeep(body);

  if(result.mfa_token) {
    result.mfa_token = result.mfa_token.substr(0, 32) + '...';
  }

  if(result.oob_code) {
    result.oob_code = result.oob_code.substr(0, 32) + '...';
  }

  if(result.password) {
    result.password = '********';
  }

  if(result.access_token) {
    result.access_token = result.access_token.substr(0, 32) + '...';
  }

  if(result.id_token) {
    result.id_token = result.id_token.substr(0, 32) + '...';
  }

  return result;
}

export default function(log) {
  function printRequest(options) {
    let opts = options;

    if (typeof options === 'string' || options instanceof String) {
      opts = {
        method: 'GET',
        uri: options        
      }
    }

    const url = new URL(opts.uri);
    const path = url.pathname + (url.search ? `?${url.search}` : '');
    let msg = 
      `>>> ${opts.method.toUpperCase()} ${path} HTTP/1.1\n` + 
      `    Host: ${url.host}\n` +
      `    Content-Type: application/json\n`;
    
    if(opts.body) {      
      msg += `${JSON.stringify(filterBody(opts.body), null, 2)}\n`;
    }

    log(msg);
  }

  function printResponse(response) {
    /*if(response instanceof http.IncomingMessage) {
      log('Error: not a valid (or full) response');
      return;
    }*/

    let msg = 
      `<<< HTTP/1.1 ${response.statusCode} ${response.statusMessage}\n`;

    if(response.body) {
      msg += `${JSON.stringify(filterBody(response.body), null, 2)}\n`;
    }

    log(msg);
  }

  return async function(options) {
    if(options.verbose === false) {
      return request.apply(null, arguments);
    }

    printRequest(options);

    try {
      const response = await request.apply(null, arguments);
      
      printResponse(response);
      
      return response;
    } catch(e) {
      if(typeof e === 'IncomingMessage') {
        printResponse(e);
      }

      throw e;
    }
  }
}
