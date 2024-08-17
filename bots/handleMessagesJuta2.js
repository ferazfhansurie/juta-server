// handleMessagesTemplateWweb.js

//STEP BY STEP GUIDE
//1. CHANGE all handleMessagesTemplate to -> handleMessages<YourBotName>
//2. CHANGE all idSubstring to firebase collection name
//3. CHANGE all <assistant> to openai assistant id
//4. CHANGE all Template to your <YourBotName>

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

let ghlConfig = {};
const MEDIA_DIR = path.join(__dirname, 'public', 'media');
// Schedule the task to run every 12 hours

const openai = new OpenAI({
    apiKey: process.env.OPENAIKEY,
});

const steps = {
    START: 'start',
};
const userState = new Map();

// Add this object to store tasks
const userTasks = new Map();

// Function to add a task
async function addTask(userId, taskString) {
    if (!userTasks.has(userId)) {
        userTasks.set(userId, []);
    }
    const task = {
        text: taskString,
        status: 'In Progress',
        createdAt: new Date()
    };
    userTasks.get(userId).push(task);
    return `Task added: ${taskString}`;
}

// Function to list tasks
async function listTasks(userId) {
    if (!userTasks.has(userId) || userTasks.get(userId).length === 0) {
        return "You have no tasks.";
    }
    return userTasks.get(userId).map((task, index) => 
        `${index + 1}. [${task.status}] ${task.text}`
    ).join('\n');
}

// Function to update task status
async function updateTaskStatus(userId, taskIndex, newStatus) {
    if (!userTasks.has(userId) || taskIndex < 0 || taskIndex >= userTasks.get(userId).length) {
        return "Invalid task number.";
    }
    userTasks.get(userId)[taskIndex].status = newStatus;
    return `Task "${userTasks.get(userId)[taskIndex].text}" status updated to ${newStatus}.`;
}

// Function to send task reminders (only for In Progress tasks)
async function sendTaskReminders(client) {
    for (const [userId, tasks] of userTasks.entries()) {
        const inProgressTasks = tasks.filter(task => task.status === 'In Progress');
        if (inProgressTasks.length > 0) {
            const reminderMessage = "Reminder of your in-progress tasks:\n" + 
                inProgressTasks.map((task, index) => `${index + 1}. ${task.text}`).join('\n');
            await client.sendMessage(userId, reminderMessage);
        }
    }
}

// Schedule task reminders
function scheduleTaskReminders(client) {
    // Schedule for 9 AM and 3 PM Kuala Lumpur time
    cron.schedule('0 9,15 * * *', () => {
        sendTaskReminders(client);
    }, {
        timezone: "Asia/Kuala_Lumpur"
    });
}

async function customWait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function addNotificationToUser(companyId, message) {
    console.log('noti');
    try {
        // Find the user with the specified companyId
        const usersRef = db.collection('user');
        const querySnapshot = await usersRef.where('companyId', '==', companyId).get();

        if (querySnapshot.empty) {
            console.log('No matching documents.');
            return;
        }

        // Filter out undefined values from the message object
        const cleanMessage = Object.fromEntries(
            Object.entries(message).filter(([_, value]) => value !== undefined)
        );

        // Add the new message to the notifications subcollection of the user's document
        querySnapshot.forEach(async (doc) => {
            const userRef = doc.ref;
            const notificationsRef = userRef.collection('notifications');
            const updatedMessage = { ...cleanMessage, read: false };
        
            await notificationsRef.add(updatedMessage);
            console.log(`Notification ${updatedMessage} added to user with companyId: ${companyId}`);
        });
    } catch (error) {
        console.error('Error adding notification: ', error);
    }
}


async function getChatMetadata(chatId,) {
    const url = `https://gate.whapi.cloud/chats/${chatId}`;
    const headers = {
        'Authorization': `Bearer ${ghlConfig.whapiToken}`,
        'Accept': 'application/json'
    };

    try {
        const response = await axios.get(url, { headers });
        return response.data;
    } catch (error) {
        console.error('Error fetching chat metadata:', error.response.data);
        throw error;
    }
}

