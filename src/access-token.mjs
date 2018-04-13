import fs from 'fs';

const fileName = '.access-token';

export function load() {
  return new Promise((resolve, reject) => {
    fs.readFile(`./${fileName}`, 'utf8', (err, data) => {
      resolve(err ? 'null' : data);
    });
  });
}

export function save(accessToken) {
  return new Promise((resolve, reject) => {
    fs.writeFile(`./${fileName}`, accessToken, err => {
      if(err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function clear() {
  return new Promise((resolve, reject) => {
    fs.unlink(`./${fileName}`, err => {
      if(err){ 
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
