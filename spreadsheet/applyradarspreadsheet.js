const OpenAI = require('openai');
const axios = require('axios');
const { google } = require('googleapis');
const path = require('path');
const { Client } = require('whatsapp-web.js');
const util = require('util');
const moment = require('moment-timezone');
const fs = require('fs');
const cron = require('node-cron');

const { v4: uuidv4 } = require('uuid');

const { URLSearchParams } = require('url');
const admin = require('../firebase.js');
const db = admin.firestore();

const openai = new OpenAI({
  apiKey: process.env.OPENAIKEY,
});

const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

class applyRadarSpreadsheet {
  constructor(botMap) {
    this.botName = '060';
    this.spreadsheetId = '11OH6bQCBlWiW_8Qb2aTehwgD_i5Oyfddri1jZxhXdpE';
    this.sheetName = 'Tactical LP - UNITEN';
    this.range = `${this.sheetName}!A:S`; // Update this line
    this.LAST_PROCESSED_ROW_FILE = `last_processed_row_${this.botName}.json`;
    this.botMap = botMap;

    this.auth = new google.auth.GoogleAuth({
      keyFile: './service_account.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
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
        console.log("current row: ", row);
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
    const [
        timestamp,
        name,
        email,
        phoneNumber,
        qualificationLevel,
        faculty,
        preferredLevelOfStudy,
        preferredProgramme,
        leadSource,
        utmSource,
        utmMedium,
        utmName,
        utmTerm,
        utmContent,
        waSent
      ] = row;

    if (waSent === 'Sent') {
      console.log(`Row already processed. Skipping.`);
      return;
    }

    const message = `Hello ${name},\n\nThank you for submitting your enquiries to UNITEN for ${preferredProgramme}\nMay I know about your education background a bit before out counsellor contacts you? So we can start with:\n\nWhat is your highest level of qualification?\n\nReply 1 - SPM/Equivalent leavers\n\nReply 2 - STPM/Foundation/Diploma/Equivalent\n\nReply 3 - Bachelor Degree\n\nReply 4 - Master Degree`;

  
    console.log(`Processing row: ${name} (${phoneNumber})`);
    const thread = await this.createThread();
    let threadID = thread.id;
    const extractedNumber = '+'+(phoneNumber);

    await this.saveThreadIDFirebase(extractedNumber, threadID, '060')

    const data = {
      additionalEmails: [],
      address1: null,
      assignedTo: null,
      businessId: null,
      phone: extractedNumber,
      tags: ['blasted'],
      chat: {
          contact_id: extractedNumber,
          id: phoneNumber,
          name: name || extractedNumber,
          not_spam: true,
          tags: ['blasted'],
          timestamp: Date.now(),
          type: 'contact',
          unreadCount: 0,
          last_message: {
              chat_id: phoneNumber,
              from: "",
              from_me: true,
              id: "",
              source: "",
              status: "delivered",
              text: {
                  body: message ?? ""
              },
              timestamp: Date.now(),
              type:'text',
          },
      },
      chat_id: phoneNumber,
      city: null,
      companyName: null,
      contactName: name || extractedNumber,
      unreadCount: 0,
      threadid: threadID ?? "",
      phoneIndex: 0,
      last_message: {
          chat_id: phoneNumber,
          from: "",
          from_me: true,
          id: "",
          source: "",
          status: "delivered",
          text: {
              body: message ?? ""
          },
          timestamp: Date.now() ?? 0,
          type: 'text',
      },
  };
  await this.addMessagetoFirebase(data, extractedNumber, threadID);
  await db.collection('companies').doc('060').collection('contacts').doc(extractedNumber).set(data, {merge: true});    

    const botData = this.botMap.get(this.botName);
    console.log("botMap: ", this.botMap);
    console.log("botData: ", botData);
    if (!botData || !botData.client) {
      console.log(`WhatsApp client not found for bot ${this.botName}`);
      return;
    }
    const client = botData[0].client;
  
    // Construct the message
  
    // Send the message to the phone number from the row
    try {
      const formattedPhoneNumber = phoneNumber.startsWith('60') ? phoneNumber : `60${phoneNumber}`;
      await client.sendMessage(`${formattedPhoneNumber}@c.us`, message);
      console.log(`Message sent to ${name} (${phoneNumber})`);
      
      // Mark the row as sent
      await this.markRowAsSent(rowIndex);
    } catch (error) {
      console.error(`Error sending message to ${name} (${phoneNumber}):`, error);
    }
  }
  
  async markRowAsSent(rowIndex) {
    try {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!O${rowIndex}`, // Column Q is for "WA Sent"
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [['Sent']]
        }
      });
      console.log(`Marked row ${rowIndex} as sent in "WA Sent" column`);
    } catch (error) {
      console.error(`Error marking row ${rowIndex} as sent:`, error);
    }
  }

  async addMessage(threadId, message) {
    const response = await openai.beta.threads.messages.create(
        threadId,
        {
            role: "user",
            content: message
        }
    );
    return response;
}
async saveThreadIDFirebase(contactID, threadID, idSubstring) {
    
  // Construct the Firestore document path
  const docPath = `companies/${idSubstring}/contacts/${contactID}`;

  try {
      await db.doc(docPath).set({
          threadid: threadID
      }, { merge: true }); // merge: true ensures we don't overwrite the document, just update it
      console.log(`Thread ID saved to Firestore at ${docPath}`);
  } catch (error) {
      console.error('Error saving Thread ID to Firestore:', error);
  }
}
async addMessagetoFirebase(msg, idSubstring, extractedNumber){
  console.log('Adding message to Firebase');
  console.log('idSubstring:', idSubstring);
  console.log('extractedNumber:', extractedNumber);

  if (!extractedNumber || !extractedNumber.startsWith('+60')) {
      console.error('Invalid extractedNumber for Firebase document path:', extractedNumber);
      return;
  }

  if (!idSubstring) {
      console.error('Invalid idSubstring for Firebase document path');
      return;
  }
  let messageBody = msg.body;
  let audioData = null;
  let type = '';
  if(msg.type === 'chat'){
      type ='text'
    }else{
      type = msg.type;
    }
  if (msg.hasMedia && msg.type === 'audio') {
      console.log('Voice message detected');
      const media = await msg.downloadMedia();
      const transcription = await transcribeAudio(media.data);
      console.log('Transcription:', transcription);
              
      messageBody = transcription;
      audioData = media.data;
      console.log(msg);
  }
  const messageData = {
      chat_id: msg.from,
      from: msg.from ?? "",
      from_me: msg.fromMe ?? false,
      id: msg.id._serialized ?? "",
      status: "delivered",
      text: {
          body: messageBody ?? ""
      },
      timestamp: msg.timestamp ?? 0,
      type: type,
  };

  if((msg.from).includes('@g.us')){
      const authorNumber = '+'+(msg.author).split('@')[0];

      const authorData = await getContactDataFromDatabaseByPhone(authorNumber, idSubstring);
      if(authorData){
          messageData.author = authorData.contactName;
      }else{
          messageData.author = msg.author;
      }
  }

  if (msg.type === 'audio') {
      messageData.audio = {
          mimetype: 'audio/ogg; codecs=opus', // Default mimetype for WhatsApp voice messages
          data: audioData // This is the base64 encoded audio data
      };
  }

  if (msg.hasMedia &&  msg.type !== 'audio') {
      try {
          const media = await msg.downloadMedia();
          if (media) {
            if (msg.type === 'image') {
              messageData.image = {
                  mimetype: media.mimetype,
                  data: media.data,  // This is the base64-encoded data
                  filename: msg._data.filename || "",
                  caption: msg._data.caption || "",
              };
              // Add width and height if available
              if (msg._data.width) messageData.image.width = msg._data.width;
              if (msg._data.height) messageData.image.height = msg._data.height;
            } else if (msg.type === 'document') {
                messageData.document = {
                    mimetype: media.mimetype,
                    data: media.data,  // This is the base64-encoded data
                    filename: msg._data.filename || "",
                    caption: msg._data.caption || "",
                    pageCount: msg._data.pageCount,
                    fileSize: msg._data.size,
                };
            }else if (msg.type === 'video') {
                  messageData.video = {
                      mimetype: media.mimetype,
                      filename: msg._data.filename || "",
                      caption: msg._data.caption || "",
                  };
                  // Store video data separately or use a cloud storage solution
                  const videoUrl = await storeVideoData(media.data, msg._data.filename);
                  messageData.video.link = videoUrl;
            } else {
                messageData[msg.type] = {
                    mimetype: media.mimetype,
                    data: media.data,
                    filename: msg._data.filename || "",
                    caption: msg._data.caption || "",
                };
            }

            // Add thumbnail information if available
            if (msg._data.thumbnailHeight && msg._data.thumbnailWidth) {
                messageData[msg.type].thumbnail = {
                    height: msg._data.thumbnailHeight,
                    width: msg._data.thumbnailWidth,
                };
            }

            // Add media key if available
            if (msg.mediaKey) {
                messageData[msg.type].mediaKey = msg.mediaKey;
            }

            
          }  else {
              console.log(`Failed to download media for message: ${msg.id._serialized}`);
              messageData.text = { body: "Media not available" };
          }
      } catch (error) {
          console.error(`Error handling media for message ${msg.id._serialized}:`, error);
          messageData.text = { body: "Error handling media" };
      }
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

  async createThread() {
    console.log('Creating a new thread...');
    const thread = await openai.beta.threads.create();
    return thread;
}

  initialize() {
    // Run the check immediately when initialized
    this.checkAndProcessNewRows();

    // Schedule regular checks
    this.scheduleCheck('*/5 * * * *');
  }
}

module.exports = applyRadarSpreadsheet;