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

const { v4: uuidv4 } = require('uuid');

const { URLSearchParams } = require('url');
const admin = require('../firebase.js');
const db = admin.firestore();

let ghlConfig = {};
const { google } = require('googleapis');

// Set up Google Sheets API
const auth = new google.auth.GoogleAuth({
  keyFile: './service_account.json', // Replace with your credentials file path
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
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

let employees = [];
let currentEmployeeIndex = 0;

async function fetchEmployeesFromFirebase(idSubstring) {
    const employeesRef = db.collection('companies').doc(idSubstring).collection('employee');
    const snapshot = await employeesRef.get();
    
    employees = [];
    
    console.log(`Total documents in employee collection: ${snapshot.size}`);

    snapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Processing employee document:`, data);

        if (data.name) {
            employees.push({
                name: data.name,
                email: data.email,
                phoneNumber: data.phoneNumber,
                assignedContacts: data.assignedContacts || 0
            });
            console.log(`Added employee ${data.name}`);
        } else {
            console.log(`Skipped employee due to missing name:`, data);
        }
    });

    console.log('Fetched employees:', employees);

    // Load the previous assignment state
    await loadAssignmentState(idSubstring);
}

async function loadAssignmentState(idSubstring) {
    const stateRef = db.collection('companies').doc(idSubstring).collection('botState').doc('assignmentState');
    const doc = await stateRef.get();
    if (doc.exists) {
        const data = doc.data();
        currentEmployeeIndex = data.currentEmployeeIndex;
        console.log('Assignment state loaded from Firebase:', data);
    } else {
        console.log('No previous assignment state found');
        currentEmployeeIndex = 0;
    }
}

async function storeAssignmentState(idSubstring) {
    const stateRef = db.collection('companies').doc(idSubstring).collection('botState').doc('assignmentState');
    const stateToStore = {
        currentEmployeeIndex: currentEmployeeIndex,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };

    await stateRef.set(stateToStore);
    console.log('Assignment state stored in Firebase:', stateToStore);
}

async function assignNewContactToEmployee(contactID, idSubstring, client) {
    if (employees.length === 0) {
        await fetchEmployeesFromFirebase(idSubstring);
    }

    console.log('Employees:', employees);
    console.log('Current Employee Index:', currentEmployeeIndex);

    if (employees.length === 0) {
        console.log('No employees found for assignment');
        return [];
    }
    
    let assignedEmployee = null;

    // Round-robin assignment
    assignedEmployee = employees[currentEmployeeIndex];
    currentEmployeeIndex = (currentEmployeeIndex + 1) % employees.length;

    console.log(`Assigned employee: ${assignedEmployee.name}`);

    const tags = [assignedEmployee.name, assignedEmployee.phoneNumber];
    const employeeID = assignedEmployee.phoneNumber.split('+')[1] + '@c.us';
    console.log(`Contact ${contactID} assigned to ${assignedEmployee.name}`);
    await client.sendMessage(employeeID, 'You have been assigned to ' + contactID);
    await addtagbookedFirebase(contactID, assignedEmployee.name, idSubstring);

    // Fetch sales employees based on the assigned employee's group
    if(assignedEmployee.group){
        await fetchSalesFromFirebase(idSubstring, assignedEmployee.group);
        console.log('Fetched sales employees:', sales);
    } else {
        console.log('No group assigned to the employee');
        return tags;  // Return early if no group is assigned
    }
    
    // Filter out employees who are inactive (assuming active employees have a weightage > 0)
    const availableEmployees = sales.filter(emp => emp.weightage > 0);

    console.log('Available sales employees:', availableEmployees);

    if (availableEmployees.length === 0) {
        console.log('No available sales employees found for assignment');
        return tags;
    }

    // Calculate total weight
    const totalWeight = availableEmployees.reduce((sum, emp) => sum + emp.weightage, 0);

    console.log('Total weight:', totalWeight);

    // Generate a random number between 0 and totalWeight
    const randomValue = Math.random() * totalWeight;

    console.log('Random value:', randomValue);

    // Select an employee based on the weighted random selection
    let cumulativeWeight = 0;
    let assignedSales = null;

    for (const emp of availableEmployees) {
        cumulativeWeight += emp.weightage;
        console.log(`Sales Employee: ${emp.name}, Cumulative Weight: ${cumulativeWeight}`);
        if (randomValue <= cumulativeWeight) {
            assignedSales = emp;
            break;
        }
    }
    
    if (!assignedSales) {
        console.log('Failed to assign a sales employee');
        return tags;
    }

    console.log(`Assigned sales: ${assignedSales.name}`);
    await addtagbookedFirebase(contactID, assignedSales.name, idSubstring);
    const salesID = assignedSales.phoneNumber.replace(/\s+/g, '').split('+')[1] + '@c.us';

    await client.sendMessage(salesID, 'You have been assigned to ' + contactID);

    // Add the assigned sales employee to the tags
    tags.push(assignedSales.name, assignedSales.phoneNumber);

    await storeAssignmentState(idSubstring);

    return tags;
}

async function addNotificationToUser(companyId, message, contactName) {
    console.log('Adding notification and sending FCM');
    try {
        // Find the user with the specified companyId
        const usersRef = db.collection('user');
        const querySnapshot = await usersRef.where('companyId', '==', companyId).get();

        if (querySnapshot.empty) {
            console.log('No matching documents.');
            return;
        }

        // Filter out undefined values and reserved keys from the message object
        const cleanMessage = Object.fromEntries(
            Object.entries(message)
                .filter(([key, value]) => value !== undefined && !['from', 'notification', 'data'].includes(key))
                .map(([key, value]) => {
                    if (key === 'text' && typeof value === 'string') {
                        return [key, { body: value }];
                    }
                    return [key, typeof value === 'object' ? JSON.stringify(value) : String(value)];
                })
        );

        // Add sender information to cleanMessage
        cleanMessage.senderName = contactName;
     // Filter out undefined values from the message object
     const cleanMessage2 = Object.fromEntries(
        Object.entries(message).filter(([_, value]) => value !== undefined)
    );  
        let text;
        if(cleanMessage2.hasMedia){
            text = "Media"
        }
        text = cleanMessage2.text?.body || 'New message received';
        // Prepare the FCM message
        const fcmMessage = {
            notification: {
                title: `${contactName}`,
                body: cleanMessage2.text?.body || 'New message received'
            },
            data: {
                ...cleanMessage,
                text: JSON.stringify(cleanMessage.text), // Stringify the text object for FCM
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                sound: 'default'
            },
            topic: companyId // Specify the topic here
        };

        // Add the new message to Firestore for each user
        const promises = querySnapshot.docs.map(async (doc) => {
            const userRef = doc.ref;
            const notificationsRef = userRef.collection('notifications');
            const updatedMessage = { ...cleanMessage2, read: false, from: contactName };
        
            await notificationsRef.add(updatedMessage);
            console.log(`Notification added to Firestore for user with companyId: ${companyId}`);
            console.log('Notification content:');
        });

        await Promise.all(promises);

        // Send FCM message to the topic
        await admin.messaging().send(fcmMessage);
        console.log(`FCM notification sent to topic '001'`);

    } catch (error) {
        console.error('Error adding notification or sending FCM: ', error);
    }
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

const messageQueue = new Map();
const MAX_QUEUE_SIZE = 5;
const RATE_LIMIT_DELAY = 5000; // 5 seconds

async function handleNewMessagesSSPower(client, msg, botName, phoneIndex) {
    console.log('Handling new Messages '+botName);

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
                    }
                
            }else{
                
                await customWait(2500); 

                contactID = extractedNumber;
                contactName = contact.pushname || contact.name || extractedNumber;
                
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
            await addNotificationToUser(idSubstring, messageData, contactName);

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
                            if(part.includes('Perodua Alza 1.5')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2F48dbc70c-f3c6-4271-a0ce-48ba28ac54e3.jpeg?alt=media&token=84f472c2-934b-44d0-bf6d-2c7e981e627a'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(part.includes('Perodua Alza 1.5')){
                                const imagePath2 = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2Feb098a66-d443-4d17-8195-882f914dc995.jpeg?alt=media&token=e1d1641b-f981-491c-9fa4-dcb4ec602bc5';                // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath2);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(part.includes('Toyota Vios 1.5')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2F32f2fd91-6d58-4311-9dc0-7ad701468e4e.jpeg?alt=media&token=880e172a-c07b-4a81-97a5-91af95d88382'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(part.includes('Toyota Vios 1.5')){
                                const imagePath2 = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2F60be8869-e430-4bcb-83a3-4f2734268afc.jpeg?alt=media&token=77ce7aca-a11d-4653-bd0d-96b0e2abdcfd'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath2);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(part.includes('Toyota Vios 1.5')){
                                const imagePath3 = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2Fbd54c4f2-893f-4b74-bfa0-63232cf966d5.jpeg?alt=media&token=bb8f94e0-1f10-4fb0-b79a-bcbb46fd694c'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath3);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(part.includes('Proton Preve 1.6L')){
                                const imagePath= 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2Fdf61d0b1-3137-4ad8-b09a-2cdde70c8ab2.jpeg?alt=media&token=eaab79a3-72e8-42dc-8175-15b2ac3b9922'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(part.includes('Proton Persona 1.6L')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2F2b6e09fe-6a57-4123-97b1-719eea064dbd.jpeg?alt=media&token=eff9b09e-c1f5-40b6-8e80-42135eab0ffc'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(check.includes('Perodua Myvi 1.5 Auto SE 2017')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2Fbf15f1b8-a893-4be2-acd4-42145da8972e.jpeg?alt=media&token=ef9eac30-57a2-4cf8-96b0-e7327859d4d8'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(check.includes('Honda City 1.5 S Plus Auto 2015')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2F9288db7e-8b81-4905-9857-eae69daa9b52.jpeg?alt=media&token=88658f0a-6353-48e3-b828-7e8b103a0dcd'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(check.includes('GM6')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/WhatsApp%20Image%202024-10-08%20at%2012.11.05%20PM.jpeg?alt=media&token=5a2356c0-8b65-4c20-9484-d8919615aecc'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(check.includes('HR-V')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2Fb620df46-389c-4c80-a061-d256a051a223.jpeg?alt=media&token=798e1a3c-aff5-47d4-9aa7-3d87f16931ef'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(check.includes('Jazz')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2F5d527395-ca37-41f1-8f39-4a9083a23e02.jpeg?alt=media&token=05644950-2f0b-4818-b37e-01d33874ab93'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(check.includes('Bezza')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2F8a57c3be-417a-4bf3-9d5e-7b2a583e7e49.jpeg?alt=media&token=77920f3a-05fd-4192-b630-02ebeec66d2f'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if(check.includes('Nissan Almera 1.5')){
                                const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/SS%20Power%2Ff4f8ac8a-1281-4540-ad77-80912a3434e5.jpeg?alt=media&token=21a0b2a2-f798-4231-90ae-9e37dd7fcfa7'; // Update this URL to your image URL
                                const media = await MessageMedia.fromUrl(imagePath);
                                const imageMessage = await client.sendMessage(msg.from, media);
                                await addMessagetoFirebase(imageMessage, idSubstring, extractedNumber, contactName);
                            }
                            if (check.includes('team kami akan contact')) {
                                await assignNewContactToEmployee(idSubstring, extractedNumber, threadID);
                                await addtagbookedFirebase(contactID, 'Complete Details', idSubstring);
                                await addtagbookedFirebase(contactID, 'stop bot', idSubstring);

                            }
                            if (check.includes('maklumkan team')) {
                                await assignNewContactToEmployee(idSubstring, extractedNumber, threadID);
                                await addtagbookedFirebase(contactID, 'Pending Video', idSubstring);
                            }

                            if (check.includes('boleh tolong isikan details')) {
                                await assignNewContactToEmployee(idSubstring, extractedNumber, threadID);
                                await addtagbookedFirebase(contactID, 'Complete Document', idSubstring);
                            }
                        
                            if (check.includes('semak dengan team')) {
                                await assignNewContactToEmployee(idSubstring, extractedNumber, threadID);
                                await addtagbookedFirebase(contactID, 'Trade-In', idSubstring);
                            }

                            if (check.includes('Saya Aiman')) {
                                await assignNewContactToEmployee(idSubstring, extractedNumber, threadID);
                                await addtagbookedFirebase(contactID, 'Onboarding', idSubstring);
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

async function updateGoogleSheet(report) {
    const spreadsheetId = '1XRS8DyKgAFFkNCR47TivFqDVuY9MJtP6zW7hgQs-BN8'; // Replace with your spreadsheet ID
    const range = 'Form_Responses!A:U'; // Adjust based on your sheet name and range
  
    // Parse the report
    const lines = report.split('\n');
    const data = {};
    lines.forEach(line => {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key && value) {
        data[key] = value;
      }
    });
  
    // Prepare the row data
    const rowData = [
      new Date().toISOString(), // Submission Date
      '', // Leave blank for MAV REF NUMBER
      data['First Name'] || '',
      data['Last Name'] || '',
      data['Birth Date'] || '',
      '', // Gender (not provided in the report)
      data['Country'] || '',
      '', // Student E-mail (not provided in the report)
      data['Mobile Number'] || '',
      data['Current Education Level'] || '',
      data['Courses'] || '',
      data['Sponsor'] || '',
      data['How Did You Hear About HM Aerospace'] || '',
      '', // Any specific questions or comments
      '', // Edit Link
      data['How Did You Hear About HM Aerospace'] || '', // How Did You Find Out About Us?
      uuidv4(), // Submission ID
      '', // ADS
      '', // MAV REF NUMBER
      `${data['First Name'] || ''} ${data['Last Name'] || ''}`, // FULL NAME
      '' // NRIC NUMBER
    ];
  
    try {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [rowData],
        },
      });
  
      console.log(`${response.data.updates.updatedCells} cells appended.`);
      return response;
    } catch (err) {
      console.error('The API returned an error: ' + err);
      throw err;
    }
  }
async function generateSpecialReport(threadID, assistantId) {
    try {
        const currentDate = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
        const reportInstruction = `Please generate a report in the following format based on our conversation:

New Enquiry Has Been Submitted

Date : ${currentDate}
First Name : [Extract from conversation]
Last Name : [Extract from conversation]
Birth Date : [Extract from conversation]
Country : [Extract from conversation]
Mobile Number : [Extract from conversation]
Current Education Level : [Extract from conversation]
Courses : [Extract from conversation]
Sponsor : [Extract from conversation]
How Did You Hear About HM Aerospace : [Extract from conversation]

Fill in the information in square brackets with the relevant details from our conversation. If any information is not available, leave it blank. Do not change the Date field.`;

        const response = await openai.beta.threads.messages.create(threadID, {
            role: "user",
            content: reportInstruction
        });

        const assistantResponse = await openai.beta.threads.runs.create(threadID, {
            assistant_id: assistantId
        });

        // Wait for the assistant to complete the task
        let runStatus;
        do {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            runStatus = await openai.beta.threads.runs.retrieve(threadID, assistantResponse.id);
        } while (runStatus.status !== 'completed');

        // Retrieve the assistant's response
        const messages = await openai.beta.threads.messages.list(threadID);
        const reportMessage = messages.data[0].content[0].text.value;

        return reportMessage;
    } catch (error) {
        console.error('Error generating special report:', error);
        return 'Error generating report';
    }
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
            console.log("error from handleNewMessagesMaha: "+error)
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

module.exports = { handleNewMessagesSSPower };