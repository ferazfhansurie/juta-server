const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
require('dotenv').config();
const cors = require('cors');
const app = express();
const admin = require('./firebase.js');
const axios = require('axios');
const cron = require('node-cron');
const WebSocket = require('ws');
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
const db = admin.firestore();
wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });
  
  function sendProgressUpdate(client, progress) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'progress', progress }));
    }
  }
  
  function broadcastProgress(progress) {
    wss.clients.forEach((client) => {
      sendProgressUpdate(client, progress);
    });
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
const { handleNewMessagesApplyRadar } = require('./bots/handleMessagesApplyRadar.js');



app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());// Middleware
// Serve static files from the 'public' directory
app.use(express.static('dist'));
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
app.post('/applyradar/hook/messages', handleNewMessagesApplyRadar);




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




