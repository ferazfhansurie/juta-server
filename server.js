require('dotenv').config();
const { Client, LocalAuth, RemoteAuth} = require('whatsapp-web.js');
const { Queue, Worker, QueueScheduler} = require('bullmq');
const Redis = require('ioredis');
const { google } = require('googleapis');
const cron = require('node-cron');
//const qrcode = require('qrcode-terminal');
const FirebaseWWebJS = require('./firebaseWweb.js');
const qrcode = require('qrcode');
const express = require('express');
const bodyParser = require('body-parser');
const csv = require('csv-parser');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const admin = require('./firebase.js');
const axios = require('axios');
const WebSocket = require('ws');
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
const db = admin.firestore();
const OpenAI = require('openai');
const { MessageMedia } = require('whatsapp-web.js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const util = require('util');  // We'll use this to promisify fs functions
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline)
const url = require('url');
const botMap = new Map();
// Redis connection
const connection = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {
  maxRetriesPerRequest: null,
  maxmemoryPolicy: 'noeviction'
});

require('events').EventEmitter.prototype._maxListeners = 70;
require('events').defaultMaxListeners = 70;

// Initialize the Google Sheets API
const auth = new google.auth.GoogleAuth({
  keyFile: 'service_account.json', // Replace with the path to your Google API credentials file
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });


// Promisify the fs.readFile and fs.writeFile functions
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile);

//Save last processed row
const LAST_PROCESSED_ROW_FILE = 'last_processed_row.json';

// Create a queue
const messageQueue = new Queue('scheduled-messages', { connection });

// Ensure this directory exists in your project
const MEDIA_DIR = path.join(__dirname, 'public', 'media');

// Function to save media locally
async function saveMediaLocally(base64Data, mimeType, filename) {
  const writeFileAsync = util.promisify(fs.writeFile);
  const buffer = Buffer.from(base64Data, 'base64');
  const uniqueFilename = `${uuidv4()}_${filename}`;
  const filePath = path.join(MEDIA_DIR, uniqueFilename);
  
  await writeFileAsync(filePath, buffer);

  // Return the URL path to access this filez
  return `/media/${uniqueFilename}`;
}


wss.on('connection', (ws,req) => {
    console.log('Client connected');
    const{pathname} = url.parse(req.url);
    const [,,email,companyId] = pathname.split('/');
    ws.companyId = companyId;
    console.log('client connected:'+ws.companyId);
    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
  const openai = new OpenAI({
    apiKey: process.env.OPENAIKEY,
});
  
  
function broadcastProgress(botName, action, progress, phoneIndex) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.companyId === botName) {
      client.send(JSON.stringify({
        type: 'progress',
        botName,
        action,
        progress,
        phoneIndex
      }));
    }
  });
}

  const botStatusMap = new Map();
  function broadcastAuthStatus(botName, status, qrCode = null, i = 1) {

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.companyId === botName) {
        console.log('sent to clinet');
        client.send(JSON.stringify({ 
          type: 'auth_status', 
          botName, 
          status,
          qrCode: status === 'qr' ? qrCode : null, // Include qrCode only when status is 'qr'
          phoneIndex: i
        }));
      }
    });
    botStatusMap.set(botName,status);
  }
  




const { handleNewMessagesGL } = require('./bots/handleMessagesGL.js');
const { handleNewMessagesArul } = require('./bots/handleMessagesArul.js');
const { handleNewMessages } = require('./bots/handleMessages.js');
const { handleNewMessagesJuta } = require('./bots/handleMessagesJuta.js');
const { handleNewMessagesCallabio } = require('./bots/handleMessagesCallabio.js');
const { handleNewMessagesAQ } = require('./bots/handleMessagesAQ.js');
const { handleNewMessagesTIC } = require('./bots/handleMessagesTIC.js');
const { handleNewMessagesDemo } = require('./bots/handleMessagesDemo.js');
const { handleNewMessagesMadre } = require('./bots/handleMessagesMadre.js');
const { handleNewMessagesBeverly } = require('./bots/handleMessagesBeverly.js');
const { handleNewEnquriryFormBeverly } = require('./bots/handleMessagesBeverly.js');
const { handleNewMessagesSunz } = require('./bots/handleMessagesSunz.js');
const { handleNewMessagesBHQ } = require('./bots/handleMessagesBHQ.js');
const { handleNewMessagesTasty} = require('./bots/handleMessagesTasty.js');
const { handleNewMessagesTastyPuga} = require('./bots/handleMessagesPugaTasty.js');
const { handleNewMessagesBillert} = require('./bots/handleMessagesBillert.js');
const { handleNewMessagesCNB} = require('./bots/handleMessagesCNB.js');
const { handleNewMessagesMSU} = require('./bots/handleMessagesMSU.js');
const { handleNewMessagesApel } = require('./bots/handleMessagesApel.js');
const { handleNewMessagesTemplate } = require('./bots/handleMessagesTemplate.js');
const { handleNewMessagesTemplateWweb } = require('./bots/handleMessagesTemplateWweb.js');
const { handleNewMessagesZahinTravel } = require('./bots/handleMessagesZahinTravel.js');
const { handleNewMessagesJuta2 } = require('./bots/handleMessagesJuta2.js');
const { handleNewMessagesTest } = require('./bots/handleMessagesTest.js');
const { handleNewMessagesFirstPrint } = require('./bots/handleMessagesFirstPrint.js');
const { handleNewMessagesExtremeFitness} = require('./bots/handleMessagesExtremeFitness.js');
const { handleExtremeFitnessBlast } = require('./blast/extremeFitnessBlast.js');
const { handleHajoonCreateContact } = require('./blast/hajoonCreateContact.js');
const { handleJutaCreateContact } = require('./blast/jutaCreateContact.js');
const { handleNewMessagesVista } = require('./bots/handleMessagesVista.js');
const { handleNewMessagesHappyProjects } = require('./bots/handleMessagesHappyProjects.js');
const { handleNewMessagesBINA } = require('./bots/handleMessagesBINA.js');
const { handleBinaTag } = require('./blast/binaTag.js');
const { handleNewMessagesMaha } = require('./bots/handleMessagesMaha.js');
const { handleNewMessagesMuhibbah } = require('./bots/handleMessagesMuhibbah.js');



app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());// Middleware
// Serve static files from the 'public' directory
app.use(express.static('public'));
app.get('/', function (req, res) {
    res.send('Bot is running');
});
app.use(cors());
app.post('/juta/hook/messages', handleNewMessagesJuta);
app.post('/arul/hook/messages', handleNewMessagesArul);
app.post('/aq/hook/messages', handleNewMessagesAQ);
app.post('/tic/hook/messages', handleNewMessagesTIC);
app.post('/tasty/hook/messages', handleNewMessagesTasty);
app.post('/tasty-puga/hook', handleNewMessagesTastyPuga);
app.post('/gl/hook', handleNewMessagesGL);
app.post('/gl',handleNewMessages)
app.post('/demo/hook/messages', handleNewMessagesDemo);
app.post('/callabios/hook/messages', handleNewMessagesCallabio);
app.post('/madre/hook/messages', handleNewMessagesMadre);
app.post('/beverly/hook/messages', handleNewMessagesBeverly);
app.post('/beverly/enquriry', handleNewEnquriryFormBeverly);
app.post('/sunz/hook/messages', handleNewMessagesSunz);
app.post('/bhq/hook/messages', handleNewMessagesBHQ);
app.post('/msu/hook/messages', handleNewMessagesMSU);
app.post('/apel/hook/messages', handleNewMessagesApel);
app.post('/:companyID/template/hook/messages', handleNewMessagesTemplate);
  
//webhooks/blast
app.post('/extremefitness/blast', async (req, res) => {
  const botData = botMap.get('074');

  if (!botData) {
      return res.status(404).json({ error: 'WhatsApp client not found for this company' });
  }

  const client = botData[0].client;
  await handleExtremeFitnessBlast(req, res, client);
});
app.post('/hajoon/blast', async (req, res) => {
   const botData = botMap.get('045');

  if (!botData) {
      return res.status(404).json({ error: 'WhatsApp client not found for this company' });
  }

  const client = botData[0].client;
  await handleHajoonCreateContact(req, res, client);
});
app.post('/juta/blast', async (req, res) => {
 const botData = botMap.get('001');

 if (!botData) {
     return res.status(404).json({ error: 'WhatsApp client not found for this company' });
 }

 const client = botData[0].client;
 await handleJutaCreateContact(req, res,client);
});
app.post('/api/bina/tag', async (req, res) => {
  await handleBinaTag(req, res);
});

//spreadsheet
const msuSpreadsheet = require('./spreadsheet/msuspreadsheet.js');

// const applyRadarSpreadsheetLPUniten = require('./spreadsheet/applyradarspreadsheet(LP - UNITEN).js');
// const applyRadarSpreadsheetLPUnitenPK = require('./spreadsheet/applyradarspreadsheet(LP - UNITEN PK).js');
// const applyRadarSpreadsheetLPMMUPK = require('./spreadsheet/applyradarspreadsheet(LP - MMU PK).js');
// const applyRadarSpreadsheetLPAPUPK = require('./spreadsheet/applyradarspreadsheet(LP - APU PK).js');
const msuSpreadsheetPartTime = require('./spreadsheet/msuspreadsheet(PartTime).js');
// const msuSpreadsheetApel = require('./spreadsheet/msuspreadsheet(Apel).js');
const msuSpreadsheetCOL = require('./spreadsheet/msuspreadsheet(COL).js');
const msuSpreadsheetLeads = require('./spreadsheet/msuspreadsheet(Leads).js');
const bhqSpreadsheet = require('./spreadsheet/bhqspreadsheet.js');




//custom bots
const customHandlers = {
  '001': handleNewMessagesJuta2,
  '002': handleNewMessagesBINA,
  '003': handleNewMessagesVista,
  '020': handleNewMessagesCNB,
  '042': handleNewMessagesZahinTravel,
  '044': handleNewMessagesApel,
  '057': handleNewMessagesTest,
  '059': handleNewMessagesFirstPrint,
  '066': handleNewMessagesMSU,
  '063': handleNewMessagesHappyProjects,
  '072': handleNewMessagesBillert,
  '074': handleNewMessagesExtremeFitness,
  '075': handleNewMessagesBHQ,
  '080': handleNewMessagesMaha,
  '067': handleNewMessagesMuhibbah,

};



