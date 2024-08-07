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
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline)
const url = require('url');
const botMap = new Map();
// Redis connection
const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
  maxmemoryPolicy:'noeviction'
});

require('events').EventEmitter.prototype._maxListeners = 70;
require('events').defaultMaxListeners = 70;

//Save last processed row
const LAST_PROCESSED_ROW_FILE = 'last_processed_row.json';

// Create a queue
const messageQueue = new Queue('scheduled-messages', { connection });

// Ensure this directory exists in your project
const MEDIA_DIR = path.join(__dirname, 'public', 'media');

// Function to save media locally
async function saveMediaLocally(base64Data, mimeType, filename) {
  const buffer = Buffer.from(base64Data, 'base64');
  const uniqueFilename = `${uuidv4()}_${filename}`;
  const filePath = path.join(MEDIA_DIR, uniqueFilename);
  
  await fs.writeFile(filePath, buffer);

  // Return the URL path to access this filez
  return `/media/${uniqueFilename}`;
}

// Function to load the last processed row from file
async function loadLastProcessedRow() {
  try {
    const data = await fs.readFile(LAST_PROCESSED_ROW_FILE, 'utf8');
    const { lastProcessedRow, lastProcessedTimestamp } = JSON.parse(data);
    return { lastProcessedRow, lastProcessedTimestamp };
  } catch (error) {
    console.log('No saved state found, starting from the beginning.');
    return { lastProcessedRow: 0, lastProcessedTimestamp: 0 };
  }
}

// Function to save the last processed row to file
async function saveLastProcessedRow(lastProcessedRow, lastProcessedTimestamp) {
  await fs.writeFile(LAST_PROCESSED_ROW_FILE, JSON.stringify({ lastProcessedRow, lastProcessedTimestamp }));
}

async function checkAndProcessNewRows(spreadsheetId, range, botName) {
  try {
    const { lastProcessedRow, lastProcessedTimestamp } = await loadLastProcessedRow();

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log('No data found.');
      return;
    }

    let newLastProcessedRow = lastProcessedRow;
    const currentTimestamp = Date.now();

    // Process new rows
    for (let i = lastProcessedRow + 1; i < rows.length; i++) {
      const row = rows[i];
      const [name, phoneNumber, message, timestamp] = row; // Assuming timestamp is the 4th column

      // Check if this row is newer than the last processed timestamp
      if (new Date(timestamp).getTime() > lastProcessedTimestamp) {
        // Send WhatsApp message
        const botData = botMap.get(botName);
        if (!botData || !botData.client) {
          return res.status(404).send('WhatsApp client not found for this company');
        }
        const client = botData.client;
        await client.sendMessage(`${phoneNumber}@c.us`, message);
        console.log(`Processed row ${i + 1}: Message sent to ${name} (${phoneNumber})`);
        newLastProcessedRow = i;
      }
    }

    // Update the last processed row and timestamp
    await saveLastProcessedRow(newLastProcessedRow, currentTimestamp);
  } catch (error) {
    console.error('Error processing spreadsheet:', error);
  }
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
  function sendProgressUpdate(client, progress) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'progress', progress }));
    }
  }
  
  function broadcastProgress(botName, action, progress) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'progress',
          botName,
          action,
          progress
        }));
      }
    });
  }
  const botStatusMap = new Map();
  function broadcastAuthStatus(botName, status, qrCode = null) {

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.companyId === botName) {
        console.log('sent to clinet');
        client.send(JSON.stringify({ 
          type: 'auth_status', 
          botName, 
          status,
          qrCode: status === 'qr' ? qrCode : null // Include qrCode only when status is 'qr'
        }));
      }
    });
    botStatusMap.set(botName,status);
  }
  async function ghlToken(companyId) {
    try {
        await fetchConfigFromDatabase(companyId);
        const { ghl_id, ghl_secret, ghl_refreshToken } = ghlConfig;

        // Generate new token using fetched credentials and refresh token
        const encodedParams = new URLSearchParams();
        encodedParams.set('client_id', ghl_id);
        encodedParams.set('client_secret', ghl_secret);
        encodedParams.set('grant_type', 'refresh_token');
        encodedParams.set('refresh_token', ghl_refreshToken);
        encodedParams.set('user_type', 'Location');

        const options = {
            method: 'POST',
            url: 'https://services.leadconnectorhq.com/oauth/token',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            },
            data: encodedParams,
        };

        const { data: newTokenData } = await axios.request(options);

        await db.collection('companies').doc(companyId).set({
            ghl_accessToken: newTokenData.access_token,
            ghl_refreshToken: newTokenData.refresh_token,
        }, { merge: true });

   
    } catch (error) {
       
        throw error;
    }
}
async function fetchConfigFromDatabase(companyId) {
    try {
        const docRef = db.collection('companies').doc(companyId);
        const doc = await docRef.get();
        if (!doc.exists) {
            console.log(`No such document for company ${companyId}!`);
            return;
        }
        ghlConfig = doc.data();
    } catch (error) {
        //console.error(`Error fetching config for company ${companyId}:`, error);
        throw error;
    }
}

