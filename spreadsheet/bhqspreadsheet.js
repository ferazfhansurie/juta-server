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

class bhqSpreadsheet {
  constructor(botMap) {
    this.botName = '001';
    this.spreadsheetId = '1nrRkv4QHj_It7Dm21b4uCR7BVN6UTb_p09-8t440lKc';
    this.sheetName = 'juta test'; // Update this to match your sheet name
    this.range = `${this.sheetName}!A:AV`; // Update this to cover all columns
    this.botMap = botMap;

    this.auth = new google.auth.GoogleAuth({
      keyFile: './service_account.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
  }

  async refreshAndProcessTimetable() {
    try {
      console.log(`Refreshing and processing timetable for bot ${this.botName}`);

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

      const currentDate = moment().format('dddd').toUpperCase();
      const currentTime = moment();

      let currentDateMalay;
      switch(currentDate){
        case 'MONDAY':
          currentDateMalay = 'Isnin';
          break;
        case 'TUESDAY':
          currentDateMalay = 'Selasa';
          break;
        case 'WEDNESDAY':
          currentDateMalay = 'Rabu';
          break;
        case 'THURSDAY':
          currentDateMalay = 'Khamis';
          break;
        case 'FRIDAY':
          currentDateMalay = 'Jumaat';
          break;
        case 'SATURDAY':
          currentDateMalay = 'Sabtu';
          break;
        case 'SUNDAY':
          currentDateMalay = 'Ahad';
          break;
        default:
          currentDateMalay = currentDate;
          break;
      }

      // Find the column index for the current day using the Malay name
      const dayIndex = rows[3].findIndex(day => day.trim().toLowerCase() === currentDateMalay.toLowerCase());
      if (dayIndex === -1) {
        console.log(`Column for ${currentDateMalay} (${currentDate}) not found. Available columns:`, rows[3]);
        return;
      }

      console.log(`Found column for ${currentDateMalay} (${currentDate}) at index ${dayIndex}`);
      console.log(`Processing rows starting from index 5`);

      for (let i = 5; i < rows.length; i++) {
        const timeSlot = rows[i][0];
        if (!timeSlot) {
          continue;
        }

        console.log(`Row ${i}: Processing time slot ${timeSlot}`);
        const startTime = rows[i][0];
        const endTime = rows[i][1];
        const classStartTime = moment(startTime, 'h:mm A');
        console.log('classStartTime: ', classStartTime.format('YYYY-MM-DD HH:mm:ss'));    
        console.log('currentTime: ', currentTime.format('YYYY-MM-DD HH:mm:ss'));    

        const timeUntilClass = classStartTime.diff(currentTime, 'minutes');

        console.log(`  Class starts at ${startTime}, time until class: ${timeUntilClass} minutes`);

        // Check if the class is within the next 2 hours
        if (timeUntilClass > 0 && timeUntilClass <= 120) {
          console.log(`  Classes at this time slot are within the next 2 hours`);
          
          // Process all teachers for this time slot
          let j = i;
          while (j < rows.length && rows[j][0] === startTime) {
            const teacherName = rows[j][dayIndex];
            const phoneNumber = rows[j][dayIndex + 1];
            const customerName = rows[j][dayIndex + 2];
            const customerPhone = rows[j][dayIndex + 3];

            console.log(`  Teacher: ${teacherName}, Phone: ${phoneNumber}`);

            if (teacherName && phoneNumber) {
              console.log(`  Sending reminder...`);
              await this.sendReminderToTeacher(teacherName, phoneNumber, startTime, endTime);
              if(customerName && customerPhone){
                await this.sendReminderToCustomer(customerName, customerPhone, startTime, endTime);
              } else{
                console.log(`  Missing customer name or phone number, skipping customer reminder`);
              }
            } else {
              console.log(`  Missing teacher name or phone number, skipping teacher sreminder`);
            }

            j++;
          }

          // Skip to the next time slot
          i = j - 1;
        } else {
          console.log(`  Classes at this time slot are not within the next 2 hours, skipping`);
        }
      }

      if(currentDateMalay === 'Ahad'){
      }

      console.log(`Finished processing timetable`);

    } catch (error) {
      console.error('Error processing timetable:', error);
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
    const contactRef = db.collection('companies').doc(idSubstring).collection('contacts').doc(extractedNumber);
    const messagesRef = contactRef.collection('messages');
  
    const messageDoc = messagesRef.doc(msg.id._serialized);
    await messageDoc.set(messageData, { merge: true });
    console.log(messageData);  
  }

  async sendReminderToTeacher(teacherName, phoneNumber, startTime, endTime) {
    const message = `Hello ${teacherName}, this is a reminder that you have a class from ${startTime} to ${endTime}. It starts in about 2 hours.`;

    const botData = this.botMap.get(this.botName);
    if (!botData || !botData[0].client) {
      console.log(`WhatsApp client not found for bot ${this.botName}`);
      return;
    }
    const client = botData[0].client;
    const extractedNumber = '+'+phoneNumber.split('@')[0];
    try {
      const sentMessage = await client.sendMessage(`${phoneNumber}@c.us`, message);
      await this.addMessagetoFirebase(sentMessage, this.botName, extractedNumber);
      console.log(`Reminder sent to ${teacherName} (${phoneNumber})`);
      // You can add additional logging or processing here if needed
    } catch (error) {
      console.error(`Error sending reminder to ${teacherName} (${phoneNumber}):`, error);
    }
  }

  async sendReminderToCustomer(customerName, phoneNumber, startTime, endTime) {
    const message = `Hello ${customerName}, this is a reminder that you have a class from ${startTime} to ${endTime}. It starts in about 2 hours.`;

    const botData = this.botMap.get(this.botName);
    if (!botData || !botData[0].client) {
      console.log(`WhatsApp client not found for bot ${this.botName}`);
      return;
    }
    const client = botData[0].client;
    const extractedNumber = '+'+phoneNumber.split('@')[0];
    try {
      const sentMessage = await client.sendMessage(`${phoneNumber}@c.us`, message);
      await this.addMessagetoFirebase(sentMessage, this.botName, extractedNumber);
      console.log(`Reminder sent to ${customerName} (${phoneNumber})`);
      // You can add additional logging or processing here if needed
    } catch (error) {
      console.error(`Error sending reminder to ${customerName} (${phoneNumber}):`, error);
    }
  }

  scheduleRefresh(cronExpression) {
    cron.schedule(cronExpression, async () => {
      console.log(`Refreshing timetable for bot ${this.botName}...`);
      await this.refreshAndProcessTimetable();
    });
  }

  initialize() {
    // Run the refresh immediately when initialized
    this.refreshAndProcessTimetable();

    // Schedule regular refreshes
    this.scheduleRefresh('*/15 * * * *'); // Every 15 minutes
  }
}

module.exports = bhqSpreadsheet;