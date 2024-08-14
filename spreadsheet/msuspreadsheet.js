const { google } = require('googleapis');
const cron = require('node-cron');
const fs = require('fs');
const util = require('util');

const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

class msuSpreadsheet {
  constructor(botMap) {
    this.botName = '001';
    this.spreadsheetId = '1_rW9VE-B6nT52aXiK6YhY8728sSawqSp0LIUiRCK5RA';
    this.range = 'Sheet1!A:S';
    this.LAST_PROCESSED_ROW_FILE = `last_processed_row_${this.botName}.json`;
    this.botMap = botMap;

    this.auth = new google.auth.GoogleAuth({
      keyFile: './service_account.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  async checkAndProcessNewRows() {
    try {
      console.log(`Starting to check for new rows for bot ${this.botName}`);
      const { lastProcessedRow } = await this.loadLastProcessedRow();
      console.log(`Last processed row: ${lastProcessedRow}`);

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        console.log('No data found in the spreadsheet.');
        return;
      }

      console.log(`Total rows in spreadsheet: ${rows.length}`);

      let newLastProcessedRow = lastProcessedRow;

      // Process new rows
      for (let i = lastProcessedRow + 1; i < rows.length; i++) {
        const row = rows[i];
        await this.processRow(row);
        newLastProcessedRow = i;
      }

      // Update the last processed row
      await this.saveLastProcessedRow(newLastProcessedRow);
      console.log(`Updated last processed row to ${newLastProcessedRow}`);
    } catch (error) {
      console.error('Error processing spreadsheet:', error);
    }
  }

  async processRow(row) {
    const [timestamp, leadsource, name, email, phoneNumber, icNumber, fieldOfStudy, levelOfQualification, nationality, modeOfStudy, articleName, colIssued] = row;

    console.log(`Processing row: ${name} (${phoneNumber})`);
    
    // Send WhatsApp message
    const botData = this.botMap.get(this.botName);
    if (!botData || !botData.client) {
      console.log(`WhatsApp client not found for bot ${this.botName}`);
      return;
    }
    const client = botData.client;

    // Construct the message
    const message = `New lead received:
    Name: ${name}
    Email: ${email}
    Phone: ${phoneNumber}
    Field of Study: ${fieldOfStudy}
    Level of Qualification: ${levelOfQualification}
    Nationality: ${nationality}
    Mode of Study: ${modeOfStudy}
    Article Name: ${articleName}
    COL Issued: ${colIssued}`;

    // Send the message to a designated number or group
    const designatedRecipient = process.env.DESIGNATED_RECIPIENT;
    try {
      await client.sendMessage('601121677522@c.us', message);
      console.log(`Message sent for ${name} (${phoneNumber})`);
    } catch (error) {
      console.error(`Error sending message for ${name} (${phoneNumber}):`, error);
    }
  }

  async loadLastProcessedRow() {
    try {
      const data = await readFileAsync(this.LAST_PROCESSED_ROW_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      console.log(`Loaded last processed row: ${parsedData.lastProcessedRow}`);
      return parsedData;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('No saved state found, starting from the beginning.');
        return { lastProcessedRow: 0 };
      }
      console.error('Error loading last processed row:', error);
      throw error;
    }
  }

  async saveLastProcessedRow(lastProcessedRow) {
    try {
      const data = JSON.stringify({ lastProcessedRow });
      await writeFileAsync(this.LAST_PROCESSED_ROW_FILE, data, 'utf8');
      console.log(`Saved last processed row: ${lastProcessedRow}`);
    } catch (error) {
      console.error('Error saving last processed row:', error);
      throw error;
    }
  }

  scheduleCheck(cronExpression) {
    cron.schedule(cronExpression, async () => {
      console.log(`Checking for new rows for bot ${this.botName}...`);
      await this.checkAndProcessNewRows();
    });
  }

  initialize() {
    // Run the check immediately when initialized
    this.checkAndProcessNewRows();

    // Schedule regular checks
    this.scheduleCheck('*/5 * * * *');
  }
}

module.exports = msuSpreadsheet;