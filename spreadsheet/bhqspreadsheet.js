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
    this.botName = '075';
    this.spreadsheetId = '1nrRkv4QHj_It7Dm21b4uCR7BVN6UTb_p09-8t440lKc';
    this.sheetName = 'JADUAL AI REMINDER'; // Update this to match your sheet name
    this.range = `${this.sheetName}!A:AV`; // Update this to cover all columns
    this.botMap = botMap;

    this.auth = new google.auth.GoogleAuth({
      keyFile: './service_account.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    this.remindersFile = path.join(__dirname, 'sentReminders.json');
    this.sentReminders = {};
    this.weeklyReportSchedule = null;
    this.loadSentReminders();
  }

  columnToLetter(column) {
    let temp, letter = '';
    while (column > 0) {
      temp = (column - 1) % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      column = (column - temp - 1) / 26;
    }
    return letter;
  }

  async updateAttendance(phoneNumber, isAttending) {
    try {
      console.log(`Updating attendance for ${phoneNumber}`);
      const phoneWithoutPlus = phoneNumber.replace('+', '');
      
      // Get contact data from the database
      const contactData = await this.getContactDataFromDatabaseByPhone(phoneNumber, this.botName);
      
      if (!contactData || !contactData.row) {
        console.log(`No contact data or row information found for ${phoneNumber}`);
        return;
      }
  
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
      });
  
      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        console.log('No data found in the spreadsheet.');
        return;
      }
  
      const currentDate = moment().format('dddd').toUpperCase();
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
      // Find the column index for the current day
      const dayIndex = rows[3].findIndex(day => day.trim().toLowerCase() === currentDateMalay.toLowerCase());
      if (dayIndex === -1) {
        console.log(`Column for ${currentDateMalay} (${currentDate}) not found.`);
        return;
      }
  
      // Use the row from contact data
      const rowIndex = contactData.row - 1; // Subtract 1 because spreadsheet rows are 1-indexed, but array is 0-indexed
  
      // Update the KEHADIRAN column
      const attendanceColumn = dayIndex + 7; // KEHADIRAN column is 6 columns after the day column
      const updateRange = `${this.sheetName}!${this.columnToLetter(attendanceColumn)}${rowIndex + 1}`;
      
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: updateRange,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[isAttending ? 'TRUE' : 'FALSE']]
        }
      });
  
      console.log(`Attendance updated for ${phoneNumber} in row ${rowIndex + 1}`);
    } catch (error) {
      console.error('Error updating attendance:', error);
    }
  }

  async loadSentReminders() {
    try {
      const data = await fs.promises.readFile(this.remindersFile, 'utf8');
      this.sentReminders = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('Reminders file not found, starting with empty reminders');
        this.sentReminders = {};
      } else {
        console.error('Error loading reminders:', error);
      }
    }
  }
  
  async saveSentReminders() {
    try {
      await fs.promises.writeFile(this.remindersFile, JSON.stringify(this.sentReminders, null, 2));
    } catch (error) {
      console.error('Error saving reminders:', error);
    }
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
          currentDateMalay = 'Ahad';
          break;
        case 'TUESDAY':
          currentDateMalay = 'Isnin';
          break;
        case 'WEDNESDAY':
          currentDateMalay = 'Selasa';
          break;
        case 'THURSDAY':
          currentDateMalay = 'Rabu';
          break;
        case 'FRIDAY':
          currentDateMalay = 'Khamis';
          break;
        case 'SATURDAY':
          currentDateMalay = 'Jumaat';
          break;
        case 'SUNDAY':
          currentDateMalay = 'Sabtu';
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
            const customerName = rows[j][dayIndex];
            const customerPhone = rows[j][dayIndex + 1];
            const teacherName = rows[j][dayIndex + 2];
            const phoneNumber = rows[j][dayIndex + 3];

            console.log(`  Teacher: ${teacherName}, Phone: ${phoneNumber}`);

            if (teacherName && phoneNumber) {
              const reminderKey = `${teacherName}-${phoneNumber}-${startTime}-${moment().format('YYYY-MM-DD')}`;

              if (!this.sentReminders[reminderKey]) {
                console.log(`  Sending reminder...`);
                if(customerName && customerPhone){
            //      await this.sendReminderToTeacher(teacherName, phoneNumber, customerName, j);
                  await this.sendReminderToCustomer(customerName, customerPhone, teacherName, j);
                  this.sentReminders[reminderKey] = Date.now();
                  await this.saveSentReminders();
                } else{
                  console.log(`  Missing customer name or phone number, skipping customer reminder`);
                }
              } else {
                console.log(`  Reminder already sent for ${teacherName} at ${startTime}`);
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

  async getContactDataFromDatabaseByPhone(phoneNumber, idSubstring) {
    try {
        // Check if phoneNumber is defined
        if (!phoneNumber) {
            throw new Error("Phone number is undefined or null");
        }
  
        // Initial fetch of config
        //await fetchConfigFromDatabase(idSubstring);
  
        let threadID;
        let contactName;
        let bot_status;
        const contactsRef = db.collection('companies').doc(idSubstring).collection('contacts');
        const querySnapshot = await contactsRef.where('phone', '==', phoneNumber).get();
  
        if (querySnapshot.empty) {
            console.log('No matching documents.');
            return null;
        } else {
            const doc = querySnapshot.docs[0];
            const contactData = doc.data();
            
            return { ...contactData};
        }
    } catch (error) {
        console.error('Error fetching or updating document:', error);
        throw error;
    }
  }

  async createThread() {
    console.log('Creating a new thread...');
    const thread = await openai.beta.threads.create();
    return thread;
}

  async sendReminderToTeacher(teacherName, phoneNumber, customerName, rowNumber) {
    const message = `Assalamualaikum ${teacherName}, 
    
    \nKelas anda bersama ${customerName} akan bermula dalam sebentar lagi. 

    \nSila ingatkan ${customerName} untuk mengesahkan kehadiran anda.`;
  
    const botData = this.botMap.get(this.botName);
    if (!botData || !botData[0].client) {
      console.log(`WhatsApp client not found for bot ${this.botName}`);
      return;
    }
    const client = botData[0].client;
    const extractedNumber = '+'+phoneNumber.split('@')[0];
    let contactID;
    let contactName;
    let threadID;
    let stopTag;
    let unreadCount;
    try {
      const contactData = await this.getContactDataFromDatabaseByPhone(extractedNumber, this.botName);
      if (contactData !== null) {
        stopTag = contactData.tags;
        console.log(stopTag);
        unreadCount = contactData.unreadCount ?? 0;
        contactID = extractedNumber;
        contactName = contactData.contactName ?? teacherName ?? extractedNumber;
        
        if (contactData.threadid) {
          threadID = contactData.threadid;
        } else {
          const thread = await this.createThread();
          threadID = thread.id;
          await this.saveThreadIDFirebase(contactID, threadID, this.botName);
        }
      } else {
        await this.customWait(2500); 
  
        contactID = extractedNumber;
        contactName = teacherName || extractedNumber;
        
        const thread = await this.createThread();
        threadID = thread.id;
        console.log(threadID);
        await this.saveThreadIDFirebase(contactID, threadID, this.botName);
        console.log('sent new contact to create new contact');
      }
      
      let firebaseTags = ['']
      if (contactData) {
        firebaseTags = contactData.tags ?? [];
        // Remove 'snooze' tag if present
        if(firebaseTags.includes('snooze')){
          firebaseTags = firebaseTags.filter(tag => tag !== 'snooze');
        }
      }
  
      const sentMessage = await client.sendMessage(`${phoneNumber}@c.us`, message);
      await this.addMessagetoFirebase(sentMessage, this.botName, extractedNumber);
      console.log(`Reminder sent to ${teacherName} (${phoneNumber})`);
  
      const data = {
        additionalEmails: [],
        address1: null,
        assignedTo: null,
        businessId: null,
        phone: extractedNumber,
        tags: firebaseTags,
        chat: {
          contact_id: extractedNumber,
          id: sentMessage.from,
          name: contactName,
          not_spam: true,
          tags: firebaseTags,
          timestamp: sentMessage.timestamp || Date.now(),
          type: 'contact',
          unreadCount: 0,
          last_message: {
            chat_id: sentMessage.from,
            from: sentMessage.from,
            from_me: true,
            id: sentMessage.id._serialized,
            source: "WhatsApp",
            status: "sent",
            text: {
              body: message
            },
            timestamp: sentMessage.timestamp || Date.now(),
            type: 'chat',
          },
        },
        chat_id: sentMessage.from,
        city: null,
        companyName: null,
        contactName: contactName,
        unreadCount: unreadCount + 1,
        threadid: threadID ?? "",
        phoneIndex: 0,  // Assuming this is the default value
        last_message: {
          chat_id: sentMessage.from,
          from: sentMessage.from,
          from_me: true,
          id: sentMessage.id._serialized,
          source: "WhatsApp",
          status: "sent",
          text: {
            body: message
          },
          timestamp: sentMessage.timestamp || Date.now(),
          type: 'chat',
        },
      };
  
      if (!contactData) {
        data.createdAt = admin.firestore.Timestamp.now();
      }
  
      let profilePicUrl = "";
      if (client.getProfilePicUrl) {
        try {
          profilePicUrl = await client.getProfilePicUrl(`${phoneNumber}@c.us`) || "";
        } catch (error) {
          console.error(`Error getting profile picture URL for ${phoneNumber}:`, error);
        }
      }
      data.profilePicUrl = profilePicUrl;
  
      // Update or create contact in Firebase
      const contactRef = db.collection('companies').doc(this.botName).collection('contacts').doc(extractedNumber);
      await contactRef.set(data, { merge: true });
  
      console.log(`Contact data updated for ${teacherName} (${phoneNumber})`);
  
    } catch (error) {
      console.error(`Error sending reminder to ${teacherName} (${phoneNumber}):`, error);
    }
  }

  async customWait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
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

  async sendWeeklyReport() {
    try {
      console.log('Preparing weekly report...');

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: this.range,
      });

      const rows = response.data.values;
      if (!rows || rows.length === 0) {
        console.log('No data found in the spreadsheet.');
        return;
      }

      const totalHours = rows[0][2]
      const mondayHours = rows[0][7]
      const mondayAttendance = rows[1][8]
      const tuesdayHours = rows[0][14]
      const tuesdayAttendance = rows[1][15]
      const wednesdayHours = rows[0][21]
      const wednesdayAttendance = rows[1][22]
      const thursdayHours = rows[0][28]
      const thursdayAttendance = rows[1][29]
      const fridayHours = rows[0][35]
      const fridayAttendance = rows[1][36]
      const saturdayHours = rows[0][42]
      const saturdayAttendance = rows[1][43]
      const sundayHours = rows[0][49]
      const sundayAttendance = rows[1][50]

      const reportMessage = `Weekly Class Report:

    Total Hours: ${totalHours}

    Monday:    ${mondayHours} hours (${mondayAttendance})
    Tuesday:   ${tuesdayHours} hours (${tuesdayAttendance})
    Wednesday: ${wednesdayHours} hours (${wednesdayAttendance})
    Thursday:  ${thursdayHours} hours (${thursdayAttendance})
    Friday:    ${fridayHours} hours (${fridayAttendance})
    Saturday:  ${saturdayHours} hours (${saturdayAttendance})
    Sunday:    ${sundayHours} hours (${sundayAttendance})

    Thank you for your dedication to teaching this week!`;

      await this.sendMessage('BHQ x Juta', '120363225984522400', reportMessage);
      console.log('Weekly report sent successfully');

    } catch (error) {
      console.error('Error sending weekly report:', error);
    }
}


  async sendReminderToCustomer(customerName, phoneNumber, teacherName, rowNumber) {
    const message = `Assalamualaikum ${customerName}, 
    
    \nKelas bersama Guru : ${teacherName} berjalan semalam. 

    \nSila sahkan kehadiran kelas tersebut dengan membalas 'Ya'`;

    const botData = this.botMap.get(this.botName);
    if (!botData || !botData[0].client) {
      console.log(`WhatsApp client not found for bot ${this.botName}`);
      return;
    }
    const client = botData[0].client;
    const extractedNumber = '+'+phoneNumber.split('@')[0];
    let contactID;
    let contactName;
    let threadID;
    let stopTag;
    let unreadCount;
    try {
      const contactData = await this.getContactDataFromDatabaseByPhone(extractedNumber, this.botName);
      if (contactData !== null) {
        stopTag = contactData.tags;
        console.log(stopTag);
        unreadCount = contactData.unreadCount ?? 0;
        contactID = extractedNumber;
        contactName = contactData.contactName ?? teacherName ?? extractedNumber;
        
        if (contactData.threadid) {
          threadID = contactData.threadid;
        } else {
          const thread = await this.createThread();
          threadID = thread.id;
          await this.saveThreadIDFirebase(contactID, threadID, this.botName);
        }
      } else {
        await this.customWait(2500); 
  
        contactID = extractedNumber;
        contactName = teacherName || extractedNumber;
        
        const thread = await this.createThread();
        threadID = thread.id;
        console.log(threadID);
        await this.saveThreadIDFirebase(contactID, threadID, this.botName);
        console.log('sent new contact to create new contact');
      }
      
      let firebaseTags = ['']
      if (contactData) {
        firebaseTags = contactData.tags ?? [];
        // Remove 'snooze' tag if present
        if(firebaseTags.includes('snooze')){
          firebaseTags = firebaseTags.filter(tag => tag !== 'snooze');
        }
      }
  
      const sentMessage = await client.sendMessage(`${phoneNumber}@c.us`, message);
      await this.addMessagetoFirebase(sentMessage, this.botName, extractedNumber);
      console.log(`Reminder sent to ${teacherName} (${phoneNumber})`);
  
      const data = {
        additionalEmails: [],
        address1: null,
        assignedTo: null,
        businessId: null,
        phone: extractedNumber,
        tags: firebaseTags,
        chat: {
          contact_id: extractedNumber,
          id: sentMessage.from,
          name: contactName,
          not_spam: true,
          tags: firebaseTags,
          timestamp: sentMessage.timestamp || Date.now(),
          type: 'contact',
          unreadCount: 0,
          last_message: {
            chat_id: sentMessage.from,
            from: sentMessage.from,
            from_me: true,
            id: sentMessage.id._serialized,
            source: "WhatsApp",
            status: "sent",
            text: {
              body: message
            },
            timestamp: sentMessage.timestamp || Date.now(),
            type: 'chat',
          },
        },
        chat_id: sentMessage.from,
        city: null,
        companyName: null,
        contactName: contactName,
        unreadCount: unreadCount + 1,
        threadid: threadID ?? "",
        phoneIndex: 0,  // Assuming this is the default value
        last_message: {
          chat_id: sentMessage.from,
          from: sentMessage.from,
          from_me: true,
          id: sentMessage.id._serialized,
          source: "WhatsApp",
          status: "sent",
          text: {
            body: message
          },
          timestamp: sentMessage.timestamp || Date.now(),
          type: 'chat',
        },
        row: rowNumber + 1, // Add the row number to the data structure
        customer: true,
      };
  
      if (!contactData) {
        data.createdAt = admin.firestore.Timestamp.now();
      }
  
      let profilePicUrl = "";
      if (client.getProfilePicUrl) {
        try {
          profilePicUrl = await client.getProfilePicUrl(`${phoneNumber}@c.us`) || "";
        } catch (error) {
          console.error(`Error getting profile picture URL for ${phoneNumber}:`, error);
        }
      }
      data.profilePicUrl = profilePicUrl;
  
      // Update or create contact in Firebase
      const contactRef = db.collection('companies').doc(this.botName).collection('contacts').doc(extractedNumber);
      await contactRef.set(data, { merge: true });
  
      console.log(`Contact data updated for ${teacherName} (${phoneNumber})`);
  
    } catch (error) {
      console.error(`Error sending reminder to ${teacherName} (${phoneNumber}):`, error);
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

    this.weeklyReportSchedule = cron.schedule('0 23 * * 0', () => {
      this.sendWeeklyReport();
    }, {
      timezone: "Asia/Kuala_Lumpur" // Adjust this to your local timezone
    });

    // Clear old reminders once a day
    cron.schedule('0 0 * * *', async () => {
      console.log('Clearing old sent reminders');
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      for (const [key, timestamp] of Object.entries(this.sentReminders)) {
        if (timestamp < oneDayAgo) {
          delete this.sentReminders[key];
        }
      }
      await this.saveSentReminders();
    });
  }
}

module.exports = bhqSpreadsheet;