const port = process.env.PORT;
server.listen(port, function () {
    console.log(`Server is running on port ${port}`);
});

async function createUserInFirebase(userData) {
    try {
      const userRecord = await admin.auth().createUser(userData);
  
      return userRecord.uid;
    } catch (error) {

      throw error;
    }
  }
  app.get('/api/facebook-lead-webhook', (req, res) => {
    const VERIFY_TOKEN = 'test'; // Use the token you entered in the Facebook dashboard
  
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode && token) {
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('Webhook verified');
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    } else {
      res.sendStatus(404);
    }
  });
  app.put('/api/update-user', async (req, res) => {
    try {
        const { uid, email, phoneNumber, password, displayName } = req.body;
    const user =await admin.auth().getUserByEmail(uid);
        if (!uid) {
            return res.status(400).json({ error: 'UID is required' });
        }

        // Call the function to update the user
       
        await admin.auth().updateUser(user.uid,  {
            email: email,
            phoneNumber: phoneNumber,
            password:password,
            displayName:displayName,
          });

        // Send success response
        res.json({ message: 'User updated successfully' });
    } catch (error) {
         // Handle other errors
         console.error('Error updating user:', error);
         res.status(500).json({ error: 'Failed to update user' });
    }
}); 
  app.post('/api/create-user/:email/:phoneNumber/:password', async (req, res) => {
    try {
      // Extract user data from URL parameters
      const userData = {
        email: req.params.email,
        phoneNumber: req.params.phoneNumber,
        password: req.params.password,
      };
  
      // Call the function to create a user
      const uid = await createUserInFirebase(userData);
  
      // Send success response
      res.json({ message: 'User created successfully', uid });
    } catch (error) {
      // Handle errors
      console.error('Error creating user:', error);
      
      res.status(500).json({ error: error.code});
    }
  });

  app.post('/api/import-csv/:companyId', async (req, res) => {
    const { companyId } = req.params;
    const { csvUrl, tags } = req.body;
  
    if (!csvUrl) {
      return res.status(400).json({ error: 'CSV URL is required' });
    }
  
    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'Tags must be an array' });
    }
  
    try {
      const tempFile = `temp_${Date.now()}.csv`;
      await downloadCSV(csvUrl, tempFile);
      await processCSV(tempFile, companyId, tags);
      fs.unlinkSync(tempFile); // Clean up temporary file
      res.json({ message: 'CSV processed successfully' });
    } catch (error) {
      console.error('Error processing CSV:', error);
      res.status(500).json({ error: 'Failed to process CSV' });
    }
  });

  async function downloadCSV(url, filename) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unexpected response ${response.statusText}`);
    await pipeline(response.body, fs.createWriteStream(filename));
  }

  // Update the processCSV function to accept tags
  async function processCSV(filename, companyId, tags) {
    return new Promise((resolve, reject) => {
      fs.createReadStream(filename)
        .pipe(csv())
        .on('data', async (row) => {
          try {
            await processContact(row, companyId, tags);
          } catch (error) {
            console.error('Error processing row:', error);
            // Continue processing other rows
          }
        })
        .on('end', () => {
          console.log('CSV file successfully processed');
          resolve();
        })
        .on('error', reject);
    });
  }

  // Update the processContact function to use the provided tags
  async function processContact(row, companyId, tags) {
    let name = row.Name;
    
    let phone = await formatPhoneNumber(row.Phone);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth()-6);
    const sixMonthsAgoTimeStamp = sixMonthsAgo.getTime();
    if (!name) {
      name = phone;
      console.log("Saving contact with no name and phone ", phone)
    }else{
      console.log("Saving contact with name ", name, " and phone ", phone)
    }
    let phoneWithPlus;
    if(phone.startsWith('+')){
      phoneWithPlus = phone;
    }else{
      phoneWithPlus = '+' + phone;
    }
    
    const phoneWithoutPlus = phone.replace('+', '');
    if (phone) {
      const contactRef = db.collection('companies').doc(companyId).collection('contacts').doc(phoneWithPlus);
      const doc = await contactRef.get();

      if (doc.exists) {
        // Contact already exists, add new tags
        await contactRef.update({
          tags: admin.firestore.FieldValue.arrayUnion(...tags)
        });
        console.log(`Updated existing contact with new tags: ${name} - ${phone}`);
        } else {
          // Contact doesn't exist, create new contact with provided tags
          const contactData = {
            additionalEmails: [],
            address1: null,
            assignedTo: null,
            businessId: null,
            phone: phoneWithPlus,
            tags: tags,
            chat: {
              contact_id: phoneWithoutPlus,
              id: phoneWithoutPlus + '@c.us',
              name: name,
              not_spam: true,
              tags: tags,
              timestamp: 1708858609,
              type: 'contact',
              unreadCount: 0,
              last_message: null,
            },
            chat_id: phoneWithoutPlus + '@c.us',
        city: null,
        phoneIndex: 0,
        companyName: null,
        contactName: name,
        threadid: '',
        last_message: null,
      };

      if (companyId == '079') {
        contactData.branch = row['BRANCH NAME'] || '-';
        contactData.address1 = row['ADDRESS'] || '-';
        contactData.expiryDate = row['PERIOD OF COVER'] || '-';
        contactData.email = row['EMAIL'] || '-';
        contactData.vehicleNumber = row['VEH. NO'] || '-';
        contactData.ic = row['IC/PASSPORT/BUSINESS REG. NO'] || '-';
      }

      await contactRef.set(contactData);
      console.log(`Added new contact: ${name} - ${phone}`);
    }
  } else {
    console.warn(`Skipping invalid phone number for ${name}`);
  }
}


  function formatPhoneNumber(phone) {
    // Remove all non-numeric characters
    phone = phone.replace(/\D/g, '');
    
    // Ensure the number starts with '6'
    if (!phone.startsWith('6')) {
      phone = '6' + phone;
    }
    
    console.log(phone)
    
    return phone;
  }

  app.post('/api/schedule-message/:companyId', async (req, res) => {
    const { companyId } = req.params;
    const scheduledMessage = req.body;
  
    try {
      // Add createdAt timestamp
      scheduledMessage.createdAt = admin.firestore.Timestamp.now();
      scheduledMessage.scheduledTime = new admin.firestore.Timestamp(
        scheduledMessage.scheduledTime.seconds,
        scheduledMessage.scheduledTime.nanoseconds
      );
  
      // Generate a unique ID for the message
      const messageId = uuidv4();
  
      // Calculate the number of batches
      const totalMessages = scheduledMessage.messages.length;
      const batchSize = scheduledMessage.batchQuantity || totalMessages;
      const numberOfBatches = Math.ceil(totalMessages / batchSize);
  
      // Create batches and save them to Firebase
      const batchesRef = db.collection('companies').doc(companyId).collection('scheduledMessages').doc(messageId).collection('batches');
      const batches = [];
  
      for (let batchIndex = 0; batchIndex < numberOfBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min((batchIndex + 1) * batchSize, totalMessages);
        const batchMessages = scheduledMessage.messages.slice(startIndex, endIndex);
  
        const batchDelay = batchIndex * scheduledMessage.repeatInterval * getMillisecondsForUnit(scheduledMessage.repeatUnit);
        const batchScheduledTime = new Date(scheduledMessage.scheduledTime.toDate().getTime() + batchDelay);
  
        const batchData = {
          ...scheduledMessage,
          messages: batchMessages,
          batchIndex,
          batchScheduledTime: admin.firestore.Timestamp.fromDate(batchScheduledTime)
        };
  
        // Remove the original 'messages' array from the main scheduledMessage object
        delete batchData.chatIds;
  
        const batchId = `${messageId}_batch_${batchIndex}`;
        await batchesRef.doc(batchId).set(batchData);
        batches.push({ id: batchId, scheduledTime: batchScheduledTime });
      }
  
      // Save the main scheduled message document
      const mainMessageData = {
        ...scheduledMessage,
        numberOfBatches,
        status: 'scheduled'
      };
      await db.collection('companies').doc(companyId).collection('scheduledMessages').doc(messageId).set(mainMessageData);
  
      // Schedule all batches in the queue
      for (const batch of batches) {
        const delay = Math.max(batch.scheduledTime.getTime() - Date.now(), 0);
        await messageQueue.add('send-message-batch', 
          { 
            companyId,
            messageId,
            batchId: batch.id
          }, 
          { 
            removeOnComplete: false,
            removeOnFail: false,
            delay,
            jobId: batch.id
          }
        );
      }
  
      res.status(201).json({ id: messageId, message: 'Message scheduled successfully' });
    } catch (error) {
      console.error('Error scheduling message:', error);
      res.status(500).json({ error: 'Failed to schedule message' });
    }
  });

  app.put('/api/schedule-message/:companyId/:messageId', async (req, res) => {
    const { companyId, messageId } = req.params;
    const updatedMessage = req.body;
    
    console.log('Received update request for message:', messageId);
    console.log('Updated message data:', JSON.stringify(updatedMessage, null, 2));

    try {
      // 1. Delete the existing messages from the queue
      const jobs = await messageQueue.getJobs(['active', 'waiting', 'delayed', 'paused']);
      for (const job of jobs) {
        if (job.id.startsWith(messageId)) {
          await job.remove();
        }
      }
  
      // 2. Remove the message and its batches from Firebase
      const messageRef = db.collection('companies').doc(companyId).collection('scheduledMessages').doc(messageId);
      const batchesRef = messageRef.collection('batches');
      const batchesSnapshot = await batchesRef.get();
      const batch = db.batch();
      batchesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      batch.delete(messageRef);
      await batch.commit();
  
      // 3. Add the new message to Firebase
      updatedMessage.createdAt = admin.firestore.Timestamp.now();
      updatedMessage.scheduledTime = new admin.firestore.Timestamp(
        updatedMessage.scheduledTime.seconds,
        updatedMessage.scheduledTime.nanoseconds
      );
  
      // Set default status to 'scheduled' if not provided
      updatedMessage.status = updatedMessage.status || 'scheduled';
  
      // Calculate the number of batches
      const totalMessages = updatedMessage.messages.length;
      const batchSize = updatedMessage.batchQuantity || totalMessages;
      const numberOfBatches = Math.ceil(totalMessages / batchSize);
  
      // Create batches and save them to Firebase
      const batches = [];
      for (let batchIndex = 0; batchIndex < numberOfBatches; batchIndex++) {
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min((batchIndex + 1) * batchSize, totalMessages);
        const batchMessages = updatedMessage.messages.slice(startIndex, endIndex);
  
        const batchDelay = batchIndex * updatedMessage.repeatInterval * getMillisecondsForUnit(updatedMessage.repeatUnit);
        const batchScheduledTime = new Date(updatedMessage.scheduledTime.toDate().getTime() + batchDelay);
  
        const batchData = {
          ...updatedMessage,
          messages: batchMessages,
          batchIndex,
          batchScheduledTime: admin.firestore.Timestamp.fromDate(batchScheduledTime)
        };
  
        // Remove the original 'messages' array from the batch data
        delete batchData.chatIds;
  
        const batchId = `${messageId}_batch_${batchIndex}`;
        await batchesRef.doc(batchId).set(batchData);
        batches.push({ id: batchId, scheduledTime: batchScheduledTime });
      }
  
      // Save the main scheduled message document
      const mainMessageData = {
        ...updatedMessage,
        numberOfBatches
      };
      delete mainMessageData.messages; // Remove the messages array from the main document
      await messageRef.set(mainMessageData);
  
      // 4. Add the new batches to the queue only if status is 'scheduled'
      if (updatedMessage.status === 'scheduled') {
        for (const batch of batches) {
          const delay = Math.max(batch.scheduledTime.getTime() - Date.now(), 0);
          await messageQueue.add('send-message-batch', 
            { 
              companyId,
              messageId,
              batchId: batch.id
            }, 
            { 
              removeOnComplete: false,
              removeOnFail: false,
              delay,
              jobId: batch.id
            }
          );
        }
      }
  
      res.json({ message: 'Scheduled message updated successfully', id: messageId });
    } catch (error) {
      console.error('Error updating scheduled message:', error);
      res.status(500).json({ error: 'Failed to update scheduled message' });
    }
  });

  app.delete('/api/schedule-message/:companyId/:messageId', async (req, res) => {
    const { companyId, messageId } = req.params;
  
    try {
      console.log(`Attempting to delete scheduled message: ${messageId} for company: ${companyId}`);
  
      // 1. Remove the message and its batches from Firebase
      const messageRef = db.collection('companies').doc(companyId).collection('scheduledMessages').doc(messageId);
      const batchesRef = messageRef.collection('batches');
      
      // Check if the message exists
      const messageDoc = await messageRef.get();
      if (!messageDoc.exists) {
        return res.status(404).json({ error: 'Scheduled message not found' });
      }
  
      // Delete batches
      const batchesSnapshot = await batchesRef.get();
      const batch = db.batch();
      batchesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      batch.delete(messageRef);
      await batch.commit();
  
      // 2. Remove the jobs from the queue
      const jobs = await messageQueue.getJobs(['active', 'waiting', 'delayed', 'paused']);
      for (const job of jobs) {
        if (job.id.startsWith(messageId)) {
          await job.remove();
        }
      }
  
      console.log(`Successfully deleted scheduled message: ${messageId}`);
      res.json({ message: 'Scheduled message deleted successfully' });
    } catch (error) {
      console.error('Error deleting scheduled message:', error);
      res.status(500).json({ error: 'Failed to delete scheduled message' });
    }
  });
// New route for syncing contacts
app.post('/api/sync-contacts/:companyId', async (req, res) => {
  const { companyId } = req.params;
  const { phoneIndex } = req.body;
  
  try {
    const botData = botMap.get(companyId);
    if (!botData) {
      return res.status(404).json({ error: 'WhatsApp client not found for this company' });
    }

    let syncPromises = [];

    if (botData.length === 1) {
      const client = botData[0].client;
      if (!client) {
        return res.status(404).json({ error: 'WhatsApp client not found for this company' });
      }
      syncPromises.push(syncContacts(client, companyId, 0));
    } else if (phoneIndex !== undefined) {
      if (phoneIndex < 0 || phoneIndex >= botData.length) {
        return res.status(400).json({ error: 'Invalid phone index' });
      }
      const client = botData[phoneIndex].client;
      if (!client) {
        return res.status(404).json({ error: `WhatsApp client not found for phone index ${phoneIndex}` });
      }
      syncPromises.push(syncContacts(client, companyId, phoneIndex));
    } else {
      syncPromises = botData.map((data, index) => {
        if (data.client) {
          return syncContacts(data.client, companyId, index);
        }
      }).filter(Boolean);
    }

    if (syncPromises.length === 0) {
      return res.status(404).json({ error: 'No valid WhatsApp clients found for synchronization' });
    }

    // Start syncing process for all applicable clients
    syncPromises.forEach((promise, index) => {
      promise.then(() => {
        console.log(`Contact synchronization completed for company ${companyId}, phone ${index}`);
      }).catch(error => {
        console.error(`Error during contact sync for company ${companyId}, phone ${index}:`, error);
      });
    });
    
    res.json({ success: true, message: 'Contact synchronization started', phonesToSync: syncPromises.length });
  } catch (error) {
    console.error(`Error starting contact sync for ${companyId}:`, error);
    res.status(500).json({ error: 'Failed to start contact synchronization' });
  }
});

async function syncContacts(client, companyId, phoneIndex = 0) {
  try {
    const chats = await client.getChats();
    const totalChats = chats.length;
    let processedChats = 0;
    console.log(`Found ${totalChats} chats for company ${companyId}, phone ${phoneIndex}`);

    for (const chat of chats) {
      try {
        

        const contact = await chat.getContact();
        await saveContactWithRateLimit(companyId, contact, chat, phoneIndex);
        processedChats++;

        // Send progress update for this specific phone
        broadcastProgress(companyId, 'syncing_contacts', processedChats / totalChats, phoneIndex);

        // Log progress less frequently to reduce console clutter
        if (processedChats % 10 === 0 || processedChats === totalChats) {
          console.log(`Processed ${processedChats} out of ${totalChats} chats for company ${companyId}, phone ${phoneIndex}`);
        }

        // Add a small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (chatError) {
        console.error(`Error processing chat for company ${companyId}, phone ${phoneIndex}:`, chatError);
        // Continue with the next chat even if there's an error
      }
    }

    console.log(`Finished syncing contacts for company ${companyId}, phone ${phoneIndex}`);
    broadcastProgress(companyId, 'syncing_contacts', 1, phoneIndex); // 100% complete for this phone
  } catch (error) {
    console.error(`Error syncing contacts for company ${companyId}, phone ${phoneIndex}:`, error);
    broadcastProgress(companyId, 'syncing_contacts', -1, phoneIndex); // Indicate error for this phone
  }
}

  function getMillisecondsForUnit(unit) {
    switch(unit) {
      case 'minutes': return 60 * 1000;
      case 'hours': return 60 * 60 * 1000;
      case 'days': return 24 * 60 * 60 * 1000;
      default: return 0;
    }
  }

// Update the worker to process batch jobs
const worker = new Worker('scheduled-messages', async job => {
  if (job.name === 'send-message-batch') {
    const { companyId, messageId, batchId } = job.data;
    
    try {
      // Fetch the batch data from Firebase
      const batchRef = db.collection('companies').doc(companyId)
                         .collection('scheduledMessages').doc(messageId)
                         .collection('batches').doc(batchId);
      const batchSnapshot = await batchRef.get();
      
      if (!batchSnapshot.exists) {
        console.error(`Batch ${batchId} not found`);
        return;
      }

      const batchData = batchSnapshot.data();

      // Send messages for this batch
      await sendScheduledMessage(batchData);

      
      console.log(`Batch ${batchId} sent successfully`);

      // Update batch status
      await batchRef.update({ status: 'sent' });

      // Check if all batches are processed
      const batchesRef = db.collection('companies').doc(companyId)
                           .collection('scheduledMessages').doc(messageId)
                           .collection('batches');
      const batchesSnapshot = await batchesRef.get();
      const allBatchesSent = batchesSnapshot.docs.every(doc => doc.data().status === 'sent');

      if (allBatchesSent) {
        // Update main scheduled message status
        await db.collection('companies').doc(companyId)
                .collection('scheduledMessages').doc(messageId)
                .update({ status: 'completed' });
        console.log(`Scheduled message ${messageId} completed`);
      }

    } catch (error) {
      console.error('Error processing scheduled message batch:', error);
      throw error; // This will cause the job to be retried
    }
  }
}, { 
  connection,
  concurrency: 3,
  limiter: {
    max: 3,
    duration: 1000
  }
});

async function sendScheduledMessage(message) {
  console.log('Sending scheduled message:', message);
  
  if(message.v2 == true){
    for (const messageItem of message.messages) {
      const chatId = messageItem.chatId;
      const individualMessage = messageItem.message;
      
      if (message.mediaUrl != '') {
        await fetch(`https://mighty-dane-newly.ngrok-free.app/api/v2/messages/image/${message.companyId}/${chatId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: message.mediaUrl, caption: individualMessage })
        });
      } else if (message.documentUrl != '') {
        await fetch(`https://mighty-dane-newly.ngrok-free.app/api/v2/messages/document/${message.companyId}/${chatId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            documentUrl: message.documentUrl, 
            filename: message.fileName, 
            caption: individualMessage 
          })
        });
      } else if (individualMessage) {
        await fetch(`https://mighty-dane-newly.ngrok-free.app/api/v2/messages/text/${message.companyId}/${chatId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: individualMessage,
            phoneIndex: message.phoneIndex
           })
        });
      }
    }
  } else {
    for (const messageItem of message.messages) {
      const chatId = messageItem.chatId;
      const individualMessage = messageItem.message;
      
      if (message.mediaUrl != '') {
        await fetch(`https://mighty-dane-newly.ngrok-free.app/api/messages/image/${message.whapiToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: chatId, imageUrl: message.mediaUrl, caption: individualMessage })
        });
      } else if (message.documentUrl != '') {
        await fetch(`https://mighty-dane-newly.ngrok-free.app/api/messages/document/${message.whapiToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chatId: chatId,
            documentUrl: message.documentUrl, 
            filename: message.fileName, 
            caption: individualMessage 
          })
        });
      } else if (individualMessage) {
        await fetch(`https://mighty-dane-newly.ngrok-free.app/api/messages/text/${chatId}/${message.whapiToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: individualMessage })
        });
      }
    }
  }
}

// Modify the scheduleAllMessages function
async function obiliterateAllJobs() {
  // Clear all existing jobs from the queue
  await messageQueue.obliterate({ force: true });
  console.log("Queue cleared successfully");
  
}

// Modify the scheduleAllMessages function
async function scheduleAllMessages() {
  const companiesSnapshot = await db.collection('companies').get();

  for (const companyDoc of companiesSnapshot.docs) {
    const companyId = companyDoc.id;
    const scheduledMessagesSnapshot = await companyDoc.ref.collection('scheduledMessages').get();

    for (const messageDoc of scheduledMessagesSnapshot.docs) {
      const messageId = messageDoc.id;
      const message = messageDoc.data();

      if (message.status === 'completed') {
        continue; // Skip completed messages
      }

      const batchesSnapshot = await messageDoc.ref.collection('batches').get();

      for (const batchDoc of batchesSnapshot.docs) {
        const batchId = batchDoc.id;
        const batchData = batchDoc.data();

        if (batchData.status === 'sent') {
          continue; // Skip sent batches
        }

        const delay = batchData.batchScheduledTime.toDate().getTime() - Date.now();

        // Check if the job already exists in the queue
        const existingJob = await messageQueue.getJob(batchId);
        if (!existingJob) {
          await messageQueue.add('send-message-batch', 
            { 
              companyId,
              messageId,
              batchId
            }, 
            { 
              removeOnComplete: false,
              removeOnFail: false,
              delay: Math.max(delay, 0),
              jobId: batchId
            }
          );
        }
      }
    }
  }
}

  async function saveThreadIDFirebase(email, threadID,) {
    
    // Construct the Firestore document path
    const docPath = `user/${email}`;

    try {
        await db.doc(docPath).set({
            threadid: threadID
        }, { merge: true }); // merge: true ensures we don't overwrite the document, just update it
        console.log(`Thread ID saved to Firestore at ${docPath}`);
    } catch (error) {
        console.error('Error saving Thread ID to Firestore:', error);
    }
}

function setupMessageHandler(client, botName, phoneIndex) {
  client.on('message', async (msg) => {
      console.log(`DEBUG: Message received for bot ${botName}`);
      try {
          // Check if there's a custom handler for this bot
          if (customHandlers[botName]) {
              await customHandlers[botName](client, msg, botName, phoneIndex);
          } else {
              // Use the default template handler if no custom handler is defined
              await handleNewMessagesTemplateWweb(client, msg, botName, phoneIndex);
          }
      } catch (error) {
          console.error(`ERROR in message handling for bot ${botName}:`, error);
      }
  });
}

function setupMessageCreateHandler(client, botName, phoneIndex) {
  client.on('message_create', async (msg) => {
    console.log(`DEBUG: Message created for bot ${botName}`);
    try {
      // Check if the message is from the current user (sent from another device)
      if (msg.fromMe) {
        const extractedNumber = '+' + msg.to.split('@')[0];
        
        let existingContact = await getContactDataFromDatabaseByPhone(extractedNumber, botName);
        const contactRef = db.collection('companies').doc(botName).collection('contacts').doc(extractedNumber);

        if (!existingContact) {
          console.log('Creating new contact');
          const newContact = {
            additionalEmails: [],
            address1: null,
            assignedTo: null,
            businessId: null,
            chat: {
              contact_id: extractedNumber,
              id: msg.to,
              name: msg.to.split('@')[0],
              not_spam: true,
              tags: ['stop bot'],
              timestamp: Math.floor(Date.now() / 1000),
              type: 'contact',
              unreadCount: 0,
            },
            chat_id: msg.to,
            city: null,
            companyName: null,
            contactName: msg.to.split('@')[0],
            createdAt: admin.firestore.Timestamp.now(),
            id: extractedNumber,
            name: '',
            not_spam: false,
            phone: extractedNumber,
            phoneIndex: phoneIndex,
            pinned: false,
            profilePicUrl: '',
            tags: ['stop bot'],
            threadid: '',
            timestamp: 0,
            type: '',
            unreadCount: 0
          };

          await contactRef.set(newContact);
          existingContact = newContact;
          console.log(`Created new contact for ${extractedNumber}`);
        }

        // Add the message to Firebase
        await addMessagetoFirebase(msg, botName, extractedNumber, phoneIndex);

        // Update last_message for the contact
        const lastMessage = {
          chat_id: msg.to,
          from: msg.from,
          from_me: true,
          id: msg.id._serialized,
          phoneIndex: phoneIndex,
          source: "",
          status: "sent",
          text: {
            body: msg.body
          },
          timestamp: Math.floor(Date.now() / 1000),
          type: msg.type === 'chat' ? 'text' : msg.type
        };

        // Update the contact document with the new last_message
        await contactRef.update({
          last_message: lastMessage,
          timestamp: lastMessage.timestamp
        });

        console.log(`Updated last_message for contact ${extractedNumber}`);
      }
    } catch (error) {
      console.error(`ERROR in message_create handling for bot ${botName}:`, error);
    }
  });
}

async function addMessagetoFirebase(msg, idSubstring, extractedNumber){
  console.log('Adding message to Firebase');
  console.log('idSubstring:', idSubstring);
  console.log('extractedNumber:', extractedNumber);

  if (!extractedNumber) {
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
  if(msg.type == 'chat'){
      type ='text'
  }else if(msg.type == 'e2e_notification' || msg.type == 'notification_template'){
      return;
  }else{
      type = msg.type;
  }
  
  if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
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

  if(msg.hasQuotedMsg){
      const quotedMsg = await msg.getQuotedMessage();
      // Initialize the context and quoted_content structure
      messageData.text.context = {
        quoted_content: {
          body: quotedMsg.body
        }
      };
      const authorNumber = '+'+(quotedMsg.from).split('@')[0];
      const authorData = await getContactDataFromDatabaseByPhone(authorNumber, idSubstring);
      messageData.text.context.quoted_author = authorData ? authorData.contactName : authorNumber;
  }

  if((msg.from).includes('@g.us')){
      const authorNumber = '+'+(msg.author).split('@')[0];

      const authorData = await getContactDataFromDatabaseByPhone(authorNumber, idSubstring);
      if(authorData){
          messageData.author = authorData.contactName;
      }else{
          messageData.author = msg.author;
      }
  }

  if (msg.type === 'audio' || msg.type === 'ptt') {
      messageData.audio = {
          mimetype: 'audio/ogg; codecs=opus', // Default mimetype for WhatsApp voice messages
          data: audioData // This is the base64 encoded audio data
      };
  }

  if (msg.hasMedia &&  (msg.type !== 'audio' || msg.type !== 'ptt')) {
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
  console.log('message saved');
}
async function transcribeAudio(audioData) {
  try {
      const formData = new FormData();
      formData.append('file', Buffer.from(audioData, 'base64'), {
          filename: 'audio.ogg',
          contentType: 'audio/ogg',
      });
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'json');

      const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
          headers: {
              ...formData.getHeaders(),
              'Authorization': `Bearer ${process.env.OPENAIKEY}`,
          },
      });

      return response.data.text;
  } catch (error) {
      console.error('Error transcribing audio:', error);
      return '';
  }
}
async function storeVideoData(videoData, filename) {
  const bucket = admin.storage().bucket();
  const uniqueFilename = `${uuidv4()}_${filename}`;
  const file = bucket.file(`videos/${uniqueFilename}`);

  await file.save(Buffer.from(videoData, 'base64'), {
      metadata: {
          contentType: 'video/mp4', // Adjust this based on the actual video type
      },
  });

  const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '03-01-2500', // Adjust expiration as needed
  });

  return url;
}
console.log('Server starting - version 2'); // Add this line at the beginning of the file

async function saveContactWithRateLimit(botName, contact, chat, phoneIndex, retryCount = 0) {
  try {
    let phoneNumber = contact.number;
    let contactID = contact.id._serialized;
    const msg = chat.lastMessage || {};
    if (Object.keys(msg).length === 0) {
      return; // Skip if there's no last message
    }

    let idsuffix = chat.isGroup ? '@g.us' : '@c.us';
    if (chat.isGroup) {
      phoneNumber = contactID.split('@')[0];
    }

    if (contactID === '0@c.us' || phoneNumber === 'status') {
      return; // Skip system contacts
    }

    const extractedNumber = '+' + contactID.split('@')[0];
    console.log(`Saving contact: ${extractedNumber} with contactID: ${contactID}`);

    // Fetch existing contact data
    const existingContact = await getContactDataFromDatabaseByPhone(extractedNumber, botName);
    let tags = existingContact?.tags || ['stop bot'];

    let type = msg.type === 'chat' ? 'text' : 
               (msg.type === 'e2e_notification' || msg.type === 'notification_template') ? null : 
               msg.type;

    if (!type) return; // Skip if message type is not valid

    const contactData = {
      additionalEmails: [],
      address1: null,
      assignedTo: null,
      businessId: null,
      phone: extractedNumber,
      tags: tags,
      chat: {
        contact_id: '+' + phoneNumber,
        id: contactID || contact.id.user + idsuffix,
        name: contact.name || contact.pushname || chat.name || phoneNumber,
        not_spam: true,
        tags: tags,
        timestamp: chat.timestamp || Date.now(),
        type: 'contact',
        unreadCount: chat.unreadCount || 0,
        last_message: {
          chat_id: contact.id.user + idsuffix,
          from: msg.from || contact.id.user + idsuffix,
          from_me: msg.fromMe || false,
          id: msg._data?.id?.id || '',
          source: chat.deviceType || '',
          status: "delivered",
          text: {
            body: msg.body || ''
          },
          timestamp: chat.timestamp || Date.now(),
          type: type,
        },
      },
      chat_id: contact.id.user + idsuffix,
      city: null,
      companyName: null,
      contactName: contact.name || contact.pushname || chat.name || phoneNumber,
      unreadCount: chat.unreadCount || 0,
      threadid: '',
      phoneIndex: phoneIndex,
      last_message: {
        chat_id: contact.id.user + idsuffix,
        from: msg.from || contact.id.user + idsuffix,
        from_me: msg.fromMe || false,
        id: msg._data?.id?.id || '',
        source: chat.deviceType || '',
        status: "delivered",
        text: {
          body: msg.body || ''
        },
        timestamp: chat.timestamp || Date.now(),
        type: type,
      },
    };

    // Fetch profile picture URL
    try {
      contactData.profilePicUrl = await contact.getProfilePicUrl() || "";
    } catch (error) {
      console.error(`Error getting profile picture URL for ${contact.id.user}:`, error);
      contactData.profilePicUrl = "";
    }

    // Save contact data
    const contactRef = db.collection('companies').doc(botName).collection('contacts').doc(extractedNumber);
    await contactRef.set(contactData, { merge: true });

    // Fetch and save messages
    const messages = await chat.fetchMessages({ limit: 20 });
    if (messages && messages.length > 0) {
      console.log("SAVING MESSAGES")
      await saveMessages(botName, extractedNumber, messages, chat.isGroup);
    }

    console.log(`Successfully saved contact ${extractedNumber} for bot ${botName}`);
  } catch (error) {
    console.error(`Error saving contact for bot ${botName}:`, error);
    if (retryCount < 3) {
      console.log(`Retrying... (Attempt ${retryCount + 1})`);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      await saveContactWithRateLimit(botName, contact, chat, phoneIndex, retryCount + 1);
    } else {
      console.error(`Failed to save contact after 3 attempts`);
    }
  }
}

async function saveMessages(botName, phoneNumber, messages, isGroup) {
  const contactRef = db.collection('companies').doc(botName).collection('contacts').doc(phoneNumber);
  const messagesRef = contactRef.collection('messages');
  const sortedMessages = messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  
  let batch = db.batch();
  let count = 0;

  for (const message of sortedMessages) {
    const type = message.type === 'chat' ? 'text' : message.type;
    
    const messageData = {
      chat_id: message.from,
      from: message.from ?? "",
      from_me: message.fromMe ?? false,
      id: message.id._serialized ?? "",
      source: message.deviceType ?? "",
      status: "delivered",
      timestamp: message.timestamp ?? 0,
      type: type,
      ack: message.ack ?? 0,
    };

    if (isGroup && message.author) {
      messageData.author = message.author;
    }

    // Handle different message types
    if (type === 'text') {
      messageData.text = { body: message.body ?? "" };
    } else if (['image', 'video', 'document'].includes(type) && message.hasMedia) {
      try {
        const media = await message.downloadMedia();
        if (media) {
          const url = await saveMediaLocally(media.data, media.mimetype, media.filename || `${type}.${media.mimetype.split('/')[1]}`);
          messageData[type] = {
            mimetype: media.mimetype,
            url: url,
            filename: media.filename ?? "",
            caption: message.body ?? "",
          };
          if (type === 'image') {
            messageData[type].width = message._data.width;
            messageData[type].height = message._data.height;
          }
        } else {
          messageData.text = { body: "Media not available" };
        }
      } catch (error) {
        console.error(`Error handling media for message ${message.id._serialized}:`, error);
        messageData.text = { body: "Error handling media" };
      }
    } else {
      messageData.text = { body: message.body ?? "" };
    }

    const messageDoc = messagesRef.doc(message.id._serialized);
    batch.set(messageDoc, messageData, { merge: true });

    count++;
    if (count >= 500) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }

    broadcastProgress(botName, 'saving_messages', count / sortedMessages.length);
  }

  if (count > 0) {
    await batch.commit();
  }

  console.log(`Saved ${sortedMessages.length} messages for contact ${phoneNumber}`);
  broadcastProgress(botName, 'saving_messages', 1);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getContactDataFromDatabaseByPhone(phoneNumber, idSubstring) {
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

async function getContactDataFromDatabaseByPhone(phoneNumber, idSubstring) {
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
          contactName = contactData.name;
          threadID = contactData.thread_id;
          bot_status = contactData.bot_status;
          return { ...contactData};
      }
  } catch (error) {
      console.error('Error fetching or updating document:', error);
      throw error;
  }
}

async function processChats(client, botName, phoneIndex) {
  try {
      const chats = await client.getChats();
      const totalChats = chats.length;
      let processedChats = 0;

      for (const chat of chats) {
          if (chat.isGroup) {
              processedChats++;
              continue;
          }
          const contact = await chat.getContact();
          await saveContactWithRateLimit(botName, contact, chat, phoneIndex);
          processedChats++;
          
          broadcastProgress(botName, 'processing_chats', processedChats / totalChats, phoneIndex);
      }
      console.log(`Finished saving contacts for bot ${botName} Phone ${phoneIndex + 1}`);
  } catch (error) {
      console.error(`Error processing chats for bot ${botName} Phone ${phoneIndex + 1}:`, error);
  }
}



async function main(reinitialize = false) {
  console.log('Initialization starting...');

  console.log('Fetching companies...');
  const companiesRef = db.collection('companies');
  const snapshot = await companiesRef.get();
  
  const botConfigs = [];

  snapshot.forEach(doc => {
    const companyId = doc.id;    
    const data = doc.data();
    if (data.v2) {
      botConfigs.push({
        botName: companyId,
        phoneCount: data.phoneCount || 1, // Default to 1 if phoneCount is not set
        v2: data.v2
      });
      console.log('Found bot ' + companyId);
    }
  });
  console.log(`Found ${botConfigs.length} bots to initialize`);

  if (reinitialize) {
    console.log('Reinitializing, clearing existing bot instances...');
    for (const [botName, botData] of botMap.entries()) {
      if (Array.isArray(botData)) {
        for (const clientData of botData) {
          if (clientData.client) {
            await clientData.client.destroy();
          }
        }
      } else if (botData && botData.client) {
        await botData.client.destroy();
      }
    }
    botMap.clear();
  }
  console.log('Obliterating all jobs...');
  await obiliterateAllJobs();
  
  

  console.log('Initializing bots...');
  for (const config of botConfigs) {
    console.log(`Initializing bot ${config.botName} with ${config.phoneCount} phone(s)...`);
    await initializeBot(config.botName, config.phoneCount);
  }

  console.log('Scheduling all messages...');
  await scheduleAllMessages();

  // Run the check immediately when the server starts
  // console.log('Checking for new rows msu...');
  // const msuAutomationCOL = new msuSpreadsheetCOL(botMap);
  // const msuAutomationPartTime = new msuSpreadsheetPartTime(botMap);
  // const msuAutomationLeads = new msuSpreadsheetLeads(botMap);
  const bhqAutomation = new bhqSpreadsheet(botMap);
  bhqAutomation.initialize();
  // msuAutomationCOL.initialize();
  // msuAutomationPartTime.initialize();
  // msuAutomationLeads.initialize();

  // console.log('Checking for new rows apply radar...');
  // const applyRadarAutomationLPUniten = new applyRadarSpreadsheetLPUniten(botMap);
  // const applyRadarAutomationLPUnitenPK = new applyRadarSpreadsheetLPUnitenPK(botMap);
  // const applyRadarAutomationLPMMUPK = new applyRadarSpreadsheetLPMMUPK(botMap);
  // const applyRadarAutomationLPAPUPK = new applyRadarSpreadsheetLPAPUPK(botMap);

  // applyRadarAutomationLPUniten.initialize();
  // applyRadarAutomationLPUnitenPK.initialize();
  // applyRadarAutomationLPMMUPK.initialize();
  // applyRadarAutomationLPAPUPK.initialize(); 

  console.log('Initialization complete');
  // Send ready signal to PM2
  if (process.send) {
    process.send('ready');
  }
}

async function getContactDataFromDatabaseByEmail(email) {
  try {
      // Check if email is defined
      if (!email) {
          throw new Error("Email is undefined or null");
      }

      // Reference to the user document
      const userDocRef = db.collection('user').doc(email);
      const doc = await userDocRef.get();

      if (!doc.exists) {
          console.log('No matching document.');
          return null;
      } else {
          const userData = doc.data();
          return { ...userData };
      }
  } catch (error) {
      console.error('Error fetching or updating document:', error);
      throw error;
  }
}
async function createThread() {
  console.log('Creating a new thread...');
  const thread = await openai.beta.threads.create();
  return thread;
}
async function addMessage(threadId, message) {
  const response = await openai.beta.threads.messages.create(
      threadId,
      {
          role: "user",
          content: message
      }
  );
  return response;
}
async function runAssistant(assistantID,threadId) {
console.log('Running assistant for thread: ' + threadId);
const response = await openai.beta.threads.runs.create(
    threadId,
    {
        assistant_id: assistantID
    }
);

const runId = response.id;

const answer = await waitForCompletion(threadId, runId);
return answer;
}
async function checkingStatus(threadId, runId) {
  const runObject = await openai.beta.threads.runs.retrieve(
      threadId,
      runId
  );
  const status = runObject.status; 
  if(status == 'completed') {
      clearInterval(pollingInterval);

      const messagesList = await openai.beta.threads.messages.list(threadId);
      const latestMessage = messagesList.body.data[0].content;
      const answer = latestMessage[0].text.value;
      return answer;
  }
}
async function waitForCompletion(threadId, runId) {
  return new Promise((resolve, reject) => {
      pollingInterval = setInterval(async () => {
          const answer = await checkingStatus(threadId, runId);
          if (answer) {
              clearInterval(pollingInterval);
              resolve(answer);
          }
      }, 1000);
  });
}
// Extract user data from URL parameters
async function handleOpenAIAssistant(message, threadID,assistantid) {
  const assistantId =assistantid;
  await addMessage(threadID, message);
  const answer = await runAssistant(assistantId,threadID);
  return answer;
}
app.get('/api/assistant-test/', async (req, res) => {
  const message = req.query.message;
  const email = req.query.email;
  const assistantid = req.query.assistantid;
    try {
      let threadID;
      const contactData = await getContactDataFromDatabaseByEmail(email);
      if (contactData.threadid) {
        threadID = contactData.threadid;
    } else {
        const thread = await createThread();
        threadID = thread.id;
        await saveThreadIDFirebase(email, threadID,)
        //await saveThreadIDGHL(contactID,threadID);
    }
 
    answer = await handleOpenAIAssistant(message,threadID,assistantid);
      // Send success response
      res.json({ message: 'Assistant replied success', answer });
    } catch (error) {
      // Handle errors
      console.error('Assistant replied user:', error);
      
      res.status(500).json({ error: error.code});
    }
  });

  app.get('/api/chats/:token/:locationId/:accessToken/:userName/:userRole/:userEmail/:companyId', async (req, res) => {
    const { token, locationId, accessToken, userName, userRole, userEmail,companyId } = req.params;
  

    let allChats = [];
    let count = 500;
    let offset = 0;
    let totalChats = 0;
    let contactsData = [];
    let fetchedChats = 0; // Track the number of fetched chats
    try {
      // Fetch user data to get notifications and pinned chats
      const userDocRef = db.collection('user').doc(userEmail);

      const notificationsRef = userDocRef.collection('notifications');
      const notificationsSnapshot = await notificationsRef.get();
      const notifications = notificationsSnapshot.docs.map(doc => doc.data());
  
      const pinnedChatsRef = userDocRef.collection('pinned');
      const pinnedChatsSnapshot = await pinnedChatsRef.get();
      const pinnedChats = pinnedChatsSnapshot.docs.map(doc => doc.data());
      let whapiToken2 = token;
        const companyDocRef = db.collection('companies').doc(companyId);
        const companyDoc = await companyDocRef.get();
        const companyData = companyDoc.data();
        whapiToken2 = companyData.whapiToken2 || token;

      // Fetch all chats from WhatsApp API
      if(token !== 'none'){
     
        while (true) {
          const response = await fetch(`https://gate.whapi.cloud/chats?count=${count}&offset=${offset}`, {
            headers: { 'Authorization': 'Bearer ' + token }
          });
          const data = await response.json();
          
          if (offset === 0 && data.total) {
            totalChats = data.total;
          }
          if (data.chats.length === 0) break;
          allChats = allChats.concat(data.chats);
          fetchedChats += data.chats.length; // Update the number of fetched chats
          offset += count;
        }
        count = 500;
       offset = 0;
        if (companyId === '018') {
          while (true) {
            const response = await fetch(`https://gate.whapi.cloud/chats?count=${count}&offset=${offset}`, {
              headers: { 'Authorization': 'Bearer ' + whapiToken2 }
            });
            const data = await response.json();
            if (offset === 0 && data.total) {
              totalChats = data.total;
            }
            if (data.chats.length === 0) break;
            allChats = allChats.concat(data.chats);
            fetchedChats += data.chats.length; // Update the number of fetched chats
            offset += count;
          }
         
        }
      }
      let totalContacts = 0;
      let lastContactId = null;
      let maxContacts =3000;
      let maxRetries = 3;
      while (totalContacts < maxContacts) {
        let retries = 0;
        let contacts = [];  // Initialize contacts outside the retry loop

        const params = {
          locationId: locationId,
          limit: 100,
      };

      if (lastContactId) {
          params.startAfterId = lastContactId;
      }

      const response = await axios.get('https://services.leadconnectorhq.com/contacts/', {
          headers: {
              Authorization:`Bearer ${accessToken}`,
              Version: '2021-07-28',
          },
          params: params
      });

      

      const metaTotal = response.data.meta.total;
     // console.log(metaTotal);
      if (metaTotal < maxContacts) {
          maxContacts = metaTotal;
      }

      contacts = response.data.contacts;
      contactsData.push(...contacts);
      totalContacts += contacts.length;

      if (contacts.length === 0 || totalContacts >= maxContacts) break;
      lastContactId = contacts[contacts.length - 1].id;

        if (contacts.length === 0) {
            console.log("No more contacts to fetch.");
            break;
        }

        if (totalContacts >= maxContacts) break;
    }
    
      
      // Ensure the contactsData does not exceed 3000 contacts
      if (contactsData.length > maxContacts) {
        contactsData.length = maxContacts;
      }
      // Ensure the contactsData does not exceed 3000 contacts
      if (contactsData.length > maxContacts) {
        contactsData.length = maxContacts;
      }
 
      // Process and merge chat and contact data
      const mappedChats = allChats.map(chat => {
        if (!chat.id) return null;
        const phoneNumber = `+${chat.id.split('@')[0]}`;
        const contact = contactsData.find(contact => contact.phone === phoneNumber);
        let unreadCount = notifications.filter(notif => notif.chat_id === chat.id && !notif.read).length;
  
        if (contact) {
          return {
            ...chat,
            tags: contact.tags || [],
            name: contact.contactName || chat.name,
            contact_id: contact.id,
            unreadCount,
            chat_pic: chat.chat_pic || null,
            chat_pic_full: chat.chat_pic_full || null,
          };
        } else {
          return {
            ...chat,
            tags: [],
            name: chat.name,
            contact_id: "",
            unreadCount,
            chat_pic: chat.chat_pic || null,
            chat_pic_full: chat.chat_pic_full || null,
          };
        }
      }).filter(Boolean);
 
      // Merge WhatsApp contacts with existing contacts
      mappedChats.forEach(chat => {
        const phoneNumber = `+${chat.id.split('@')[0]}`;
        const existingContact = contactsData.find(contact => contact.phone === phoneNumber);
        if (existingContact) {
          existingContact.chat_id = chat.id;
          existingContact.last_message = chat.last_message || existingContact.last_message;
          existingContact.chat = chat;
          existingContact.unreadCount = (existingContact.unreadCount || 0) + chat.unreadCount;
          existingContact.tags = [...new Set([...existingContact.tags, ...chat.tags])];
          existingContact.chat_pic = chat.chat_pic;
          existingContact.chat_pic_full = chat.chat_pic_full;
        } else {
          contactsData.push({
            id: chat.contact_id,
            phone: phoneNumber,
            contactName: chat.name,
            chat_id: chat.id,
            last_message: chat.last_message || null,
            chat: chat,
            tags: chat.tags,
            conversation_id: chat.id,
            unreadCount: chat.unreadCount,
            chat_pic: chat.chat_pic,
            chat_pic_full: chat.chat_pic_full,
          });
        }
      });

      // Add pinned status to contactsData
      contactsData.forEach(contact => {
        contact.pinned = pinnedChats.some(pinned => pinned.chat_id === contact.chat_id);
      });
  
      // Sort contactsData by pinned status and last_message timestamp
      contactsData.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        const dateA = a.last_message?.createdAt
          ? new Date(a.last_message.createdAt)
          : a.last_message?.timestamp
            ? new Date(a.last_message.timestamp * 1000)
            : new Date(0);
        const dateB = b.last_message?.createdAt
          ? new Date(b.last_message.createdAt)
          : b.last_message?.timestamp
            ? new Date(b.last_message.timestamp * 1000)
            : new Date(0);
        return dateB - dateA;
      });
  
      // Filter contacts by user role if necessary
      let filteredContacts = contactsData;
      //console.log(filteredContacts.length);
      if (userRole === '2') {
        filteredContacts = contactsData.filter(contact => contact.tags.some(tag => typeof tag === 'string' && tag.toLowerCase().includes(userName.toLowerCase())));
        const groupChats = contactsData.filter(contact => contact.chat_id && contact.chat_id.includes('@g.us'));
        filteredContacts = filteredContacts.concat(groupChats);
      }
    
      // Include group chats regardless of the role
  
      // Remove duplicate contacts
      filteredContacts = filteredContacts.reduce((unique, contact) => {
        if (!unique.some(c => c.phone === contact.phone)) {
          unique.push(contact);
        }
        return unique;
      }, []);
     // console.log(filteredContacts.length);
      res.json({ contacts: filteredContacts, totalChats });
    } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
    }
  });

  app.post('/api/create-contact', async (req, res) => {
    const { contactName, lastName, email, phone, address1, companyName, companyId } = req.body;
  
    try {
      if (!phone) {
        return res.status(400).json({ error: "Phone number is required." });
      }
  
      // Format the phone number
      const formattedPhone = formatPhoneNumber(phone);
  
      const contactsCollectionRef = db.collection(`companies/${companyId}/contacts`);
  
      // Use the formatted phone number as the document ID
      const contactDocRef = contactsCollectionRef.doc(formattedPhone);
  
      // Check if a contact with this phone number already exists
      const existingContact = await contactDocRef.get();
      if (existingContact.exists) {
        return res.status(409).json({ error: "A contact with this phone number already exists." });
      }
  
      const chat_id = formattedPhone.split('+')[1] + "@c.us";
  
      // Prepare the contact data with the formatted phone number
      const contactData = {
        id: formattedPhone,
        chat_id: chat_id,
        contactName: contactName,
        lastName: lastName,
        email: email,
        phone: formattedPhone,
        companyName: companyName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        unreadCount: 0
      };
  
      // Add new contact to Firebase
      await contactDocRef.set(contactData);
  
      res.status(201).json({ message: "Contact added successfully!", contact: contactData });
    } catch (error) {
      console.error('Error adding contact:', error);
      res.status(500).json({ error: "An error occurred while adding the contact: " + error.message });
    }
  });
  
  // Helper function to format phone number (you'll need to implement this)
  function formatPhoneNumber(phone) {
    // Implement phone number formatting logic here
    // This is a placeholder implementation
    return phone.startsWith('+') ? phone : '+' + phone;
  }
