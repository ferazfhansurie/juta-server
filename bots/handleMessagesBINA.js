// handleMessagesTemplateWweb.js

//STEP BY STEP GUIDE
//1. CHANGE all handleMessagesTemplate to -> handleMessages<YourBotName>
//2. CHANGE all idSubstring to firebase collection name
//3. CHANGE all <assistant> to openai assistant id
//4. CHANGE all Template to your <YourBotName>

const OpenAI = require('openai');
const axios = require('axios').default;
const { Client } = require('whatsapp-web.js');
const { MessageMedia } = require('whatsapp-web.js');


const { URLSearchParams } = require('url');
const admin = require('../firebase.js');
const { firebase } = require('googleapis/build/src/apis/firebase/index.js');
const db = admin.firestore();

let ghlConfig = {};

// Schedule the task to run every 12 hours

const openai = new OpenAI({
    apiKey: process.env.OPENAIKEY,
});

const steps = {
    START: 'start',
};
const userState = new Map();

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

async function scheduleReminderMessage(eventSummary, startDateTime, chatId, idSubstring) {
    // Convert to seconds and ensure it's an integer
    const scheduledTimeSeconds = Math.floor(startDateTime.getTime() / 1000);
  
    console.log('Scheduling reminder for:', moment(startDateTime).format());
    console.log('Scheduled time in seconds:', scheduledTimeSeconds);
    
    const scheduledMessage = {
        batchQuantity: 1,
        chatIds: [chatId],
        companyId: idSubstring,
        createdAt: admin.firestore.Timestamp.now(),
        documentUrl: "",
        fileName: null,
        mediaUrl: "",
        message: eventSummary,
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
      const response = await axios.post(`http://localhost:8443/api/schedule-message/${idSubstring}`, scheduledMessage);
      console.log('Reminder scheduled successfully:', response.data);
    } catch (error) {
      console.error('Error scheduling reminder:', error.response ? error.response.data : error.message);
      if (error.response && error.response.data) {
        console.error('Server response:', error.response.data);
      }
    }
  }

  async function scheduleImageMessage(imageUrl, caption, scheduledTime, chatId, idSubstring) {
    const scheduledTimeSeconds = Math.floor(scheduledTime.getTime() / 1000);
    
    const scheduledMessage = {
        batchQuantity: 1,
        chatIds: [chatId],
        companyId: idSubstring,
        createdAt: admin.firestore.Timestamp.now(),
        documentUrl: "",
        fileName: null,
        mediaUrl: imageUrl,
        message: caption,
        mimeType: "image/jpeg", // Adjust if needed
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
        const response = await axios.post(`http://localhost:8443/api/schedule-message/${idSubstring}`, scheduledMessage);
        console.log('Image message scheduled successfully:', response.data);
    } catch (error) {
        console.error('Error scheduling image message:', error.response ? error.response.data : error.message);
    }
}


  async function scheduleFollowUpMessages(chatId, idSubstring, customerName) {
    const dailyMessages = [
        [
            { type: 'image', url: 'https://example.com/your-image.jpg', caption: "Good afternoon!" },
            "FREE Site Inspection Roofing, Slab Waterproofing with Senior Chinese Shifu & get a Quotation Immediately (For Klang Valley, KL, Seremban & JB areas only).",
            "Hi 😊 Snowy here from BINA Pasifik S/B. We specialized in Roofing & Waterproofing. Thank you for connecting us through Facebook.",
            "May I know which area are you from? How should I address you? 😊",
            "Any issues with your roof? Leaking while raining? Any photo?",
            "Is your house single or double-story? Is your roof roof tiles, metal roof, or concrete slab?"
        ],
        [
            { type: 'image', url: 'https://example.com/your-image.jpg', caption: "Good afternoon!" },
            "Hi, FREE Site Inspection Roofing and slab Waterproofing with Senior Chinese Shifu & get Quotation Immediately (For Klang Valley, KL, Seremban & JB areas only).",
            "May I know the condition of your roof? Is your roof leaking or do you want to refurbish/repaint your roof?"
        ],
        [
            "That day you pm me about the water leakage problem",
            "Is there a leak in your home or shop??🧐"
        ],
        [
            "Good day,",
            "We'd like to schedule a 🆓 FREE inspection at your place. We're available on Tuesday, Wednesday, Saturday, or Sunday.",
            "Which day works best for you???🤔"
        ],
        [
            "Hi",
            "You may contact +60193668776",
            "My manager will personally address your technical questions about the roof.",
        ],
        [
            "Morning",
            "Have you contacted my manager??",
            "You can contact him directly by calling +60193668776 ☺️",
        ]
    ];

    for (let day = 0; day < 6; day++) {
        for (let i = 0; i < 6; i++) {
            const scheduledTime = moment().add(day + 1, 'days').startOf('day').add(16 + i, 'hours');
            const message = dailyMessages[day][i];
            
            if (typeof message === 'object' && message.type === 'image') {
                await scheduleImageMessage(message.url, message.caption, scheduledTime.toDate(), chatId, idSubstring);
            } else {
                await scheduleReminderMessage(message, scheduledTime.toDate(), chatId, idSubstring);
            }
        }
    }
    const scheduledTime = moment().add(7, 'days').startOf('day').add(16, 'hours');
    const staffReminder = `Day 6 last follow up ${customerName}, ${chatId.split('@')[0]}`
    await scheduleReminderMessage(staffReminder, scheduledTime.toDate(), chatId, idSubstring);
}