const messageQueue = new Map();
const MAX_QUEUE_SIZE = 5;
const RATE_LIMIT_DELAY = 5000; // 5 seconds
// Add this function to create a Google Calendar event using service account
async function createGoogleCalendarEvent(summary, description, startDateTime, endDateTime) {
    try {
      console.log('Initializing Google Auth...');
      const auth = new google.auth.GoogleAuth({
        keyFile: './service_account.json',
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });
  
      console.log('Creating calendar client...');
      const calendar = google.calendar({ version: 'v3', auth });
  
      const event = {
        summary,
        description,
        start: {
          dateTime: startDateTime,
          timeZone: 'Asia/Kuala_Lumpur',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'Asia/Kuala_Lumpur',
        },
      };
  
      console.log('Sending request to create event...');
      const response = await calendar.events.insert({
        calendarId: '2f87e8d1a4152b5b437b6a11a2aa8e008bb03e9aa5c43aa6d1f8f40c0a1ea038@group.calendar.google.com',
        resource: event,
      });
  
      console.log('Event created successfully:', response.data.htmlLink);
      

      // Generate a Google Meet link
      await scheduleReminderMessage(summary, startDateTime, '120363178065670386@g.us');

      // Update the event description to include the Meet link
      const updatedDescription = `${description}\n\nJoin the meeting: `;
      await calendar.events.patch({
        calendarId: '2f87e8d1a4152b5b437b6a11a2aa8e008bb03e9aa5c43aa6d1f8f40c0a1ea038@group.calendar.google.com',
        eventId: response.data.id,
        resource: {
          description: updatedDescription,
        },
      });
      

      return {
        eventLink: response.data.htmlLink,
      };
    } catch (error) {
      console.error('Error in createGoogleCalendarEvent:');
      if (error.response) {
        console.error('Response error data:', error.response.data);
        console.error('Response error status:', error.response.status);
      } else if (error.request) {
        console.error('Request error:', error.request);
      } else {
        console.error('Error message:', error.message);
      }
      console.error('Error stack:', error.stack);
      throw new Error(`Failed to create Google Calendar event: ${error.message}`);
    }
  }

  async function scheduleReminderMessage(eventSummary, startDateTime, chatId) {
    const reminderTime = moment(startDateTime).subtract(15, 'minutes');
    const reminderMessage = `Reminder: "${eventSummary}" is starting in 15 minutes.`;
  
    // Convert to seconds and ensure it's an integer
    const scheduledTimeSeconds = Math.floor(reminderTime.valueOf() / 1000);
  
    console.log('Scheduling reminder for:', reminderTime.format());
    console.log('Scheduled time in seconds:', scheduledTimeSeconds);
    
      const scheduledMessage = {
        batchQuantity: 1,
        chatIds: [chatId],
        companyId: "001", // Assuming this is the correct company ID
        createdAt: admin.firestore.Timestamp.now(),
        documentUrl: "",
        fileName: null,
        mediaUrl: "",
        message: reminderMessage,
        mimeType: null,
        repeatInterval: 0,
        repeatUnit: "days",
        scheduledTime: {
            seconds: scheduledTimeSeconds,
            nanoseconds: 0
          },
        status: "scheduled",
        v2: true,
        whapiToken: null
      };
  
    try {
      console.log('Sending schedule request:', JSON.stringify(scheduledMessage));
      const response = await axios.post(`http://localhost:8443/api/schedule-message/001`, scheduledMessage);
      console.log('Reminder scheduled successfully:', response.data);
    } catch (error) {
      console.error('Error scheduling reminder:', error.response ? error.response.data : error.message);
      if (error.response && error.response.data) {
        console.error('Server response:', error.response.data);
      }
    }
  }

  function getTodayDate() {
    return moment().tz('Asia/Kuala_Lumpur').format('YYYY-MM-DD');
  }
async function saveMediaLocally(base64Data, mimeType, filename) {
    const writeFileAsync = util.promisify(fs.writeFile);
    const buffer = Buffer.from(base64Data, 'base64');
    const uniqueFilename = `${uuidv4()}_${filename}`;
    const filePath = path.join(MEDIA_DIR, uniqueFilename);
    
    await writeFileAsync(filePath, buffer);
  
    // Return the URL path to access this filez
    return `/media/${uniqueFilename}`;
  }
  
