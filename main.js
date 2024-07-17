require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
//const qrcode = require('qrcode-terminal');
const qrcode = require('qrcode');
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const admin = require('./firebase.js');
const axios = require('axios');
const cron = require('node-cron');
const WebSocket = require('ws');
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
const db = admin.firestore();
const OpenAI = require('openai');

wss.on('connection', (ws) => {
    console.log('Client connected');
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


const { handleNewMessagesTemplateWweb } = require('./bots/handleMessagesTemplateWweb');
const { handleNewMessagesTemplateWweb2 } = require('./bots/handleMessagesTemplateWweb2');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());// Middleware
// Serve static files from the 'public' directory
app.use(express.static('dist'));
app.get('/', function (req, res) {
    res.send('Bot is running');
});
app.use(cors());

const botMap = new Map();


async function initializeBot(botName) {
    console.log(`DEBUG: Initializing bot: ${botName}`);
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: botName,
        }),
        puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });
    botMap.set(botName, { client, status: 'initializing', qrCode: null });

    //botStatusMap.set(botName, { isAuthenticated: false, qrCode: null });

    return new Promise((resolve, reject) => {
        client.on('qr', async (qr) => {
            console.log(`${botName} - QR RECEIVED`);
            try {
                const qrCodeData = await qrcode.toDataURL(qr);
                botMap.set(botName, { client, status: 'qr', qrCode: qrCodeData });
            } catch (err) {
                console.error('Error generating QR code:', err);
            }
        });

        client.on('authenticated', () => {
            console.log(`${botName} - AUTHENTICATED`);
            botMap.set(botName, { client, status: 'authenticated', qrCode: null });
        });

        client.on('auth_failure', msg => {
            console.error(`${botName} - AUTHENTICATION FAILURE`, msg);
            reject(new Error(`Authentication failed for ${botName}: ${msg}`));
        });

        client.on('ready', () => {
            console.log(`${botName} - READY`);
            botMap.set(botName, { client, status: 'ready', qrCode: null });
            setupMessageHandler(client, botName);
            resolve(client);
        });

        client.on('error', (error) => {
            console.error(`${botName} - CLIENT ERROR:`, error);
            reject(error);
        });

        console.log(`DEBUG: Initializing client for ${botName}`);
        client.initialize().catch(reject);
    });
}

function setupMessageHandler(client, botName) {
    client.on('message', async (msg) => {
        console.log(`DEBUG: Message received for bot ${botName}`);
        try {
            await handleNewMessagesTemplateWweb(client, msg, botName);
        } catch (error) {
            console.error(`ERROR in message handling for bot ${botName}:`, error);
        }
    });
}

async function initializeBots(botNames) {
    for (const botName of botNames) {
        try {
            console.log(`DEBUG: Starting initialization for ${botName}`);
            await initializeBot(botName);
            console.log(`DEBUG: Bot ${botName} initialized successfully`);
        } catch (error) {
            console.error(`Error initializing bot ${botName}:`, error);
        }
    }
}

async function main(reinitialize = false) {
    const companiesRef = db.collection('companies');
    const snapshot = await companiesRef.get();
    
    const botNames = [];

    snapshot.forEach(doc => {
        const companyId = doc.id;
        const data = doc.data();
        if (data.assistantId) {
            botNames.push(companyId);
        }
    });
    console.log(botNames);
    if (reinitialize) {
        // Clear existing bot instances
        for (const [botName, botData] of botMap.entries()) {
            if (botData.client) {
                await botData.client.destroy();
            }
        }
        botMap.clear();
    }

    await initializeBots(botNames);
}

app.post('/api/channel/create/:companyID', async (req, res) => {
    const { companyID } = req.params;

    try {
        await createAssistant(companyID);

        // Add new bot to the map
        botMap.set(companyID, { client: null, status: 'pending', qrCode: null });

        // Reinitialize all bots including the new one
        await main(true);

        res.json({ message: 'Channel created successfully and bots reinitialized', newBotId: companyID });
    } catch (error) {
        console.error('Error creating channel and reinitializing bots:', error);
        res.status(500).json({ error: 'Failed to create channel and reinitialize bots', details: error.message });
    }
});

main();

const port = process.env.PORT;
server.listen(port, function () {
    console.log(`Server is running on port ${port}`);
});

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

async function createUserInFirebase(userData) {
    try {
      const userRecord = await admin.auth().createUser(userData);
  
      return userRecord.uid;
    } catch (error) {

      throw error;
    }
  }

  // Modify the API route to get the QR code or authentication status
app.get('/api/bot-status/:botName', (req, res) => {
    const { botName } = req.params;
    const status = botStatusMap.get(botName);
    
    if (status) {
        res.json(status);
    } else {
        res.status(404).json({ error: 'Bot status not available' });
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
      console.log(metaTotal);
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
      console.log(filteredContacts.length);
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
      console.log(filteredContacts.length);
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
        console.log(firestoreMessages);
        const whapiMessages = whapiMessagesData.messages.map(whapiMsg => {
          const firestoreMessage = firestoreMessages[whapiMsg.id];
          if (firestoreMessage) {
            console.log('found');
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
    console.log(response);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(error);
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
    console.log(response.data);
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
      console.log(response.data);
      return response.data;
  } catch (error) {
      console.error(`Error creating channel for project ID ${projectId}:`, error);
      throw error;
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
          assistantId: assistantId
      }, { merge: true });
   return;
    
  } catch (error) {
    console.error('Error creating OpenAI assistant:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to create assistant' });
  }
}