app.get('/api/messages/:chatId/:token/:email', async (req, res) => {
    const chatId = req.params.chatId;
    const whapiToken = req.params.token; // Access token from query parameters
    const email = req.params.email;
    try {
        const response = await fetch(`https://gate.whapi.cloud/messages/list/${chatId}`, {
            headers: { 'Authorization':  `Bearer ${whapiToken}` }
        });
        const whapiMessagesData = await response.json();
        const messagesRef = db.collection(`companies/011/messages`);
        const firestoreMessagesSnapshot = await messagesRef.get();

        const firestoreMessages = {};
        firestoreMessagesSnapshot.forEach(doc => {
            firestoreMessages[doc.id] = doc.data();
        });
       // console.log(firestoreMessages);
        const whapiMessages = whapiMessagesData.messages.map(whapiMsg => {
          const firestoreMessage = firestoreMessages[whapiMsg.id];
          if (firestoreMessage) {
           // console.log('found');
              whapiMsg.name = firestoreMessage.from;
          }
          return whapiMsg;
      });

      res.json({ messages: whapiMessages, count: whapiMessagesData.count, total: whapiMessagesData.total });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});
  // Modify the API route to get the QR code or authentication status
  app.get('/api/bot-status/:botName', (req, res) => {
    const { botName } = req.params;
    const botData = botMap.get(botName);
  
    if (botData && Array.isArray(botData)) {
      if (botData.length === 1) {
        // Single phone
        const { status, qrCode } = botData[0];
        res.json({ status, qrCode });
      } else {
        // Multiple phones
        const statusArray = botData.map((phone, index) => ({
          phoneIndex: index,
          status: phone.status,
          qrCode: phone.qrCode
        }));
        res.json(statusArray);
      }
    } else if (botData) {
      // Fallback for unexpected data structure
      res.json([{ status: botData.status, qrCode: botData.qrCode }]);
    } else {
      res.status(404).json({ error: 'Bot status not available' });
    }
  });

app.post('/api/v2/messages/text/:companyId/:chatId', async (req, res) => {
  console.log('send message');
  const companyId = req.params.companyId;
  const chatId = req.params.chatId;
  const { message, quotedMessageId, phoneIndex: requestedPhoneIndex, userName: requestedUserName } = req.body;
  console.log(req.body);
  console.log(message)

  const phoneIndex = requestedPhoneIndex !== undefined ? parseInt(requestedPhoneIndex) : 0;
  const userName = requestedUserName !== undefined ? requestedUserName : '';

  try {
    let client;
    // 1. Get the client for this company from botMap
    const botData = botMap.get(companyId);
    if (!botData) {
      return res.status(404).send('WhatsApp client not found for this company');
    }
    client = botData[phoneIndex].client;
    
    if (!client) {
      return res.status(404).send('No active WhatsApp client found for this company');
    }
    // 2. Use wwebjs to send the message
    let sentMessage;
    if (quotedMessageId) {
      const chat = await client.getChatById(chatId);
      const quotedMessage = await chat.fetchMessages({limit: 1, id: quotedMessageId});
      sentMessage = await chat.sendMessage(message, { quotedMessageId: quotedMessage[0].id._serialized });
    } else {
      sentMessage = await client.sendMessage(chatId, message);
    }
    console.log(sentMessage)
    let phoneNumber = '+'+(chatId).split('@')[0];
    let type2 = sentMessage.type === 'chat' ? 'text' : sentMessage.type;
    // 3. Save the message to Firebase

    const messageData = {
      chat_id: sentMessage.from,
      from: sentMessage.from ?? "",
      from_me: true,
      id: sentMessage.id._serialized ?? "",
      source: sentMessage.deviceType ?? "",
      status: "delivered",
      text:{
        body:message
      },
      timestamp: sentMessage.timestamp ?? 0,
      type: type2,
      userName: userName,
      ack: sentMessage.ack ?? 0,
      phoneIndex: phoneIndex,
    };
    
    const contactRef = db.collection('companies').doc(companyId).collection('contacts').doc(phoneNumber);
    //await contactRef.set(contactData, { merge: true });
    const messagesRef = contactRef.collection('messages');

    const messageDoc = messagesRef.doc(sentMessage.id._serialized);
    await messageDoc.set(messageData, { merge: true });

    res.json({ success: true, messageId: sentMessage.id._serialized });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Edit message route
app.put('/api/v2/messages/:companyId/:chatId/:messageId', async (req, res) => {
  console.log('Edit message');
  const { companyId, chatId, messageId } = req.params;
  const { newMessage } = req.body;

  try {
    // Get the client for this company from botMap
    const botData = botMap.get(companyId);
    if (!botData || !botData[0] || !botData[0].client) {
      return res.status(404).send('WhatsApp client not found for this company');
    }
    const client = botData[0].client;

    // Get the chat
    const chat = await client.getChatById(chatId);

    // Fetch the message
    const messages = await chat.fetchMessages({ limit: 1, id: messageId });
    if (messages.length === 0) {
      return res.status(404).send('Message not found');
    }
    const message = messages[0];

    // Edit the message
    const editedMessage = await message.edit(newMessage);

    if (editedMessage) {
      // Update the message in Firebase
      let phoneNumber = '+'+(chatId).split('@')[0];
      const contactRef = db.collection('companies').doc(companyId).collection('contacts').doc(phoneNumber);
      const messageRef = contactRef.collection('messages').doc(messageId);

      await messageRef.update({
        'text.body': newMessage,
        edited: true,
        editedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      res.json({ success: true, messageId: messageId });
    } else {
      res.status(400).json({ success: false, error: 'Failed to edit message' });
    }
  } catch (error) {
    console.error('Error editing message:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Delete message route
app.delete('/api/v2/messages/:companyId/:chatId/:messageId', async (req, res) => {
  console.log('Delete message');
  const { companyId, chatId, messageId } = req.params;
  const { deleteForEveryone } = req.body; // Add this to allow specifying if the message should be deleted for everyone

  try {
    // Get the client for this company from botMap
    const botData = botMap.get(companyId);
    if (!botData || !botData[0] || !botData[0].client) {
      return res.status(404).send('WhatsApp client not found for this company');
    }
    const client = botData[0].client;

    // Get the chat
    const chat = await client.getChatById(chatId);

    // Fetch the message
    const messages = await chat.fetchMessages({ limit: 1, id: messageId });
    if (messages.length === 0) {
      return res.status(404).send('Message not found');
    }
    const message = messages[0];

    // Delete the message
    await message.delete(deleteForEveryone);

    // Delete the message from Firebase
    let phoneNumber = '+'+(chatId).split('@')[0];
    const contactRef = db.collection('companies').doc(companyId).collection('contacts').doc(phoneNumber);
    const messageRef = contactRef.collection('messages').doc(messageId);
    await messageRef.delete();

    res.json({ success: true, messageId: messageId });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/api/messages/text/:chatId/:token', async (req, res) => {
  console.log('send message');
  const chatId = req.params.chatId;
  const token = req.params.token; // Access token from query parameters
  const message = req.body.message;
  const quotedMessageId = req.body.quotedMessageId; // Extract quotedMessageId from the request body
  console.log(req.body);

  const requestBody = {
    to: chatId,
    body: message
  };

  // Include quotedMessageId if it is provided
  if (quotedMessageId) {
    requestBody.quoted = quotedMessageId;
  }

  try {
    const response = await fetch(`https://gate.whapi.cloud/messages/text`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    //console.log(response);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/api/v2/messages/image/:companyId/:chatId', async (req, res) => {
  console.log('send image message');
  const companyId = req.params.companyId;
  const chatId = req.params.chatId;
  const { imageUrl, caption , phoneIndex: requestedPhoneIndex, userName: requestedUserName} = req.body;
  console.log(req.body);

  const phoneIndex = requestedPhoneIndex !== undefined ? parseInt(requestedPhoneIndex) : 0;
  const userName = requestedUserName !== undefined ? requestedUserName : '';
  
  try {
    let client;
    // 1. Get the client for this company from botMap
    const botData = botMap.get(companyId);
    if (!botData) {
      return res.status(404).send('WhatsApp client not found for this company');
    }
    client = botData[phoneIndex].client;
    
    if (!client) {
      return res.status(404).send('No active WhatsApp client found for this company');
    }
    // 2. Use wwebjs to send the image message
    const media = await MessageMedia.fromUrl(imageUrl);
    const sentMessage = await client.sendMessage(chatId, media, { caption });

    console.log(sentMessage);
    let phoneNumber = '+'+(chatId).split('@')[0];

    // 3. Save the message to Firebase
    const messageData = {
      chat_id: sentMessage.from,
      from: sentMessage.from ?? "",
      from_me: true,
      id: sentMessage.id._serialized ?? "",
      source: sentMessage.deviceType ?? "",
      status: "delivered",
      image: {
        mimetype: media.mimetype,
        link: imageUrl,
        caption: caption ?? "",
      },
      timestamp: sentMessage.timestamp ?? 0,
      userName: userName,
      type: 'image',
      ack: sentMessage.ack ?? 0,
    };
    
    const contactRef = db.collection('companies').doc(companyId).collection('contacts').doc(phoneNumber);
    const messagesRef = contactRef.collection('messages');

    const messageDoc = messagesRef.doc(sentMessage.id._serialized);
    await messageDoc.set(messageData, { merge: true });

    res.json({ success: true, messageId: sentMessage.id._serialized });
  } catch (error) {
    console.error('Error sending image message:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/api/v2/messages/audio/:companyId/:chatId', async (req, res) => {
  console.log('send audio message');
  const companyId = req.params.companyId;
  const chatId = req.params.chatId;
  const { audioUrl, caption, phoneIndex: requestedPhoneIndex, userName: requestedUserName } = req.body;
  console.log(req.body);

  const phoneIndex = requestedPhoneIndex !== undefined ? parseInt(requestedPhoneIndex) : 0;
  const userName = requestedUserName !== undefined ? requestedUserName : '';
  
  try {
    let client;
    // 1. Get the client for this company from botMap
    const botData = botMap.get(companyId);
    if (!botData) {
      return res.status(404).send('WhatsApp client not found for this company');
    }
    client = botData[phoneIndex].client;
    
    if (!client) {
      return res.status(404).send('No active WhatsApp client found for this company');
    }

    // 2. Use wwebjs to send the audio message
    const media = await MessageMedia.fromUrl(audioUrl);
    const sentMessage = await client.sendMessage(chatId, media, { sendAudioAsVoice: true });

    console.log(sentMessage);
    let phoneNumber = '+'+(chatId).split('@')[0];

    // 3. Save the message to Firebase
    const messageData = {
      chat_id: sentMessage.from,
      from: sentMessage.from ?? "",
      from_me: true,
      id: sentMessage.id._serialized ?? "",
      source: sentMessage.deviceType ?? "",
      status: "delivered",
      audio: {
        mimetype: media.mimetype,
        link: audioUrl,
      },
      timestamp: sentMessage.timestamp ?? 0,
      userName: userName,
      type: 'audio',
      ack: sentMessage.ack ?? 0,
    };
    
    const contactRef = db.collection('companies').doc(companyId).collection('contacts').doc(phoneNumber);
    const messagesRef = contactRef.collection('messages');

    const messageDoc = messagesRef.doc(sentMessage.id._serialized);
    await messageDoc.set(messageData, { merge: true });

    res.json({ success: true, messageId: sentMessage.id._serialized });
  } catch (error) {
    console.error('Error sending audio message:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/api/messages/image/:token', async (req, res) => {
    const { chatId, imageUrl, caption } = req.body;
    const token = req.params.token;
    try {
        const response = await fetch(`https://gate.whapi.cloud/messages/image`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ to: chatId, media: imageUrl, caption })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error sending image message:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/v2/messages/document/:companyId/:chatId', async (req, res) => {
  console.log('send document message');
  const companyId = req.params.companyId;
  const chatId = req.params.chatId;
  const { documentUrl, filename, caption, phoneIndex: requestedPhoneIndex, userName: requestedUserName} = req.body;
  console.log(req.body);
  const phoneIndex = requestedPhoneIndex !== undefined ? parseInt(requestedPhoneIndex) : 0;
  const userName = requestedUserName !== undefined ? requestedUserName : '';

  try {
    let client;
    // 1. Get the client for this company from botMap
    const botData = botMap.get(companyId);
    if (!botData) {
      return res.status(404).send('WhatsApp client not found for this company');
    }
    client = botData[phoneIndex].client;
    
    if (!client) {
      return res.status(404).send('No active WhatsApp client found for this company');
    }

    // 2. Use wwebjs to send the document message
    const media = await MessageMedia.fromUrl(documentUrl, { unsafeMime: true, filename: filename });
    const sentMessage = await client.sendMessage(chatId, media, { caption });

    console.log(sentMessage);
    let phoneNumber = '+'+(chatId).split('@')[0];

    // 3. Save the message to Firebase
    const messageData = {
      chat_id: sentMessage.from,
      from: sentMessage.from ?? "",
      from_me: true,
      id: sentMessage.id._serialized ?? "",
      source: sentMessage.deviceType ?? "",
      status: "delivered",
      document: {
        mimetype: media.mimetype,
        link: documentUrl,
        filename: filename,
        caption: caption ?? "",
      },
      timestamp: sentMessage.timestamp ?? 0,
      type: 'document',
      userName: userName,
      ack: sentMessage.ack ?? 0,
    };
    
    const contactRef = db.collection('companies').doc(companyId).collection('contacts').doc(phoneNumber);
    const messagesRef = contactRef.collection('messages');

    const messageDoc = messagesRef.doc(sentMessage.id._serialized);
    await messageDoc.set(messageData, { merge: true });

    res.json({ success: true, messageId: sentMessage.id._serialized });
  } catch (error) {
    console.error('Error sending document message:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/api/messages/document/:token', async (req, res) => {
    const { chatId, imageUrl, caption ,mimeType,fileName  } = req.body;
    const token = req.params.token;
    try {
        const response = await fetch(`https://gate.whapi.cloud/messages/document`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ to: chatId, media: imageUrl, caption,filename:fileName,mimeType:mimeType            })
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error sending image message:', error);
        res.status(500).send('Internal Server Error');
    }
});




app.post('/api/fetch-users', async (req, res) => {
  const { accessToken, locationId } = req.body;
  const maxRetries = 5;
  const baseDelay = 5000;

  const fetchData = async (url, retries = 0) => {
    const options = {
      method: 'GET',
      url: url,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Version: '2021-07-28',
        Accept: 'application/json',
      },
      params: {
        locationId: locationId,
      }
    };
    try {
      const response = await axios.request(options);
      return response;
    } catch (error) {
      if (error.response && error.response.status === 429 && retries < maxRetries) {
        const delay = baseDelay * Math.pow(2, retries);
        console.warn(`Rate limit hit, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchData(url, retries + 1);
      } else {
        console.error('Error during fetchData:', error);
        throw error;
      }
    }
  };

  try {
    const url = `https://services.leadconnectorhq.com/users/`;
    const response = await fetchData(url);
    res.json(response.data.users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Error fetching users');
  }
});



async function customWait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}


app.post('/api/channel/create/:companyID', async (req, res) => {
    const { companyID } = req.params;
    const phoneCount = 1;
//
    try {
        // Create the assistant
        await createAssistant(companyID);

        // Initialize only the new bot
        await initializeBot(companyID, phoneCount);

        res.json({ message: 'Channel created successfully and new bot initialized', newBotId: companyID });
    } catch (error) {
        console.error('Error creating channel and initializing new bot:', error);
        res.status(500).json({ error: 'Failed to create channel and initialize new bot', details: error.message });
    }
});

async function initializeBot(botName, phoneCount = 1) {
  try {
      console.log(`Starting initialization for bot: ${botName} with ${phoneCount} phone(s)`);
      const clients = [];
      
      for (let i = 0; i < phoneCount; i++) {
        
          let clientName = phoneCount == 1 ? botName : `${botName}_phone${i + 1}`;
          
          const client = new Client({
              authStrategy: new LocalAuth({
                  clientId: clientName,
              }),
              puppeteer: { 
                  headless: true,
                  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
                  args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-gpu',
                    '--hide-scrollbars',
                    '--disable-cache',
                    '--disable-application-cache',
                    '--disable-gpu-driver-bug-workarounds',
                    '--disable-accelerated-2d-canvas',
                ],
              }
          });

          clients.push({ client, status: 'initializing', qrCode: null });
          
          client.on('qr', async (qr) => {
              console.log(`${botName} Phone ${i + 1} - QR RECEIVED`);
              try {
                  const qrCodeData = await qrcode.toDataURL(qr);
                  clients[i] = { ...clients[i], status: 'qr', qrCode: qrCodeData };
                  botMap.set(botName, clients);
                  broadcastAuthStatus(botName, 'qr', qrCodeData, phoneCount > 1 ? i : undefined);
              } catch (err) {
                  console.error('Error generating QR code:', err);
              }
          });

          client.on('authenticated', () => {
              console.log(`${botName} Phone ${i + 1} - AUTHENTICATED`);
              clients[i] = { ...clients[i], status: 'authenticated', qrCode: null };
              botMap.set(botName, clients);
              broadcastAuthStatus(botName, 'authenticated', null, phoneCount > 1 ? i : undefined);
          });

          client.on('ready', async () => {
              console.log(`${botName} Phone ${i + 1} - READY`);
              clients[i] = { ...clients[i], status: 'ready', qrCode: null };
              botMap.set(botName, clients);
              setupMessageHandler(client, botName, i);
              setupMessageCreateHandler(client, botName, i);
              broadcastAuthStatus(botName, 'ready', null, phoneCount > 1 ? i : undefined);
          });

          client.on('auth_failure', msg => {
              console.error(`${botName} Phone ${i + 1} - AUTHENTICATION FAILURE`, msg);
              clients[i] = { ...clients[i], status: 'auth_failure', qrCode: null };
              botMap.set(botName, clients);
              broadcastAuthStatus(botName, 'auth_failure', null, phoneCount > 1 ? i : undefined);
          });

          client.on('disconnected', async (reason) => {
            console.log(`${botName} Phone ${i + 1} - DISCONNECTED:`, reason);
            clients[i] = { ...clients[i], status: 'disconnected', qrCode: null };
            botMap.set(botName, clients);
            broadcastAuthStatus(botName, 'disconnected', null, phoneCount > 1 ? i : undefined);
        
            // Reinitialize the client
            try {
                console.log(`${botName} Phone ${i + 1} - Reinitializing...`);
                await client.destroy();
                await client.initialize();
            } catch (error) {
                console.error(`${botName} Phone ${i + 1} - Error reinitializing:`, error);
                clients[i] = { ...clients[i], status: 'error', qrCode: null, error: error.message };
                botMap.set(botName, clients);
                broadcastAuthStatus(botName, 'error', null, phoneCount > 1 ? i : undefined);
            }
          });
        

          client.on('remote_session_saved', () => {
              console.log(`${botName} Phone ${i + 1} - REMOTE SESSION SAVED`);
              clients[i] = { ...clients[i], status: 'remote_session_saved' };
              botMap.set(botName, clients);
          });

          try {
            await client.initialize();
            console.log(`Bot ${botName} Phone ${i + 1} initialization complete`);
          } catch (initError) {
            console.error(`Error initializing bot ${botName} Phone ${i + 1}:`, initError);
            
            // Delete the session folder
            
            const sessionPath = path.join(__dirname, '.wwebjs_auth', 'session-'+clientName);
            await fs.promises.rm(sessionPath, { recursive: true, force: true });
            console.log(`Deleted session folder for ${clientName}`);
            
            await customWait(5000);
            // Reinitialize the client
            try {
              await client.initialize();
              console.log(`Bot ${botName} Phone ${i + 1} reinitialized successfully`);
            } catch (reinitError) {
              console.error(`Failed to reinitialize bot ${botName} Phone ${i + 1}:`, reinitError);
              throw reinitError;
            }
          }
    
      }

      botMap.set(botName, clients);
      console.log(`Bot ${botName} initialization complete for all ${phoneCount} phone(s)`);
  } catch (error) {
      console.error(`Error initializing bot ${botName}:`, error);
      botMap.set(botName, [{ client: null, status: 'error', qrCode: null, error: error.message }]);
  }
}


async function createAssistant(companyID) {
  const OPENAI_API_KEY = process.env.OPENAIKEY; // Ensure your environment variable is set
console.log('creating ass');
  const payload = {
    name: companyID,
    model: 'gpt-4o', // Ensure this model is supported and available
  };

  // Debugging: Log the payload being sent to OpenAI
  console.log('Payload to OpenAI:', JSON.stringify(payload));

  try {
    const response = await axios.post('https://api.openai.com/v1/assistants', payload, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta':'assistants=v2'
      },
    });

    console.log('OpenAI Response:', response.data);
    const assistantId = response.data.id;
    const companiesCollection = db.collection('companies');
        

      // Save the whapiToken to a new document
      await companiesCollection.doc(companyID).set({
        assistantId: assistantId,
        v2: true
    }, { merge: true });
 return;
  
} catch (error) {
  console.error('Error creating OpenAI assistant:', error.response ? error.response.data : error.message);
  res.status(500).json({ error: 'Failed to create assistant' });
}
}

main().catch(error => {
  console.error('Error during initialization:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('Graceful shutdown initiated');

  // Perform cleanup operations
  try {
    console.log('Closing all WhatsApp clients...');
    const shutdownPromises = [];

    for (const [botName, botData] of botMap.entries()) {
      if (Array.isArray(botData)) {
        // Multiple clients for this bot
        for (const { client } of botData) {
          if (client && typeof client.destroy === 'function') {
            shutdownPromises.push(client.destroy().catch(err => console.error(`Error destroying client for bot ${botName}:`, err)));
          }
        }
      } else if (botData && botData.client && typeof botData.client.destroy === 'function') {
        // Single client for this bot
        shutdownPromises.push(botData.client.destroy().catch(err => console.error(`Error destroying client for bot ${botName}:`, err)));
      }
    }

    // Wait for all clients to be destroyed
    await Promise.all(shutdownPromises);
    console.log('All WhatsApp clients closed successfully');

    // Clear the botMap
    botMap.clear();

    // Add any other cleanup operations here
    // For example, close database connections, finish processing, etc.

    console.log('Cleanup complete, shutting down');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});