async function handleNewMessagesJuta2(client, msg, botName) {
    console.log('Handling new Messages '+botName);

    //const url=req.originalUrl

    // Find the positions of the '/' characters
    //const firstSlash = url.indexOf('/');
    //const secondSlash = url.indexOf('/', firstSlash + 1);

    // Extract the substring between the first and second '/'
    //const idSubstring = url.substring(firstSlash + 1, secondSlash);
    const idSubstring = botName;
    try {

        // Initial fetch of config
        await fetchConfigFromDatabase(idSubstring);

        // Set up the daily report schedule
        scheduleDailyReport(client, idSubstring);

        // Set up task reminders
        scheduleTaskReminders(client);

        //const receivedMessages = req.body.messages;
            

            const sender = {
                to: msg.from,
                name:msg.notifyName,
            };

            const extractedNumber = '+'+(sender.to).split('@')[0];

            if (msg.fromMe){
                await addMessagetoFirebase(msg, idSubstring, extractedNumber);
                return;
            }
            
            let contactID;
            let contactName;
            let threadID;
            let query;
            let answer;
            let parts;
            let currentStep;
            const chat = await msg.getChat();
            const contactData = await getContactDataFromDatabaseByPhone(extractedNumber, idSubstring);
            let unreadCount = 0;
            let stopTag = contactData?.tags || [];
            const contact = await chat.getContact();

            
            console.log(contactData);
            if (contactData !== null) {
                if(contactData.tags){
                    stopTag = contactData.tags;
                    console.log(stopTag);
                        unreadCount = contactData.unreadCount ?? 0;
                        contactID = extractedNumber;
                        contactName = contactData.contactName ?? contact.pushname ?? extractedNumber;
                    
                        if (contactData.threadid) {
                            threadID = contactData.threadid;
                        } else {
                            const thread = await createThread();
                            threadID = thread.id;
                            await saveThreadIDFirebase(contactID, threadID, idSubstring)
                            //await saveThreadIDGHL(contactID,threadID);
                        }
                    
                }else{
                    contactID = extractedNumber;
                    contactName = contactData.contactName ?? msg.pushname ?? extractedNumber;
                    if (contactData.threadid) {
                        threadID = contactData.threadid;
                    } else {
                        const thread = await createThread();
                        threadID = thread.id;
                        await saveThreadIDFirebase(contactID, threadID, idSubstring)
                        //await saveThreadIDGHL(contactID,threadID);
                    } 
                }
         
            }else{
                
                await customWait(2500); 

                contactID = extractedNumber;
                contactName = contact.pushname || contact.name || extractedNumber;
                client.sendMessage('120363178065670386@g.us', 'New Lead '+contactName +' '+contactID);

                const thread = await createThread();
                threadID = thread.id;
                console.log(threadID);
                await saveThreadIDFirebase(contactID, threadID, idSubstring)
                console.log('sent new contact to create new contact');
            }   
            let firebaseTags = ['']
            if (contactData) {
                firebaseTags = contactData.tags ?? [];
                // Remove 'snooze' tag if present
                if(firebaseTags.includes('snooze')){
                    firebaseTags = firebaseTags.filter(tag => tag !== 'snooze');
                }
            } else {
                if ((sender.to).includes('@g.us')) {
                    firebaseTags = ['stop bot']
                }
            }

        
            
            let type = '';
            if(msg.type === 'chat'){
                type ='text'
              }else{
                type = msg.type;
              }
            
            if(extractedNumber.includes('status')){
                return;
            }

            // First, let's handle the transcription if it's an audio message
            let messageBody = msg.body;
            let audioData = null;

            if (msg.hasMedia && msg.type === 'audio') {
                console.log('Voice message detected');
                const media = await msg.downloadMedia();
                const transcription = await transcribeAudio(media.data);
                console.log('Transcription:', transcription);
                
                messageBody = transcription;
                audioData = media.data;
                console.log(msg);
            }
         
            const data = {
                additionalEmails: [],
                address1: null,
                assignedTo: null,
                businessId: null,
                phone: extractedNumber,
                tags: firebaseTags,
                createdAt: admin.firestore.Timestamp.now(),
                chat: {
                    contact_id: extractedNumber,
                    id: msg.from,
                    name: contactName || contact.name || contact.pushname || extractedNumber,
                    not_spam: true,
                    tags: firebaseTags,
                    timestamp: chat.timestamp || Date.now(),
                    type: 'contact',
                    unreadCount: 0,
                    last_message: {
                        chat_id: msg.from,
                        from: msg.from ?? "",
                        from_me: msg.fromMe ?? false,
                        id: msg.id._serialized ?? "",
                        source: chat.deviceType ?? "",
                        status: "delivered",
                        text: {
                            body: messageBody ?? ""
                        },
                        timestamp: msg.timestamp ?? 0,
                        type:type,
                    },
                },
                chat_id: msg.from,
                city: null,
                companyName: null,
                contactName: contactName || contact.name || contact.pushname || extractedNumber,
                unreadCount: unreadCount + 1,
                threadid: threadID ?? "",
                last_message: {
                    chat_id: msg.from,
                    from: msg.from ?? "",
                    from_me: msg.fromMe ?? false,
                    id: msg.id._serialized ?? "",
                    source: chat.deviceType ?? "",
                    status: "delivered",
                    text: {
                        body: messageBody ?? ""
                    },
                    timestamp: msg.timestamp ?? 0,
                    type: type,
                },
            };

            if (contact.getProfilePicUrl()) {
                try {
                    data.profilePicUrl = await contact.getProfilePicUrl();
                    console.log('profile pic url: '+data.profilePicUrl)
                } catch (error) {
                    console.error(`Error getting profile picture URL for ${contact.id.user}:`, error);
                    contactData.profilePicUrl = "";
                }
            }

            const messageData = {
                chat_id: msg.from,
                from: msg.from ?? "",
                from_me: msg.fromMe ?? false,
                id: msg.id._serialized ?? "",
                source: chat.deviceType ?? "",
                status: "delivered",
                text: {
                    body: messageBody ?? ""
                },
                timestamp: msg.timestamp ?? 0,
                type: type,
            };
            
            if((sender.to).includes('@g.us')){
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
                                filename: media.filename ?? "",
                                caption: msg.body ?? "",
                                width: msg._data.width,
                                height: msg._data.height
                            };
                        } else {
                            messageData[msg.type] = {
                                mimetype: media.mimetype,
                                data: media.data,  // This is the base64-encoded data
                                filename: media.filename ?? "",
                                caption: msg.body ?? "",
                            };
                        }
                        if (media.filesize) {
                            messageData[msg.type].filesize = media.filesize;
                        }
                    } else {
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
            console.log(msg);
            await addNotificationToUser(idSubstring, messageData);

            // Add the data to Firestore
            await db.collection('companies').doc(idSubstring).collection('contacts').doc(extractedNumber).set(data, {merge: true});    
           
            if (msg.fromMe){
                if(stopTag.includes('idle')){
                }
                return;
            }
            if(stopTag.includes('stop bot')){
                console.log('Bot stopped for this message');
                return;
            }

            //reset bot command
            if (msg.body.includes('/resetbot')) {
                const thread = await createThread();
                threadID = thread.id;
                await saveThreadIDFirebase(contactID, threadID, idSubstring)
                //await saveThreadIDGHL(contactID,threadID);
                client.sendMessage(msg.from, 'Bot is now restarting with new thread.');
                //await sendWhapiRequest('messages/text', { to: sender.to, body: "Bot is now restarting with new thread." });
                return;
            }

            //test bot command
            if (msg.body.includes('/hello')) {
                
                client.sendMessage(msg.from, 'tested.');
                //await sendWhapiRequest('messages/text', { to: sender.to, body: "Bot is now restarting with new thread." });
                return;
            }
            if(ghlConfig.stopbot){
                if(ghlConfig.stopbot == true){
                    console.log('bot stop all');
                    return;
                }
            }
            if(firebaseTags !== undefined){
                if(firebaseTags.includes('stop bot')){
                    console.log('bot stop');
                return;
                }
            }

            currentStep = userState.get(sender.to) || steps.START;
            switch (currentStep) {
                case steps.START:
                    var context = "";

                    query = `${messageBody} user_name: ${contactName} `;
                 
                     // Handle task-related commands
            if (messageBody.toLowerCase().startsWith('task:')) {
                const task = messageBody.slice(5).trim();
                const response = await addTask(sender.to, task);
                await client.sendMessage(msg.from, response);
            } else if (messageBody.toLowerCase() === 'tasks') {
                const tasks = await listTasks(sender.to);
                await client.sendMessage(msg.from, tasks);
            } else if (messageBody.toLowerCase().startsWith('done:')) {
                const taskIndex = parseInt(messageBody.slice(5).trim()) - 1;
                const response = await updateTaskStatus(sender.to, taskIndex, 'Done');
                await client.sendMessage(msg.from, response);
            } else if (messageBody.toLowerCase().startsWith('progress:')) {
                const taskIndex = parseInt(messageBody.slice(9).trim()) - 1;
                const response = await updateTaskStatus(sender.to, taskIndex, 'In Progress');
                await client.sendMessage(msg.from, response);
            } else {
                answer= await handleOpenAIAssistant(query,threadID,firebaseTags);
                parts = answer.split(/\s*\|\|\s*/);
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i].trim();   
                    const check = part.toLowerCase();
                    if (part) {
                        //await addtagbookedGHL(contactID, 'idle');
                        //await sendWhapiRequest('messages/text', { to: sender.to, body: part });
                        const sentMessage = await client.sendMessage(msg.from, part);

                        // Save the message to Firebase
                        const sentMessageData = {
                            chat_id: sentMessage.from,
                            from: sentMessage.from ?? "",
                            from_me: true,
                            id: sentMessage.id._serialized ?? "",
                            source: sentMessage.deviceType ?? "",
                            status: "delivered",
                            text: {
                                body: part
                            },
                            timestamp: sentMessage.timestamp ?? 0,
                            type: 'text',
                            ack: sentMessage.ack ?? 0,
                        };

                        const messageDoc = messagesRef.doc(sentMessage.id._serialized);

                        await messageDoc.set(sentMessageData, { merge: true });
                        if (check.includes('patience')) {
                            //await addtagbookedGHL(contactID, 'stop bot');
                        } 
                        if(check.includes('get back to you as soon as possible')){
                            console.log('check includes');
                        
                           await callWebhook("https://hook.us1.make.com/qoq6221v2t26u0m6o37ftj1tnl0anyut",check,threadID);
                        }
                    }
                }
            }
                  
                    console.log('Response sent.');
                    userState.set(sender.to, steps.START);
                    break;
                default:
                    // Handle unrecognized step
                    console.error('Unrecognized step:', currentStep);
                    break;
            }

           

        return('All messages processed');
    } catch (e) {
        console.error('Error:', e.message);
        return(e.message);
    }
}

