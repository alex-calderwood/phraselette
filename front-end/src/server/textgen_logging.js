const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']//This more restricted scope doesn't work for other users besides Melissa: ['https://www.googleapis.com/auth/drive.file']
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorizeGoogle() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Create a google spreadsheet
 * @param {string} title Spreadsheets title
 * @return {string} Created spreadsheets ID
 */
async function createSheet(auth, title) {
  const service = google.sheets({version: 'v4', auth});
  const resource = {
    properties: {
      title,
    }
  };
  try {
    const spreadsheet = await service.spreadsheets.create({
      resource,
      fields: 'spreadsheetId',
    });
    const spreadsheetId = spreadsheet.data.spreadsheetId
    await appendSheetItem(auth, spreadsheetId, "prompt", "model", "params", "output")
    return spreadsheet.data.spreadsheetId;
  } catch (err) {
    // TODO (developer) - Handle exception
    throw err;
  }
}

async function appendSheetItem(auth, spreadsheetId, prompt, model, params, output) {
  const service = google.sheets({version: 'v4', auth});
  let values = [
    [
      prompt,
      model,
      params,
      output
    ],
  ];
  const request = {
    "spreadsheetId": spreadsheetId,
    "range": "Sheet1!A1:E1",
    "valueInputOption": "RAW",
    "resource": {
      "values": values
    }
  };
  try {
    const result = await service.spreadsheets.values.append(request);
    console.log('Appended one data item to sheet ' + spreadsheetId);
    return result;
  } catch (err) {
    // TODO (developer) - Handle exception
    throw err;
  }
}

module.exports = {authorizeGoogle, createSheet, appendSheetItem}