async function addMessagetoFirebase(msg, idSubstring, extractedNumber, contactName){
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
    console.log(messageData);
    await addNotificationToUser(idSubstring, messageData, contactName);
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

async function removeScheduledMessages(chatId, idSubstring) {
    try {
        const scheduledMessagesRef = db.collection('companies').doc(idSubstring).collection('scheduledMessages');
        const snapshot = await scheduledMessagesRef.where('chatIds', 'array-contains', chatId).get();
        
        for (const doc of snapshot.docs) {
            const messageId = doc.id;
            const messageData = doc.data();
            
            // Prepare the updated message data
            const updatedMessage = {
                ...messageData,
                status: 'completed',
                chatIds: messageData.chatIds.filter(id => id !== chatId)
            };
            
            // Call the API to update the message
            try {
                await axios.put(`http://localhost:8443/api/schedule-message/${idSubstring}/${messageId}`, updatedMessage);
                console.log(`Updated scheduled message ${messageId} for chatId: ${chatId}`);
            } catch (error) {
                console.error(`Error updating scheduled message ${messageId}:`, error.response ? error.response.data : error.message);
            }
        }
        
        console.log(`Updated ${snapshot.size} scheduled messages for chatId: ${chatId}`);
    } catch (error) {
        console.error('Error removing scheduled messages:', error);
    }
}


const messageQueue = new Map();
const MAX_QUEUE_SIZE = 5;
const RATE_LIMIT_DELAY = 5000; // 5 seconds

async function handleNewMessagesBINA(client, msg, botName, phoneIndex) {
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

        //const receivedMessages = req.body.messages;
            if (msg.fromMe){
                return;
            }

            const sender = {
                to: msg.from,
                name:msg.notifyName,
            };

            
            let contactID;
            let contactName;
            let threadID;
            let query;
            let answer;
            let parts;
            let currentStep;
            const extractedNumber = '+'+(sender.to).split('@')[0];
            const chat = await msg.getChat();
            const contactData = await getContactDataFromDatabaseByPhone(extractedNumber, idSubstring);
            let unreadCount = 0;
            let stopTag = contactData?.tags || [];
            const contact = await chat.getContact()

            console.log(contactData);
            if (contactData !== null) {
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
                
                await customWait(2500); 

                contactID = extractedNumber;
                contactName = contact.pushname || contact.name || extractedNumber;
                await scheduleFollowUpMessages(msg.from, idSubstring, contactName);
                
            }   
            let firebaseTags = ['']
            if (contactData) {
                firebaseTags = contactData.tags ?? [];
                // Remove 'snooze' tag if present
                if(firebaseTags.includes('snooze')){
                    firebaseTags = firebaseTags.filter(tag => tag !== 'snooze');
                }
                if(!firebaseTags.includes('replied') && firebaseTags.includes('5 Days Follow Up')){
                    await scheduleFollowUpMessages(msg.from, idSubstring, contactName);
                }else if(!firebaseTags.includes('replied')){
                    await addtagbookedFirebase(extractedNumber, 'replied', idSubstring);
                    await removeScheduledMessages(msg.from, idSubstring);
                }
            } else {
                if ((sender.to).includes('@g.us')) {
                    firebaseTags = ['stop bot']
                }
            }

            
                
            let type = '';
            if(msg.type == 'chat'){
                type ='text'
            }else if(msg.type == 'e2e_notification' || msg.type == 'notification_template'){
                return;
            }else{
                type = msg.type;
            }
                
            if(extractedNumber.includes('status')){
                return;
            }

            // First, let's handle the transcription if it's an audio message
            let messageBody = msg.body;
            let audioData = null;

            if (msg.hasMedia && (msg.type === 'audio' || msg.type === 'ptt')) {
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
                phoneIndex: phoneIndex,
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
    // Only add createdAt if it's a new contact
    if (!contactData) {
    data.createdAt = admin.firestore.Timestamp.now();
    }
            let profilePicUrl = "";
            if (contact.getProfilePicUrl()) {
            try {
                profilePicUrl = await contact.getProfilePicUrl() || "";
            } catch (error) {
                console.error(`Error getting profile picture URL for ${contact.id.user}:`, error);
            }
            }
            data.profilePicUrl = profilePicUrl;

            

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
                phoneIndex: phoneIndex,
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
                
            if((sender.to).includes('@g.us')){
                const authorNumber = '+'+(msg.author).split('@')[0];

                const authorData = await getContactDataFromDatabaseByPhone(authorNumber, idSubstring);
                if(authorData){
                    messageData.author = authorData.contactName;
                }else{
                    messageData.author = authorNumber;
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
            if (msg.from.includes('120363046811985334')) {
                if (msg.body.startsWith('<Confirmed Appointment>')) {
                    await handleConfirmedAppointment(client, msg);
                    return;
                }
            }
            return;
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
                client.sendMessage(msg.from, 'Bot is now restarting with new thread.');
                return;
            }

            //test bot command
            if (msg.body.includes('/hello')) {
                
                client.sendMessage(msg.from, 'tested.');
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

                    query = `${msg.body} user_name: ${contactName} `;
                    
                    
                    answer= await handleOpenAIAssistant(query,threadID);
                    parts = answer.split(/\s*\|\|\s*/);
                    
                    await customWait(10000);
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i].trim();   
                        const check = part.toLowerCase();
                        if (part) {
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
                                timestamp: sentMessage.timestamp,
                                type: 'text',
                                ack: sentMessage.ack ?? 0,
                            };
    
                            const messageDoc = messagesRef.doc(sentMessage.id._serialized);
    
                            await messageDoc.set(sentMessageData, { merge: true });
                            if (check.includes('patience')) {
                            } 
                            if(check.includes('get back to you as soon as possible')){
                                console.log('check includes');
                            
                               await callWebhook("https://hook.us1.make.com/qoq6221v2t26u0m6o37ftj1tnl0anyut",check,threadID);
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

async function addtagbookedFirebase(contactID, tag, idSubstring) {
    const docPath = `companies/${idSubstring}/contacts/${contactID}`;
    const contactRef = db.doc(docPath);

    try {
        // Get the current document
        const doc = await contactRef.get();
        let currentTags = [];

        if (doc.exists) {
            currentTags = doc.data().tags || [];
        }

        // Add the new tag if it doesn't already exist
        if (!currentTags.includes(tag)) {
            currentTags.push(tag);

            // Update the document with the new tags
            await contactRef.set({
                tags: currentTags
            }, { merge: true });

            console.log(`Tag "${tag}" added to contact ${contactID} in Firebase`);
        } else {
            console.log(`Tag "${tag}" already exists for contact ${contactID} in Firebase`);
        }
    } catch (error) {
        console.error('Error adding tag to Firebase:', error);
    }
}

async function addAppointmentToSpreadsheet(appointmentInfo) {
    const spreadsheetId = '1sQRyU0nTuUSnVWOJ44SAyWJXC0a_PbubttpRR_l0Uco';
    const sheetName = 'Appointments';
    const range = `${sheetName}!A:R`; // Expanded range to include all columns

    const auth = new google.auth.GoogleAuth({
        keyFile: './service_account.json',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const values = [
        [
            '', // No. (auto-increment in spreadsheet)
            appointmentInfo.date,
            appointmentInfo.time,
            appointmentInfo.clientPhone,
            appointmentInfo.clientName,
            '', // Assuming the client is always the owner
            appointmentInfo.siteAddress,
            '', // Waze link (can be added later if available)
            '', // Email (can be added later if available)
            appointmentInfo.issue || '', // If you have this information
            '', // WhatsApp group (can be filled later)
            '', // 9x9 Pictures
            '', // Hand written quotation
            '', // Draft quotation photos
            '', // Typed draft quotation
            '', // sent
            '', // detailed quotation
            '', // sent
            ''  // payment
        ]
    ];

    try {
        const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            resource: { values },
        });

        console.log(`${response.data.updates.updatedCells} cells appended.`);
    } catch (error) {
        console.error('Error adding appointment to spreadsheet:', error);
    }
}

async function handleConfirmedAppointment(client, msg) {
    // Extract information from the message
    const appointmentInfo = extractAppointmentInfo(msg.body);

    await addAppointmentToSpreadsheet(appointmentInfo);

    // Create a new group
    const groupTitle = `${appointmentInfo.clientPhone}  ${appointmentInfo.clientPhone}`;
    const participants = [(appointmentInfo.clientPhone+'@c.us'), '60186688766@c.us', '60193668776@c.us'];

    try {
        const result = await client.createGroup(groupTitle, participants);
        console.log('Group created:', result);

        await addContactToFirebase(result.gid._serialized, groupTitle, '002');

        // Send appointment details to the new group
        // Send the initial message
        const initialMessage = `Hi 👋, Im Mr Kelvern(wa.me/601111393111)
            from BINA Pasifik Sdn Bhd (Office No: 03-2770 9111)
            And I've conducted the site inspection at your house that day.
            This group has been created specifically to manage your house roofing case.

            Below is our BINA group's department personnel:

            1. Operation/ Job Arrangement (Ms Sheue Lih - 60186688766)
            2. Manager (Mr Lim - 60193868776)

            The functions of this group are to provide:
            * Quotations, Invoices, Receipts, Warranty Certificate & Job arrangement

            * Send pictures of job updates from time to time

            * Or if you have any confirmation/bank slip or feedbacks/complaints you may speak out in this group also

            ⬇Our Facebook page⬇
            https://www.facebook.com/BINApasifik

            ⬇Our Website⬇
            www.BINApasifik.com

            We are committed to providing you with our very best services 😃

            Thank you.`;
        const message = await client.sendMessage(result.gid._serialized, initialMessage)
        await addMessagetoFirebase(message, '002',(result.gid._serialized).split('@')[0], groupTitle);
        
        const documentUrl = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/kelven.jpg?alt=media&token=baef675f-43e3-4f56-b2ba-19db0a6ddbf5';
        const media = await MessageMedia.fromUrl(documentUrl);
        const documentMessage = await client.sendMessage(result.gid._serialized, media);
        await addMessagetoFirebase(documentMessage, '002',(result.gid._serialized).split('@')[0], groupTitle);

        const documentUrl2 = `https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/Your%20Roofing's%20Doctor.pdf?alt=media&token=7c72f8e4-72cd-4da1-bb3d-387ffeb8ab91`;
        const media2 = await MessageMedia.fromUrl(documentUrl2);
        const documentMessage2 = await client.sendMessage(result.gid._serialized, media2);
        await addMessagetoFirebase(documentMessage2, '002',(result.gid._serialized).split('@')[0], groupTitle);

        const finalMessage = `Your detail quotation will be prepared and sent out to this group in 3 to 5 working days ya 👌`;
        const message2 = await client.sendMessage(result.gid._serialized, finalMessage)
        await addMessagetoFirebase(message2, '002',(result.gid._serialized).split('@')[0], groupTitle);
    } catch (error) {
        console.error('Error creating group:', error);
    }
}

async function addContactToFirebase(groupId, groupTitle, idSubstring) {
    const extractedNumber = groupId.split('@')[0];
    const data = {
        additionalEmails: [],
        address1: null,
        assignedTo: null,
        businessId: null,
        phone: extractedNumber,
        tags: [''],
        chat: {
            contact_id: extractedNumber,
            id: groupId,
            name: groupTitle,
            not_spam: true,
            tags: [''],
            timestamp: Date.now(),
            type: 'group',
            unreadCount: 0,
            last_message: {
                chat_id: groupId,
                from: groupId,
                from_me: true,
                id: "",
                source: "",
                status: "",
                text: {
                    body: ""
                },
                timestamp: Date.now(),
                type: 'text',
            },
        },
        chat_id: groupId,
        city: null,
        companyName: null,
        contactName: groupTitle,
        unreadCount: 0,
        threadid: "",
        phoneIndex: 0,
        last_message: {
            chat_id: groupId,
            from: groupId,
            from_me: true,
            id: Date.now().toString(),
            source: "",
            status: "",
            text: {
                body: ""
            },
            timestamp: Date.now(),
            type: 'text',
        },
        createdAt: admin.firestore.Timestamp.now(),
        profilePicUrl: "",
    };

    try {
        await db.collection('companies').doc(idSubstring).collection('contacts').doc(extractedNumber).set(data);
        console.log('Group added to Firebase:', groupId);
    } catch (error) {
        console.error('Error adding group to Firebase:', error);
    }
}

function extractAppointmentInfo(messageBody) {
    const lines = messageBody.split('\n');
    const info = {};

    lines.forEach(line => {
        if (line.includes('Date:')) info.date = line.split('Date:')[1].trim();
        if (line.includes('Time:')) info.time = line.split('Time:')[1].trim();
        if (line.includes('Senior Inspector:')) info.inspectorName = line.split('Senior Inspector:')[1].trim();
        if (line.includes('Contact Direct:')) info.inspectorPhone = line.split('Contact Direct:')[1].trim().replace('wa.me/', '');
        if (line.includes('Vehicle No Plate:')) info.vehiclePlate = line.split('Vehicle No Plate:')[1].trim();
        if (line.includes('Client:')) info.clientName = line.split('Client:')[1].trim();
        if (line.includes('Contact:')) info.clientPhone = line.split('Contact:')[1].trim().replace('wa.me/', '');
        if (line.includes('Site Add:')) {
            info.siteAddress = line.split('Site Add:')[1].trim();
            // Capture multi-line address
            let i = lines.indexOf(line) + 1;
            while (i < lines.length && !lines[i].includes('Email')) {
                info.siteAddress += ' ' + lines[i].trim();
                i++;
            }
        }
    });

    return info;
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
            console.log("error from handleNewMessagesBINA: "+error)
            throw error;
        }
    }
    return null; // Return null if not completed
}

async function waitForCompletion(threadId, runId) {
    return new Promise((resolve, reject) => {
        const maxAttempts = 30; // Maximum number of attempts
        let attempts = 0;
        const pollingInterval = setInterval(async () => {
            attempts++;
            try {
                const answer = await checkingStatus(threadId, runId);
                if (answer) {
                    clearInterval(pollingInterval);
                    resolve(answer);
                } else if (attempts >= maxAttempts) {
                    clearInterval(pollingInterval);
                    reject(new Error("Timeout: Assistant did not complete in time"));
                }
            } catch (error) {
                clearInterval(pollingInterval);
                reject(error);
            }
        }, 2000); // Poll every 2 seconds
    });
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

async function handleOpenAIAssistant(message, threadID) {
    console.log(ghlConfig.assistantId);
    const assistantId = ghlConfig.assistantId;
    await addMessage(threadID, message);
    const answer = await runAssistant(assistantId,threadID);
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

module.exports = { handleNewMessagesBINA };