async function addMessagetoFirebase(msg, idSubstring, extractedNumber){
    let messageBody = msg.body;
    let audioData = null;

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
        source: chat.deviceType ?? "",
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
                        filename: media.filename ?? "",
                        caption: msg.body ?? "",
                        width: msg._data.width,
                        height: msg._data.height
                    };
                } else {
                    messageData[msg.type] = {
                        mimetype: media.mimetype,
                        data: media.data,  // This is the base64-encoded data
                        filename: media.filename ?? "",
                        caption: msg.body ?? "",
                    };
                }
                if (media.filesize) {
                    messageData[msg.type].filesize = media.filesize;
                }
            } else {
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
    await addNotificationToUser(idSubstring, messageData);
}
async function removeTagBookedGHL(contactID, tag) {
    const options = {
        method: 'DELETE',
        url: `https://services.leadconnectorhq.com/contacts/${contactID}/tags`,
        headers: {
            Authorization: `Bearer ${ghlConfig.ghl_accessToken}`,
            Version: '2021-07-28',
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        data: {
            tags: [tag],
        }
    };

    try {
        const response = await axios.request(options);
    } catch (error) {
        console.error('Error removing tag from contact:', error);
    }
}

async function getContactById(contactId) {
    const options = {
        method: 'GET',
        url: `https://services.leadconnectorhq.com/contacts/${contactId}`,
        headers: {
            Authorization: `Bearer ${ghlConfig.ghl_accessToken}`,
            Version: '2021-07-28',
            Accept: 'application/json'
        }
    };

    try {
        const response = await axios.request(options);
        return response.data.contact;
    } catch (error) {
        console.error(error);
    }
}

async function addtagbookedGHL(contactID, tag) {
    const contact = await getContactById(contactID);
    const previousTags = contact.tags || [];
    const options = {
        method: 'PUT',
        url: `https://services.leadconnectorhq.com/contacts/${contactID}`,
        headers: {
            Authorization: `Bearer ${ghlConfig.ghl_accessToken}`,
            Version: '2021-07-28',
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        data: {
            tags: [...new Set([...previousTags, tag])]
        }
    };

    try {
        await axios.request(options);
    } catch (error) {
        console.error('Error adding tag to contact:', error);
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

async function callWebhook(webhook,senderText,thread) {
    console.log('calling webhook')
    const webhookUrl = webhook;
    const body = JSON.stringify({ senderText,thread}); // Include sender's text in the request body
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: body
    });  let responseData =""
    if(response.status === 200){
        responseData= await response.text(); // Dapatkan respons sebagai teks
    }else{
        responseData = 'stop'
    }
 return responseData;
}

// Add this function to count contacts created today
async function countContactsCreatedToday(idSubstring) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const contactsRef = db.collection('companies').doc(idSubstring).collection('contacts');
    const snapshot = await contactsRef
        .where('createdAt', '>=', today)
        .get();

    return snapshot.size;
}

// Add this function to send the daily report
async function sendDailyContactReport(client, idSubstring) {
    const count = await countContactsCreatedToday(idSubstring);
    const message = `Daily Report: ${count} new lead(s) today.`;
    
    // Replace with the actual group chat ID where you want to send the report
    const groupChatId = '120363178065670386@g.us';
    
    await client.sendMessage(groupChatId, message);
}

// Schedule the daily report
function scheduleDailyReport(client, idSubstring) {
    // Schedule for 9 PM Kuala Lumpur time
    cron.schedule('0 21 * * *', () => {
        sendDailyContactReport(client, idSubstring);
    }, {
        timezone: "Asia/Kuala_Lumpur"
    });
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

async function checkingStatus(threadId, runId) {
    const runObject = await openai.beta.threads.runs.retrieve(
        threadId,
        runId
    );
    const status = runObject.status; 
    if(status == 'completed') {
        try{
            const messagesList = await openai.beta.threads.messages.list(threadId);
            const latestMessage = messagesList.body.data[0].content;

            console.log("Latest Message:");
            console.log(latestMessage[0].text.value);
            const answer = latestMessage[0].text.value;
            return answer;
        } catch(error){
            console.log("error from handleNewMessagesJuta2: "+error)
            throw error;
        }
    }
    return null; // Return null if not completed
}

// Modify the waitForCompletion function to handle tool calls
async function waitForCompletion(threadId, runId) {
    return new Promise((resolve, reject) => {
      const maxAttempts = 30;
      let attempts = 0;
      const pollingInterval = setInterval(async () => {
        attempts++;
        try {
          const runObject = await openai.beta.threads.runs.retrieve(threadId, runId);
          if (runObject.status === 'completed') {
            clearInterval(pollingInterval);
            const messagesList = await openai.beta.threads.messages.list(threadId);
            const latestMessage = messagesList.data[0].content[0].text.value;
            resolve(latestMessage);
          } else if (runObject.status === 'requires_action') {
            clearInterval(pollingInterval);
            console.log('Run requires action, handling tool calls...');
            const toolCalls = runObject.required_action.submit_tool_outputs.tool_calls;
            const toolOutputs = await handleToolCalls(toolCalls);
            console.log('Submitting tool outputs...');
            await openai.beta.threads.runs.submitToolOutputs(threadId, runId, { tool_outputs: toolOutputs });
            console.log('Tool outputs submitted, restarting wait for completion...');
            resolve(await waitForCompletion(threadId, runId));
          } else if (attempts >= maxAttempts) {
            clearInterval(pollingInterval);
            reject(new Error("Timeout: Assistant did not complete in time"));
          }
        } catch (error) {
          clearInterval(pollingInterval);
          reject(error);
        }
      }, 2000);
    });
  }


// Modify the runAssistant function to handle tool calls
async function runAssistant(assistantID, threadId, tools) {
    console.log('Running assistant for thread: ' + threadId);
    const response = await openai.beta.threads.runs.create(
      threadId,
      {
        assistant_id: assistantID,
        tools: tools,
      }
    );
  
    const runId = response.id;
  
    const answer = await waitForCompletion(threadId, runId);
    return answer;
  }

  // Modify the handleToolCalls function to include the new tool
async function handleToolCalls(toolCalls) {
    console.log('Handling tool calls...');
    const toolOutputs = [];
    for (const toolCall of toolCalls) {
      console.log(`Processing tool call: ${toolCall.function.name}`);
      if (toolCall.function.name === 'createGoogleCalendarEvent') {
        try {
            console.log('Parsing arguments for createGoogleCalendarEvent...');
            const args = JSON.parse(toolCall.function.arguments);
            console.log('Arguments:', args);
    
            console.log('Calling createGoogleCalendarEvent...');
            const result = await createGoogleCalendarEvent(args.summary, args.description, args.startDateTime, args.endDateTime);
            
            console.log('Event created successfully, preparing tool output...');
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify(result),
            });
          } catch (error) {
            console.error('Error in handleToolCalls for createGoogleCalendarEvent:');
            console.error(error);
            toolOutputs.push({
              tool_call_id: toolCall.id,
              output: JSON.stringify({ error: error.message }),
            });
          }      
        } else if (toolCall.function.name === 'getTodayDate') {
        console.log('Getting today\'s date...');
        const todayDate = getTodayDate();
        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify({ date: todayDate }),
        });
      } else {
        console.warn(`Unknown function called: ${toolCall.function.name}`);
      }
    }
    console.log('Finished handling tool calls');
    return toolOutputs;
  }

