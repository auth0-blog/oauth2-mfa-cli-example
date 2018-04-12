import inquirer from 'inquirer';
import fs from 'fs';

const fileName = '.settings';

export function get() {
  return new Promise((resolve, reject) => {
    fs.readFile(`./${fileName}`, (err, data) => {

      if(err) {
        resolve(setup());
      } else {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(setup());
        }
      }

    });
  });
}

export async function setup() {  
  const answers = await inquirer.prompt([{
    name: 'domain',
    message: 'Please enter your Auth0 Domain',
    validate: input => input.length > 0
  }, {
    name: 'clientId',
    message: 'Please enter your Auth0 client ID',
    validate: input => input.length > 0
  }]);

  return new Promise((resolve, reject) => {
    fs.writeFile(`./${fileName}`, JSON.stringify(answers), err => {
      if(err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