async function updateAllTokens() {


    const companyIds = Array.from({ length: 23 }, (_, i) => `00${i + 1}`.slice(-3));
    for (const companyId of companyIds) {
      console.log(companyId);
        try {
            await ghlToken(companyId);
        
        } catch (error) {
           // console.error(`Error updating token for company ${companyId}:`, error);
        }
    }
}

// Schedule the token update to run every 12 hours
cron.schedule('0 */12 * * *', async () => {
    console.log('Starting token update for all companies...');
    await updateAllTokens();
    console.log('Token update for all companies complete.');
});

// Initial call to update tokens on script start
(async () => {
    try {

        await updateAllTokens();
    } catch (error) {
        //console.error('Error during initial token update:', error);
    }
})();

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
const { handleNewMessagesBillert } = require('./bots/handleMessagesBillert.js');
const { handleNewMessagesSunz } = require('./bots/handleMessagesSunz.js');
const { handleNewMessagesBHQ } = require('./bots/handleMessagesBHQ.js');
const { handleNewMessagesTasty} = require('./bots/handleMessagesTasty.js');
const { handleNewMessagesTastyPuga} = require('./bots/handleMessagesPugaTasty.js');
const { handleNewMessagesCNB} = require('./bots/handleMessagesCNB.js');
const { handleNewMessagesMSU} = require('./bots/handleMessagesMSU.js');
const { handleNewMessagesApel} = require('./bots/handleMessagesApel.js');
const { handleNewMessagesApplyRadar } = require('./bots/handleMessagesApplyRadar.js');
const { handleNewMessagesTemplate } = require('./bots/handleMessagesTemplate.js');
const { handleNewMessagesTemplateWweb } = require('./bots/handleMessagesTemplateWweb.js');
const { handleNewMessagesZahinTravel } = require('./bots/handleMessagesZahinTravel.js');





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
app.post('/billert/hook/messages', handleNewMessagesBillert);
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
app.post('/cnb/hook/messages', handleNewMessagesCNB);
app.post('/msu/hook/messages', handleNewMessagesMSU);
app.post('/apel/hook/messages', handleNewMessagesApel);
app.post('/applyradar/hook/messages', handleNewMessagesApplyRadar);
app.post('/:companyID/template/hook/messages', handleNewMessagesTemplate);
const customHandlers = {
  '042': handleNewMessagesZahinTravel,
  // Add more custom handlers for other bots as needed
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
    const { csvUrl } = req.body;
  
    if (!csvUrl) {
      return res.status(400).json({ error: 'CSV URL is required' });
    }
  
    try {
      const tempFile = `temp_${Date.now()}.csv`;
      await downloadCSV(csvUrl, tempFile);
      await processCSV(tempFile, companyId);
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

  async function processCSV(filename, companyId) {
    return new Promise((resolve, reject) => {
      fs.createReadStream(filename)
        .pipe(csv())
        .on('data', async (row) => {
          try {
            await processContact(row, companyId);
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

  async function processContact(row, companyId) {
    let name = row.Name.trim();
    let phone = await formatPhoneNumber(row.Phone);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth()-6)
    const sixMonthsAgoTimeStamp = sixMonthsAgo.getTime();
    if (!name) {
      name = phone;
    }
    console.log(row.Phone)
    phoneWithPlus = '+' + phone;
    if (phone) {
      const contactRef = db.collection('companies').doc(companyId).collection('contacts').doc(phoneWithPlus);
      const doc = await contactRef.get();
  
      if (doc.exists) {
        // Contact already exists, add 'csv' tag
        await contactRef.update({
          tags: admin.firestore.FieldValue.arrayUnion('csv')
        });
        console.log(`Updated existing contact with 'csv' tag: ${name} - ${phone}`);
      } else {
        // Contact doesn't exist, create new contact with 'csv' tag
          const contactData = {
            additionalEmails: [],
            address1: null,
            assignedTo: null,
            businessId: null,
            phone: "+" + phone,
            tags: ['csv'],
            chat: {
                contact_id: phone,
                id: phone + '@c.us',
                name: name,
                not_spam: true,
                tags: ['csv'], // You might want to populate this with actual tags if available
                timestamp: 1708858609,
                type: 'contact',
                unreadCount: 0,
                last_message:null,
            },
            chat_id: phone + '@c.us',
            city: null,
            companyName: null,
            contactName: name,
            threadid: '', // You might want to generate or retrieve this
            last_message: null,
        };
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
  
      // Save to Firestore
      await db.collection('companies').doc(companyId).collection('scheduledMessages').doc(messageId).set(scheduledMessage);
  
      // Calculate delay for the job
      const delay = scheduledMessage.scheduledTime.toDate().getTime() - Date.now();
  
      // Calculate the number of batches
      const totalContacts = scheduledMessage.chatIds.length;
      const batchSize = scheduledMessage.batchQuantity || totalContacts;
      const numberOfBatches = Math.ceil(totalContacts / batchSize);
  
    // Base job options
    const baseJobOptions = { 
      removeOnComplete: false,
      removeOnFail: false
    };

    // Create a job for each batch
    for (let batchIndex = 0; batchIndex < numberOfBatches; batchIndex++) {
      const batchDelay = delay + (batchIndex * scheduledMessage.repeatInterval * getMillisecondsForUnit(scheduledMessage.repeatUnit));
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min((batchIndex + 1) * batchSize, totalContacts);
      const batchChatIds = scheduledMessage.chatIds.slice(startIndex, endIndex);

      const jobId = `${messageId}_batch_${batchIndex}`;
      const jobOptions = {
        ...baseJobOptions,
        delay: Math.max(batchDelay, 0),
        jobId: jobId
      };

      await messageQueue.add('send-message-batch', 
        { ...scheduledMessage, id: jobId, chatIds: batchChatIds }, 
        jobOptions
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

  try {
    // 1. Delete the existing messages from the queue
    const jobs = await messageQueue.getJobs(['active', 'waiting', 'delayed', 'paused']);
    for (const job of jobs) {
      if (job.id.startsWith(messageId)) {
        await job.remove();
      }
    }

    // 2. Remove the message from Firebase
    await db.collection('companies').doc(companyId).collection('scheduledMessages').doc(messageId).delete();

    // 3. Add the new message to Firebase
    updatedMessage.createdAt = admin.firestore.Timestamp.now();
    updatedMessage.scheduledTime = new admin.firestore.Timestamp(
      updatedMessage.scheduledTime.seconds,
      updatedMessage.scheduledTime.nanoseconds
    );
    await db.collection('companies').doc(companyId).collection('scheduledMessages').doc(messageId).set(updatedMessage);

    // 4. Add the new message to the queue
    const delay = updatedMessage.scheduledTime.toDate().getTime() - Date.now();
    const totalContacts = updatedMessage.chatIds.length;
    const batchSize = updatedMessage.batchQuantity || totalContacts;
    const numberOfBatches = Math.ceil(totalContacts / batchSize);

    // Base job options
    const baseJobOptions = { 
      removeOnComplete: false,
      removeOnFail: false
    };

    // Create a job for each batch
    for (let batchIndex = 0; batchIndex < numberOfBatches; batchIndex++) {
      const batchDelay = delay + (batchIndex * updatedMessage.repeatInterval * getMillisecondsForUnit(updatedMessage.repeatUnit));
      const startIndex = batchIndex * batchSize;
      const endIndex = Math.min((batchIndex + 1) * batchSize, totalContacts);
      const batchChatIds = updatedMessage.chatIds.slice(startIndex, endIndex);

      const jobId = `${messageId}_batch_${batchIndex}`;
      const jobOptions = {
        ...baseJobOptions,
        delay: Math.max(batchDelay, 0),
        jobId: jobId
      };

      await messageQueue.add('send-message-batch', 
        { ...updatedMessage, id: jobId, chatIds: batchChatIds }, 
        jobOptions
      );
    }

    res.json({ message: 'Scheduled message updated successfully', id: messageId });
  } catch (error) {
    console.error('Error updating scheduled message:', error);
    res.status(500).json({ error: 'Failed to update scheduled message' });
  }
});

  // New route for syncing contacts
  app.post('/api/sync-contacts/:companyId', async (req, res) => {
    const { companyId } = req.params;
    
    try {
      const botData = botMap.get(companyId);
      if (!botData || !botData.client) {
        return res.status(404).json({ error: 'WhatsApp client not found for this company' });
      }
      
      const client = botData.client;
      await syncContacts(client, companyId);
      
      res.json({ success: true, message: 'Contact synchronization started' });
    } catch (error) {
      console.error(`Error starting contact sync for ${companyId}:`, error);
      res.status(500).json({ error: 'Failed to start contact synchronization' });
    }
  });

  async function syncContacts(client, companyId) {
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
        await saveContactWithRateLimit(companyId, contact, chat);
        processedChats++;
        
        // Send overall progress update
        broadcastProgress(companyId, 'syncing_contacts', processedChats / totalChats);
      }
      console.log(`Finished syncing contacts for company ${companyId}`);
      broadcastProgress(companyId, 'syncing_contacts', 1); // 100% complete
    } catch (error) {
      console.error(`Error syncing contacts for company ${companyId}:`, error);
      broadcastProgress(companyId, 'syncing_contacts', -1); // Indicate error
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
    const batchMessage = job.data;
    
    try {
      for (const chatId of batchMessage.chatIds) {
        await sendScheduledMessage({ ...batchMessage, chatId });
      }
      
      console.log(`Batch ${batchMessage.id} sent successfully`);

      // Extract companyId and base messageId
      const companyId = batchMessage.companyId;
      const baseMessageId = batchMessage.id.split('_batch_')[0];

      // Check if all batches are processed
      const remainingBatches = await messageQueue.getJobs(['waiting', 'delayed', 'active']);
      const relatedJobs = remainingBatches.filter(job => job.id.startsWith(baseMessageId));

      console.log(`Total remaining jobs: ${remainingBatches.length}`);
      console.log(`Related jobs for message ${baseMessageId}: ${relatedJobs.length}`);
      console.log(`Related job IDs: ${relatedJobs.map(job => job.id).join(', ')}`);

      if (relatedJobs.length-1 === 0) {
        // All batches for this message have been processed
        await db.collection('companies').doc(companyId).collection('scheduledMessages').doc(baseMessageId).delete();
        console.log(`Scheduled message ${baseMessageId} deleted from Firebase`);
      } else {
        console.log(`${relatedJobs.length-1} batches remaining for message ${baseMessageId}`);
        for (const job of relatedJobs) {
          console.log(`Remaining job ${job.id} status: ${job.status}`);
        }
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
    // Example: Sending an image message
    if (message.mediaUrl != '') {
      await fetch(`https://mighty-dane-newly.ngrok-free.app/api/v2/messages/image/${message.companyId}/${message.chatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: message.mediaUrl, caption: message.message })
      });
    }else if (message.documentUrl != '') {
      await fetch(`https://mighty-dane-newly.ngrok-free.app/api/v2/messages/document/${message.companyId}/${message.chatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          documentUrl: message.documentUrl, 
          filename: message.fileName, 
          caption: message.message 
        })
      });
    }else if (message.message) {
      await fetch(`https://mighty-dane-newly.ngrok-free.app/api/v2/messages/text/${message.companyId}/${message.chatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.message })
      });
    }
    // Example: Sending a document message
    
    // Example: Sending a text message
    

    
  }else{
    //Example: Sending an image message
    if (message.mediaUrl != '') {
      await fetch(`https://mighty-dane-newly.ngrok-free.app/api/messages/image/${message.whapiToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: message.chatId,imageUrl: message.mediaUrl, caption: message.message })
      });
    }else if (message.documentUrl != '') {
      await fetch(`https://mighty-dane-newly.ngrok-free.app/api/messages/document/${message.whapiToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          chatId: message.chatId,
          documentUrl: message.documentUrl, 
          filename: message.fileName, 
          caption: message.message 
        })
      });
    }else if (message.message) {
      await fetch(`https://mighty-dane-newly.ngrok-free.app/api/messages/text/${message.chatId}/${message.whapiToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.message })
      });
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
    const scheduledMessagesSnapshot = await companyDoc.ref.collection('scheduledMessages').get();

    for (const doc of scheduledMessagesSnapshot.docs) {
      const message = doc.data();
      const delay = message.scheduledTime.toDate().getTime() - Date.now();

      // Calculate the number of batches
      const totalContacts = message.chatIds.length;
      const batchSize = message.batchQuantity || totalContacts;
      const numberOfBatches = Math.ceil(totalContacts / batchSize);

      // Base job options
      const baseJobOptions = { 
        removeOnComplete: false,
        removeOnFail: false
      };

      // Create a job for each batch
      for (let batchIndex = 0; batchIndex < numberOfBatches; batchIndex++) {
        const batchDelay = delay + (batchIndex * message.repeatInterval * getMillisecondsForUnit(message.repeatUnit));
        const startIndex = batchIndex * batchSize;
        const endIndex = Math.min((batchIndex + 1) * batchSize, totalContacts);
        const batchChatIds = message.chatIds.slice(startIndex, endIndex);

        const jobId = `${doc.id}_batch_${batchIndex}`;
        const jobOptions = {
          ...baseJobOptions,
          delay: Math.max(batchDelay, 0),
          jobId: jobId
        };

        // Check if the job already exists in the queue
        const existingJob = await messageQueue.getJob(jobId);
        if (!existingJob) {
          await messageQueue.add('send-message-batch', 
            { ...message, id: jobId, chatIds: batchChatIds }, 
            jobOptions
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

function setupMessageHandler(client, botName) {
  client.on('message', async (msg) => {
      console.log(`DEBUG: Message received for bot ${botName}`);
      try {
          // Check if there's a custom handler for this bot
          if (customHandlers[botName]) {
              await customHandlers[botName](client, msg, botName);
          } else {
              // Use the default template handler if no custom handler is defined
              await handleNewMessagesTemplateWweb(client, msg, botName);
          }
      } catch (error) {
          console.error(`ERROR in message handling for bot ${botName}:`, error);
      }
  });
}

console.log('Server starting - version 2'); // Add this line at the beginning of the file

async function saveContactWithRateLimit(botName, contact, chat, retryCount = 0) {
    const maxRetries = 5;
    const baseDelay = 1000; // 1 second base delay

    try {
        const phoneNumber = contact.id.user;
        const msg = chat.lastMessage || {};
        if(msg == {}){
          return;
        }
      
        let type = msg.type === 'chat' ? 'text' : msg.type;
        if(phoneNumber == 'status'){
          return;
        }
        const contactData = {
            additionalEmails: [],
            address1: null,
            assignedTo: null,
            businessId: null,
            phone: '+'+phoneNumber,
            tags:['stop bot'],
            chat: {
                contact_id: '+'+phoneNumber,
                id: msg.from || contact.id.user + '@c.us',
                name: contact.name || contact.pushname || phoneNumber,
                not_spam: true,
                tags: ['stop bot'], // You might want to populate this with actual tags if available
                timestamp: chat.timestamp || Date.now(),
                type: 'contact',
                unreadCount: chat.unreadCount || 0,
                last_message: {
                    chat_id:contact.id.user + '@c.us' ,
                    from: msg.from || contact.id.user + '@c.us',
                    from_me: msg.fromMe || false,
                    id: msg._data?.id?.id || '',
                    source: chat.deviceType || '',
                    status: "delivered",
                    text: {
                      body:msg.body || ''
                    },
                    timestamp: chat.timestamp || Date.now(),
                    type: type || '',
                },
            },
            chat_id: contact.id.user + '@c.us',
            city: null,
            companyName: null,
            contactName: contact.name || contact.pushname || phoneNumber,
            threadid: '', // You might want to generate or retrieve this
            last_message: {
                chat_id:contact.id.user + '@c.us',
                from: msg.from || contact.id.user + '@c.us',
                from_me: msg.fromMe || false,
                id: msg._data?.id?.id || '',
                source: chat.deviceType || '',
                status: "delivered",
                text: {
                  body:msg.body || ''
                },
                timestamp: chat.timestamp || Date.now(),
                type: type || '',
            },
        };
        const contactRef = db.collection('companies').doc(botName).collection('contacts').doc('+' + phoneNumber);
        await contactRef.set(contactData, { merge: true });
        const messages = await chat.fetchMessages({ limit: 100 });

        // Save messages
        if (messages && messages.length > 0) {
          // Sort messages by timestamp in ascending order
          const sortedMessages = messages.sort((a, b) => {
            const timestampA = a.timestamp ? new Date(a.timestamp * 1000).getTime() : 0;
            const timestampB = b.timestamp ? new Date(b.timestamp * 1000).getTime() : 0;
            return timestampA - timestampB;
          });
        
          const messagesRef = contactRef.collection('messages');
          let batch = db.batch();
          let count = 0;
          
          for (const message of sortedMessages) {
            let type2 = message.type === 'chat' ? 'text' : message.type;

            //console.log(message);
            const messageData = {
              chat_id: message.from,
              from: message.from ?? "",
              from_me: message.fromMe ?? false,
              id: message.id._serialized ?? "",
              source: message.deviceType ?? "",
              status: "delivered",
              timestamp: message.timestamp ?? 0,
              type: type2,
              ack: message.ack ?? 0,
            };

            // Handle different message types
            switch (type2) {
              case 'text':
                messageData.text = { body: message.body ?? "" };
                break;
              case 'image':
              case 'video':
              case 'document':
                if (message.hasMedia) {
                  try {
                    const media = await message.downloadMedia();
                    if (media) {
                      const url = await saveMediaLocally(media.data, media.mimetype, media.filename || `${type2}.${media.mimetype.split('/')[1]}`);
                      messageData[type2] = {
                        mimetype: media.mimetype,
                        url: url,
                        filename: media.filename ?? "",
                        caption: message.body ?? "",
                      };
                      if (type2 === 'image') {
                        messageData[type2].width = message._data.width;
                        messageData[type2].height = message._data.height;
                      }
                    } else {
                      console.log(`Failed to download media for message: ${message.id._serialized}`);
                      messageData.text = { body: "Media not available" };
                    }
                  } catch (error) {
                    console.error(`Error handling media for message ${message.id._serialized}:`, error);
                    messageData.text = { body: "Error handling media" };
                  }
                } else {
                  messageData.text = { body: "Media not available" };
                }
                break;
              default:
                messageData.text = { body: message.body ?? "" };
            }

            const messageDoc = messagesRef.doc(message.id._serialized);
            batch.set(messageDoc, messageData, { merge: true });

            count++;
            if (count >= 500) {
              // Firestore batches are limited to 500 operations
              await batch.commit();
              batch = db.batch();
              count = 0;
            }

            // Send progress update after each message
            broadcastProgress(botName, 'saving_contacts', count / sortedMessages.length);
          }
        
          if (count > 0) {
            await batch.commit();
          }
          if(phoneNumber == '601121677522'){
      
            //console.log(sortedMessages);
  
          }
          //console.log(`Saved ${sortedMessages.length} messages for contact ${phoneNumber}`);
        }
        
        // Send final progress update for this contact
        broadcastProgress(botName, 'saving_contacts', 1);

        //console.log(`Saved contact ${phoneNumber} for bot ${botName}`);
        
        // Delay before next operation
        await customWait(baseDelay);
    } catch (error) {
        console.error(`Error saving contact for bot ${botName}:`, error);
        
        if (retryCount < maxRetries) {
            const retryDelay = baseDelay * Math.pow(2, retryCount);
            console.log(`Retrying in ${retryDelay}ms...`);
            await delay(retryDelay);
            await saveContactWithRateLimit(botName, contact, chats, retryCount + 1);
        } else {
            console.error(`Failed to save contact after ${maxRetries} retries`);
        }
    }
}

// async function initializeBot(botName, retryCount = 0) {
//     const maxRetries = 3;
//     const retryDelay = 5000; // 5 seconds

//     try {
//         console.log(`DEBUG: Starting initialization for ${botName}`);
//         const client = new Client({
//             authStrategy: new LocalAuth({
//                 clientId: botName,
//             }),
//             puppeteer: { 
//                 args: ['--no-sandbox', '--disable-setuid-sandbox'],
//                 headless: true,
//                 timeout: 60000 // 60 seconds timeout
//             }
//         });
//         botMap.set(botName, { client, status: 'initializing', qrCode: null });

//         // Set up event listeners
//         client.on('qr', async (qr) => {
//             console.log(`${botName} - QR RECEIVED`);
//             try {
//                 const qrCodeData = await qrcode.toDataURL(qr);
//                 botMap.set(botName, { client, status: 'qr', qrCode: qrCodeData });
//                 broadcastAuthStatus(botName, 'qr', qrCodeData);
//             } catch (err) {
//                 console.error(`Error generating QR code for ${botName}:`, err);
//             }
//         });

//         client.on('authenticated', () => {
//             console.log(`${botName} - AUTHENTICATED`);
//             botMap.set(botName, { client, status: 'authenticated', qrCode: null });
//             broadcastAuthStatus(botName, 'authenticated');
//         });

//         client.on('ready', async () => {
//             console.log(`${botName} - READY`);
//             botMap.set(botName, { client, status: 'ready', qrCode: null });
//             setupMessageHandler(client, botName);
//         });

//         client.on('auth_failure', msg => {
//             console.error(`${botName} - AUTHENTICATION FAILURE`, msg);
//             botMap.set(botName, { client, status: 'auth_failure', qrCode: null });
//         });

//         client.on('disconnected', (reason) => {
//             console.log(`${botName} - DISCONNECTED:`, reason);
//             botMap.set(botName, { client, status: 'disconnected', qrCode: null });
//         });

//         await client.initialize();
//         console.log(`DEBUG: Bot ${botName} initialized successfully`);
//     } catch (error) {
//         console.error(`Error initializing bot ${botName}:`, error);
//         botMap.set(botName, { client: null, status: 'error', qrCode: null, error: error.message });
        
//         if (retryCount < maxRetries) {
//             console.log(`Retrying initialization for ${botName} in ${retryDelay / 1000} seconds...`);
//             setTimeout(() => initializeBot(botName, retryCount + 1), retryDelay);
//         } else {
//             console.error(`Failed to initialize ${botName} after ${maxRetries} attempts`);
//         }
//     }
// }

async function processChats(client, botName) {
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
            await saveContactWithRateLimit(botName, contact, chat);
            processedChats++;
            
            broadcastProgress(botName, 'processing_chats', processedChats / totalChats);
        }
        console.log(`Finished saving contacts for bot ${botName}`);
    } catch (error) {
        console.error(`Error processing chats for bot ${botName}:`, error);
    }
}

async function initializeBots(botNames) {
  for (let i = 0; i < botNames.length; i++) {
      const botName = botNames[i];
    console.log('Initializing bot ${i + 1}/${botNames.length}: ${botName}');
      await initializeBot(botName);
      console.log('Bot ${botName} initialized');
  }
}

async function main(reinitialize = false) {
  console.log('Initialization starting...');

  console.log('Fetching companies...');
  const companiesRef = db.collection('companies');
  const snapshot = await companiesRef.get();
  
  const botNames = [];

  snapshot.forEach(doc => {
      const companyId = doc.id;    
      const data = doc.data();
      if (data.v2) {
          botNames.push(companyId);
      }
  });
  console.log(`Found ${botNames.length} bots to initialize`);

  if (reinitialize) {
      console.log('Reinitializing, clearing existing bot instances...');
      for (const [botName, botData] of botMap.entries()) {
          if (botData.client) {
              await botData.client.destroy();
          }
      }
      botMap.clear();
  }

  console.log('Obliterating all jobs...');
  await obiliterateAllJobs();
  
  // Run the check immediately when the server starts
  console.log('Checking for new rows msu...');
  checkAndProcessNewRows('1_rW9VE-B6nT52aXiK6YhY8728sSawqSp0LIUiRCK5RA','Sheet1!A:S','001');
  
  console.log('Initializing bots...');
  await initializeBots(botNames);

  console.log('Scheduling all messages...');
  await scheduleAllMessages();

  console.log('Initialization complete');
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
  async function getContact(number) {
    const options = {
        method: 'GET',
        url: 'https://services.leadconnectorhq.com/contacts/search/duplicate',
        params: {
            locationId: ghlConfig.ghl_location,
            number: number
        },
        headers: {
          Authorization: `Bearer ${ghlConfig.ghl_accessToken}`,
          Version: '2021-07-28',
          Accept: 'application/json'
        }
    };

    try {
      const response = await limiter.schedule(() => axios.request(options));
      return(response.data.contact);
    } catch (error) {
        console.error(error);
    }
}

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

async function createContact(name, number) {
  // Validate phone number length (assuming a maximum length of 15 characters for international phone numbers)
  if (number.length > 15) {
      console.log('Error: The phone number is too long');
      return;
  }

  const options = {
      method: 'POST',
      url: 'https://services.leadconnectorhq.com/contacts/',
      headers: {
          Authorization: `Bearer ${ghlConfig.ghl_accessToken}`,
          Version: '2021-07-28',
          'Content-Type': 'application/json',
          Accept: 'application/json'
      },
      data: {
          firstName: name,
          name: name,
          locationId: ghlConfig.ghl_location,
          phone: number,
      }
  };

  const maxRetries = 5;
  let attempt = 0;
  const delay = 10000; // Delay of 5 seconds before each request
  await new Promise(res => setTimeout(res, delay)); // Delay before making the request
  while (attempt < maxRetries) {
      try {
         
          await axios.request(options);
          console.log('Contact created successfully');
          return;
      } catch (error) {
          if (error.response && error.response.status === 429) {
              const retryAfter = error.response.headers['retry-after'] || 10; // Fallback to 10 seconds if no header is provided
              attempt++;
              await new Promise(res => setTimeout(res, retryAfter * 10000));
          } else {
              throw error;
          }
      }
  }
  console.error('Failed to create contact after maximum retries');
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
    //console.log(botData);
    if (botData) {
        const { status, qrCode } = botData;
        res.json({ status, qrCode });
    } else {
        res.status(404).json({ error: 'Bot status not available' });
    }
});

app.post('/api/v2/messages/text/:companyId/:chatId', async (req, res) => {
  console.log('send message');
  const companyId = req.params.companyId;
  const chatId = req.params.chatId;
  const { message, quotedMessageId } = req.body;
  console.log(req.body);
  console.log(message)
  try {
    // 1. Get the client for this company from botMap
    const botData = botMap.get(companyId);
    if (!botData || !botData.client) {
      return res.status(404).send('WhatsApp client not found for this company');
    }
    const client = botData.client;

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
      ack: sentMessage.ack ?? 0,
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
  const { imageUrl, caption } = req.body;
  console.log(req.body);

  try {
    // 1. Get the client for this company from botMap
    const botData = botMap.get(companyId);
    if (!botData || !botData.client) {
      return res.status(404).send('WhatsApp client not found for this company');
    }
    const client = botData.client;

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
        url: imageUrl,
        caption: caption ?? "",
      },
      timestamp: sentMessage.timestamp ?? 0,
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
  const { documentUrl, filename, caption } = req.body;
  console.log(req.body);

  try {
    // 1. Get the client for this company from botMap
    const botData = botMap.get(companyId);
    if (!botData || !botData.client) {
      return res.status(404).send('WhatsApp client not found for this company');
    }
    const client = botData.client;

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
        url: documentUrl,
        filename: filename,
        caption: caption ?? "",
      },
      timestamp: sentMessage.timestamp ?? 0,
      type: 'document',
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

async function fetchProjectId(token) {
  try {
    const response = await axios.get('https://manager.whapi.cloud/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    //console.log(response.data);
    const projectId = response.data.projects[0].id;
    return projectId;
  } catch (error) {
    console.error(`Error fetching project ID:`, error);
    throw error;
  }
}

async function customWait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function createChannel(projectId, token, companyID) {
  try {
      const response = await axios.put('https://manager.whapi.cloud/channels', {
          projectId: projectId,
          name: companyID,
      }, {
          headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json'
          }
      });
   
      whapiToken = response.data.token
      // Get the companies collection
      const companiesCollection = db.collection('companies');
        

      // Save the whapiToken to a new document
      await companiesCollection.doc(companyID).set({
          whapiToken: whapiToken
      }, { merge: true });
      
      await customWait(60000);
      // Now call the webhook settings API
      await axios.patch('https://gate.whapi.cloud/settings', {
        webhooks: [
          {
            events: [
              {
                type: 'messages',
                method: 'post'
              },
              {
                type: 'statuses',
                method: 'post'
              }
            ],
            mode: 'method',
            url: `https://48ae-115-135-122-145.ngrok-free.app/${companyID}/template/hook`
          }
        ],
        callback_persist: true
      }, {
        headers: {
          Authorization: `Bearer ${whapiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      });
      //console.log(response.data);
      return response.data;
  } catch (error) {
      console.error(`Error creating channel for project ID ${projectId}:`, error);
      throw error;
  }
}

app.post('/api/channel/create/:companyID', async (req, res) => {
    const { companyID } = req.params;
//
    try {
        // Create the assistant
        await createAssistant(companyID);

        // Initialize only the new bot
        await initializeBot(companyID);

        res.json({ message: 'Channel created successfully and new bot initialized', newBotId: companyID });
    } catch (error) {
        console.error('Error creating channel and initializing new bot:', error);
        res.status(500).json({ error: 'Failed to create channel and initialize new bot', details: error.message });
    }
});

async function initializeBot(botName) {
    try {
      console.log(`Starting initialization for bot: ${botName}`);
        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: botName,
            }),
            puppeteer: { headless: true,executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',args: [
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
           ], }
          });
        botMap.set(botName, { client, status: 'initializing', qrCode: null });
        broadcastAuthStatus(botName, 'initializing');

        client.on('qr', async (qr) => {
            console.log(`${botName} - QR RECEIVED`);
            try {
                const qrCodeData = await qrcode.toDataURL(qr);
                botMap.set(botName, { client, status: 'qr', qrCode: qrCodeData });
                broadcastAuthStatus(botName, 'qr', qrCodeData); // Pass qrCodeData to broadcastAuthStatus
            } catch (err) {
                console.error('Error generating QR code:', err);
            }
        });

        client.on('authenticated', () => {
            console.log(`${botName} - AUTHENTICATED`);
            botMap.set(botName, { client, status: 'authenticated', qrCode: null });
            broadcastAuthStatus(botName, 'authenticated');
        });

        client.on('ready', async () => {
            console.log(`${botName} - READY`);
            botMap.set(botName, { client, status: 'ready', qrCode: null });
            setupMessageHandler(client, botName);

            // try {
            //     const chats = await client.getChats();
            //     const totalChats = chats.length;
            //     let processedChats = 0;

            //     for (const chat of chats) {
            //         if (chat.isGroup) {
            //             processedChats++;
            //             continue;
            //         }
            //         const contact = await chat.getContact();
            //         await saveContactWithRateLimit(botName, contact, chat);
            //         processedChats++;
                    
            //         // Send overall progress update
            //         broadcastProgress(botName, 'processing_chats', processedChats / totalChats);
            //     }
            //     console.log(`Finished saving contacts for bot ${botName}`);
            // } catch (error) {
            //     console.error(`Error processing chats for bot ${botName}:`, error);
            // }
        });

        client.on('auth_failure', msg => {
            console.error(`${botName} - AUTHENTICATION FAILURE`, msg);
            botMap.set(botName, { client, status: 'auth_failure', qrCode: null });
        });

        client.on('disconnected', (reason) => {
            console.log(`${botName} - DISCONNECTED:`, reason);
            botMap.set(botName, { client, status: 'disconnected', qrCode: null });
        });

        client.on('remote_session_saved', () => {
            console.log(`${botName} - REMOTE SESSION SAVED`);
        });

        await client.initialize();
        console.log(`Bot ${botName} initialization`);
        console.log(`DEBUG: Bot ${botName} initialized successfully`);
    } catch (error) {
        console.error(`Error initializing bot ${botName}:`, error);
        botMap.set(botName, { client: null, status: 'error', qrCode: null, error: error.message });
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

// Then schedule it to run every 5 minutes
cron.schedule('*/5 * * * *', () => {
  console.log('Checking for new rows in the spreadsheet...');
  checkAndProcessNewRows('1_rW9VE-B6nT52aXiK6YhY8728sSawqSp0LIUiRCK5RA','Sheet1!A:S','001');
});