// Modify the handleOpenAIAssistant function to include the new tool
// Modify the handleOpenAIAssistant function to include the new tool
async function handleOpenAIAssistant(message, threadID,tags) {
    console.log(ghlConfig.assistantId);
    let assistantId = ghlConfig.assistantId;
    if(tags !== undefined && tags.includes('team')){ 
        assistantId = ghlConfig.assistantIdTeam;
    }
   
    await addMessage(threadID, message);
    
    const tools = [
      {
        type: "function",
        function: {
          name: "createGoogleCalendarEvent",
          description: "Schedule a meeting in Google Calendar",
          parameters: {
            type: "object",
            properties: {
              summary: { type: "string", description: "Title of the event" },
              description: { type: "string", description: "Description of the event" },
              startDateTime: { type: "string", description: "Start date and time in ISO 8601 format" },
              endDateTime: { type: "string", description: "End date and time in ISO 8601 format" },
            },
            required: ["summary", "startDateTime", "endDateTime"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getTodayDate",
          description: "Get today's date in YYYY-MM-DD format",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      },
    ];
  
    const answer = await runAssistant(assistantId, threadID, tools);
    return answer;
  }

async function sendWhapiRequest(endpoint, params = {}, method = 'POST') {
    console.log('Sending request to Whapi.Cloud...');
    const options = {
        method: method,
        headers: {
            Authorization: `Bearer ${ghlConfig.whapiToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    };
    const url = `https://gate.whapi.cloud/${endpoint}`;
    const response = await fetch(url, options);
    const jsonResponse = await response.json();
    return jsonResponse;
}


async function saveThreadIDGHL(contactID,threadID){
    const options = {
        method: 'PUT',
        url: `https://services.leadconnectorhq.com/contacts/${contactID}`,
        headers: {
            Authorization: `Bearer ${ghlConfig.ghl_accessToken}`,
            Version: '2021-07-28',
            'Content-Type': 'application/json',
            Accept: 'application/json'
        },
        data: {
            customFields: [
                {key: 'threadid', field_value: threadID}
            ],
        }
    };

    try {
        await axios.request(options);
    } catch (error) {
        console.error(error);
    }
}

async function saveThreadIDFirebase(contactID, threadID, idSubstring) {
    
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

async function createContact(name,number){
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

    try {
        await axios.request(options);
    } catch (error) {
        console.error(error);
    }
}

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
      const response = await axios.request(options);
      return(response.data.contact);
    } catch (error) {
        console.error(error);
    }
}


async function fetchConfigFromDatabase(idSubstring) {
    try {
        const docRef = db.collection('companies').doc(idSubstring);
        const doc = await docRef.get();
        if (!doc.exists) {
            console.log('No such document!');
            return;
        }
        ghlConfig = doc.data();
        console.log(ghlConfig);
    } catch (error) {
        console.error('Error fetching config:', error);
        throw error;
    }
}

const FormData = require('form-data');

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

module.exports = { handleNewMessagesJuta2 };