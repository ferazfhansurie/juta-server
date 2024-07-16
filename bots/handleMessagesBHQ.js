// handleMessagesGL.js
const OpenAI = require('openai');
const axios = require('axios').default;

const { URLSearchParams } = require('url');
const admin = require('../firebase.js');
const db = admin.firestore();
const config = require('../config.js');

const timers = {}; // To keep track of timers for each chat
const messageTimestamps = {}; // To keep track of the timestamps of the bot's first replies

let ghlConfig = {};



const openai = new OpenAI({
    apiKey: process.env.OPENAIKEY,
});

const steps = {
    START: 'start',
    NEW_CONTACT: 'newContact',
    CREATE_CONTACT: 'createContact',
    POLL: 'poll',
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
          
            return;
        }

        // Add the new message to the notifications subcollection of the user's document
        querySnapshot.forEach(async (doc) => {
            const userRef = doc.ref;
            const notificationsRef = userRef.collection('notifications');
            const updatedMessage = { ...message, read: false };
        
            await notificationsRef.add(updatedMessage);
           
        });
    } catch (error) {
        console.error('Error adding notification: ', error);
    }
}
async function sendPushNotification(fcmToken, message) {
    console.log(message);
    const payload = {
        notification: {
            title: message.from_name || 'New Message',
            body: message.text.body || 'You have received a new message.',
            icon:'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/logo2.png?alt=media&token=d31d1696-1be8-44a8-b6c5-f6808eb78f6c',
            image:'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/211666_forward_icon.png?alt=media&token=597bb1cf-6ebc-4677-8729-08397df0eb36'
        },
        data: {
            message: JSON.stringify(message)
        }
    };

    try {
        await admin.messaging().sendToDevice(fcmToken, payload);
        console.log('Push notification sent successfully');
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}

async function handleNewMessagesBHQ(req, res) {
    try {
        // Initial fetch of config
        await fetchConfigFromDatabase();
        
        const receivedMessages = req.body.messages;
        for (const message of receivedMessages) {
            if (message.from_me) break;
            console.log(message);

            const sender = {
                to: message.chat_id,
                name: message.from_name
            };
            
            if (!message.chat_id.includes("whatsapp")) {
                break;
            }
     
            let assistantID;
            let contactName;
            let threadID;
            let botStatus;
            let query;
            let answer;
            let parts;


            const senderTo = sender.to;
            const extractedNumber = '+' + senderTo.match(/\d+/)[0];
            await callWebhookNotification('https://hook.us1.make.com/c2nnehk5h6l61wohvu1lxfweqxffc9ll',sender.name,message.text.body);
            const dbData = await getDataFromDatabase(extractedNumber);
            const contactData = await getContactDataFromDatabaseByPhone(extractedNumber);
            threadID = dbData.thread_id;
            botStatus = dbData.bot_status;
            if (botStatus === 'on') {
                console.log('bot is running for this contact');
            } else {
                console.log('bot is turned off for this contact');
                continue;
            }
            if (dbData.name) {
                contactName = dbData.name;
                console.log('name in true :', contactName);
            } else {
                await createContact(sender.name, extractedNumber);
                contactName = sender.name; // Initialize savedName with sender's name
                await saveNameToDatabase(extractedNumber, contactName);
                console.log('name in false :', contactName);
            }
            const contactPresent = await getContact(extractedNumber);
            const chat = await getChatMetadata(message.chat_id);
            const id = message.chat_id.split('@')[0];
        


            if (contactPresent !== null) {
                const stopTag = contactPresent.tags;
                console.log(stopTag);
                if (stopTag.includes('stop bot')) {
                    console.log('Bot stopped for this message');
                    continue;
                } else {
                    contactID = contactPresent.id;
                    contactName = contactPresent.fullNameLowerCase;
                    console.log(contactID);
                    console.log(contactPresent.id);
                 
                    const threadIdField = contactPresent.customFields.find(field => field.id === 'oeSpka9m9YgEtAdBz1Bc');
                    if (threadIdField) {
                        threadID = threadIdField.value;
                    } else {
                        const thread = await createThread();
                        threadID = thread.id;
                        await saveThreadIDGHL(contactID, threadID);
                    }
                    const invSentTag = contactPresent.tags
                    if (invSentTag.includes('invoice sent')) {
                        assistantID = config.blast_assistantID;
                    } else {
                        assistantID = config.booking_assistantID;
                    }
                }
            } else {
                await createContact(sender.name,extractedNumber);
                await customWait(2500);
                const contactPresent = await getContact(extractedNumber);
                const stopTag = contactPresent.tags;
                if (message.from_me){
                    if(stopTag.includes('idle')){
                    removeTagBookedGHL(contactPresent.id,'idle');
                    }
                    break;
                }
                console.log(stopTag);

                contactID = contactPresent.id;
                contactName = contactPresent.fullNameLowerCase;

                const threadIdField = contactPresent.customFields.find(field => field.id === 'oeSpka9m9YgEtAdBz1Bc');
                if (threadIdField) {
                    threadID = threadIdField.value;
                } else {
                    const thread = await createThread();
                    threadID = thread.id;
                    await saveThreadIDGHL(contactID,threadID);
                }
                console.log('sent new contact to create new contact');
            }
            const contactPresent2 = await getContact(extractedNumber);
            const data = {
                additionalEmails: [],
                address1: null,
                assignedTo: null,
                businessId: null,
                phone:extractedNumber,
                tags:contactData.tags??[],
                chat: {
                    chat_pic: chat.chat_pic ?? "",
                    chat_pic_full: chat.chat_pic_full ?? "",
                    contact_id: contactPresent2.id,
                    id: message.chat_id,
                    name: contactPresent2.firstName,
                    not_spam: true,
                    tags: contactPresent2.tags??[],
                    timestamp: message.timestamp,
                    type: 'contact',
                    unreadCount: 0,
                    last_message: {
                        chat_id: chat.id,
                        device_id: message.device_id ?? "",
                        from: message.from ?? "",
                        from_me: message.from_me ?? false,
                        id: message.id ?? "",
                        source: message.source ?? "",
                        status: "delivered",
                        text: message.text ?? "",
                        timestamp: message.timestamp ?? 0,
                        type: message.type ?? "",
                    },
                },
                chat_id: message.chat_id,
                chat_pic: chat.chat_pic ?? "",
                chat_pic_full: chat.chat_pic_full ?? "",
                city: null,
                companyName: null,
                contactName: sender.name??extractedNumber,
                country: contactPresent2.country ?? "",
                customFields: contactPresent2.customFields ?? {},
                last_message: {
                    chat_id: chat.id,
                    device_id: message.device_id ?? "",
                    from: message.from ?? "",
                    from_me: message.from_me ?? false,
                    id: message.id ?? "",
                    source: message.source ?? "",
                    status: "delivered",
                    text: message.text ?? "",
                    timestamp: message.timestamp ?? 0,
                    type: message.type ?? "",
                },
            };
            
            await addNotificationToUser('009', message);
            // Add the data to Firestore
      await db.collection('companies').doc('009').collection('contacts').doc(extractedNumber).set(data); 
      const firebaseTags = contactData.tags??[];
                if(firebaseTags !== undefined){
                    if(firebaseTags.includes('stop bot')){
                        console.log('bot stop');
                    break;
                    }
                }
            if (message.type === 'text') {
                contactID = contactPresent.id;
                const stopTag = contactPresent.tags;
                if(stopTag.includes('follow up')){
                    await removeTagBookedGHL(contactID, 'follow up');
                }    
                await customWait(10000);
                await addtagbookedGHL(contactPresent.id,'follow up');
                query = `${message.text.body} user_name: ${contactName}`;
                answer = await handleOpenAIAssistant(query, threadID,assistantID);
                parts = answer.split(/\s*\|\|\s*/);
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i].trim();
                    if (part) {
                        await sendWhapiRequest('messages/text', { to: sender.to, body: part });
                        console.log('Part sent:', part);    
                        if(part.includes('Kenapa pusat Al-Quran kami sesuai untuk anak')){
                            const imagePath = 'https://i.postimg.cc/PxbqjP22/P001.jpg';
                            const imagePath2 = 'https://i.postimg.cc/HsNdFwTT/kelas-mengaji-di-center2.jpg';
                            const vidPath2 = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/V002.mp4?alt=media&token=40667073-e38c-40b9-a711-b28e19e04dad';
                            // Send the image
                            await sendWhapiRequest('messages/video', { to: sender.to, media: vidPath2 });
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath2 });
                        }     
                        if(part.includes('Kenapa pusat Al-Quran kami sesuai untuk dewasa')){
                            const vidPath2 = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/V002.mp4?alt=media&token=40667073-e38c-40b9-a711-b28e19e04dad';
                            // Send the image
                            await sendWhapiRequest('messages/video', { to: sender.to, media: vidPath2 });
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath2 });
                        }  
                        if(part.includes('Kenapa kelas KAFA kami?')){
                            const imagePath = 'https://i.postimg.cc/1533kR6r/P003.jpg';
                            const imagePath2 = 'https://i.postimg.cc/d34thgMC/P002.jpg';
                            const vidPath2 = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/V002.mp4?alt=media&token=40667073-e38c-40b9-a711-b28e19e04dad';
                            // Send the image
                            await sendWhapiRequest('messages/video', { to: sender.to, media: vidPath2 });
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath2 });

                        }
                        if(part.includes('Untuk makluman, kelas mengaji al-quran ke rumah untuk anak')){
                            const imagePath = 'https://i.postimg.cc/yxV8YsGB/P004.jpg';
                            const vidPath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/V004.mp4?alt=media&token=a5a965c4-aa72-4033-b9d1-7c3ec8404569';
                            // Send the image
                            await sendWhapiRequest('messages/video', { to: sender.to, media: vidPath });
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                        }
                        if(part.includes('Untuk makluman, kelas mengaji quran ke rumah untuk dewasa')){
                            const imagePath = 'https://i.postimg.cc/P5Bfvm7S/P005.jpg';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                        }
                        if(part.includes("- Ibu bapa dapat pantau pembelajaran anak")){
                            const imagePath = 'https://i.postimg.cc/P58THCqY/kelas-mengaji-online.jpg';
                            const vidPath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/V005.mp4?alt=media&token=68045ff7-9dec-4820-87c8-52229594e271';
                            // Send the image
                            await sendWhapiRequest('messages/video', { to: sender.to, media: vidPath });
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                        }
                        if(part.includes('Untuk makluman, kelas mengaji quran online untuk dewasa')){
                            const imagePath = 'https://i.postimg.cc/jSWdj8MW/P007.jpg';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                        }
                        if(part.includes('kelas mengaji seminggu sekali untuk anak')){
                            const imagePath = 'https://i.postimg.cc/TPgdVKMf/PA001.jpg';
                            const imagePath2 = 'https://i.postimg.cc/1tS9Jys6/PA002.jpg';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath2 });

                        }
                        if(part.includes('kelas mengaji seminggu sekali untuk dewasa')){
                            const imagePath = 'https://i.postimg.cc/TPgdVKMf/PA001.jpg';
                            const imagePath2 = 'https://i.postimg.cc/GhtbM7wM/PA003.jpg';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath2 });
                        }
                        if(part.includes('kelas KAFA harian')){
                            const imagePath = 'https://i.postimg.cc/MHPq6RRb/PA004.jpg';
                            const imagePath2 = 'https://i.postimg.cc/MZdWmk4M/PA005.jpg';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath2 });
                        }
                        if(part.includes('kelas mengaji ke rumah untuk anak')){
                            const imagePath = 'https://i.postimg.cc/9MBcksQk/PA006.jpg';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                        }
                        if(part.includes('kelas mengaji ke rumah untuk dewasa')){
                            const imagePath = 'https://i.postimg.cc/9MBcksQk/PA006.jpg';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                        }
                        if(part.includes('mereka juga akan ada aktiviti online')){
                            const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/BHQ%2FPAKEJ%20ONLINE.jpg?alt=media&token=5d925f85-4df1-43ac-a0c1-bbce566bcd20';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                        }
                        if(part.includes('kelas mengaji online untuk dewasa')){
                            const imagePath = 'https://i.postimg.cc/yxY7CnJ8/PA007.jpg';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                        }
                        if(part.includes('MAYBANK')){
                            const imagePath = 'https://i.postimg.cc/J4dW7RVW/qr-bhq.jpg';
        
                            // Send the image
                            await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
                        }
                        if(part.includes('Terima kasih banyak encik/puan')){
                            await addtagbookedGHL(contactPresent.id,'stop bot');
                            break;
                        }
                        
                    }  
                }
                console.log('Response sent.');
                console.log(stopTag);
                if (stopTag.includes('intro')) {
                await removeTagBookedGHL(contactID, 'intro');
                }
                // Start the 6-hour timer
                 // start6HourTimer(sender.to, contactID);
            }

            if (message.type === 'image') {
                continue;
            }
        }
        res.send('All messages processed');
    } catch (e) {
        console.error('Error:', e.message);
        res.status(500).send('Internal Server Error');
    }
}

async function getContactDataFromDatabaseByPhone(phoneNumber) {
    try {
        // Check if phoneNumber is defined
        if (!phoneNumber) {
            throw new Error("Phone number is undefined or null");
        }

        // Initial fetch of config
        await fetchConfigFromDatabase();

        let threadID;
        let contactName;
        let bot_status;
        const contactsRef = db.collection('companies').doc('009').collection('contacts');
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

            if (!threadID) {
                const thread = await createThread();
                threadID = thread.id;
                await doc.ref.update({
                    thread_id: threadID
                });
            }

        
            return { ...contactData, thread_id: threadID, };
        }
    } catch (error) {
        console.error('Error fetching or updating document:', error);
        throw error;
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
        console.log('Tag removed from contact:', response.data);
    } catch (error) {
        console.error('Error removing tag from contact:', error);
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
       // console.error('Error fetching chat metadata:', error.response.data);
        throw error;
    }
}
function start6HourTimer(chatId, contactId) {
    // Clear any existing timer for this chat
    if (timers[chatId]) {
        clearTimeout(timers[chatId]);
    }

    // Set a new timer for 6 hours
    timers[chatId] = setTimeout(async () => {
        await sendWhapiRequest('messages/text', { to: chatId, body: "Assalamualaikum apa khabar tuan/puan. Semoga Allah menjaga kesihatan tuan/puan dan sentiasa dalam keberkahan. Maaf mengganggu. Boleh saya tahu adakah tuan/puan masih berminat untuk dapatkan maklumat lanjut berkenaan perkhidmatan kelas mengaji yang kami sediakan?" });
        // await addtagbookedGHL(contactId, 'stop bot');
        console.log('6-hour follow-up message sent and bot stopped.');
    }, 60 * 1000); // 6 * 60 * 60 * 1000 6 hours in milliseconds
}

async function handleNewMessageReceived(message) {
    const senderTo = message.chat_id;
    if (timers[senderTo]) {
        clearTimeout(timers[senderTo]);
        delete timers[senderTo];
        console.log('User replied within 6 hours, timer cleared.');
    }
}

async function createThread() {
    console.log('Creating a new thread...');
    const thread = await openai.beta.threads.create();
    return thread;
}

async function saveNameToDatabase(phoneNumber, savedName) {
    try {
        const docRef = db.collection('companies').doc('009').collection('customers').doc(phoneNumber);
        await docRef.set({
            name: savedName
        }, { merge: true });
    } catch (error) {
        console.error('Error fetching or updating document:', error);
        throw error;
    }
}

async function addMessage(threadId, message) {
    console.log('Adding a new message to thread: ' + threadId);
    const response = await openai.beta.threads.messages.create(
        threadId,
        {
            role: "user",
            content: message
        }
    );
    return response;
}

async function getDataFromDatabase(phoneNumber) {
    try {
        // Initial fetch of config
        await fetchConfigFromDatabase();

        let threadID;
        let contactName;
        let bot_status;
        const docRef = db.collection('companies').doc('009').collection('customers').doc(phoneNumber);
        const doc = await docRef.get();
        if (!doc.exists) {
            console.log('No such document! Creating a new entry.');
            const contactPresent = await getContact(phoneNumber);
            if (contactPresent !== null) {
                contactName = contactPresent.fullNameLowerCase;
                console.log('Contact name in getData: ' + contactName);
                const threadIdField = contactPresent.customFields.find(field => field.id === 'oeSpka9m9YgEtAdBz1Bc');
                if (threadIdField) {
                    threadID = threadIdField.value;
                } else {
                    const thread = await createThread();
                    threadID = thread.id;
                }
                const stopTag = contactPresent.tags;
                if (stopTag.includes('stop bot')) {
                    bot_status = 'off';
                } else {
                    bot_status = 'on';
                }
                if(stopTag.includes('on bot')){
                    bot_status = 'on';
                }else {
                    bot_status = 'off';
                }
                await docRef.set({
                    thread_id: threadID,
                    bot_status: bot_status,
                    name: contactName
                });
            } else {
                const thread = await createThread();
                threadID = thread.id;
                await docRef.set({
                    thread_id: threadID,
                    bot_status: 'on'
                });
            }
            const updatedData = await docRef.get();
            return updatedData.data();
        } else {
            console.log('Document found. Returning thread_id.');
            return doc.data();
        }
    } catch (error) {
        console.error('Error fetching or updating document:', error);
        throw error;
    }
}

async function callWebhookNotification(webhook,name,message) {
    console.log('Calling webhook...');
    const webhookUrl = webhook;
    const body = JSON.stringify({ name,message }); // Include sender's text in the request body
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: body
    });  let responseData =""
    console.log(response.body);
    if(response.status === 200){
        responseData= await response.text(); // Dapatkan respons sebagai teks

    }else{
        responseData = 'stop'
    }
    console.log('Webhook response:', responseData); // Log raw response
 return responseData;
}

async function checkingNameStatus(threadId, runId) {
    const runObject = await openai.beta.threads.runs.retrieve(
        threadId,
        runId
    );

    const status = runObject.status;
    console.log(runObject);
    console.log('Current status: ' + status);
    
    if(status == 'completed') {
        clearInterval(pollingInterval);

        const messagesList = await openai.beta.threads.messages.list(threadId);
        const latestMessage = messagesList.body.data[0].content;

        console.log("Latest Message:");
        console.log(latestMessage[0].text.value);
        const nameGen = latestMessage[0].text.value;
        return nameGen;
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
      const response =  await axios.request(options);
      console.log(response);
    } catch (error) {
        console.error('Error adding tag to contact:', error);
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
async function waitForNameCompletion(threadId, runId) {
    return new Promise((resolve, reject) => {
        pollingInterval = setInterval(async () => {
            const name = await checkingNameStatus(threadId, runId);
            if (name) {
                clearInterval(pollingInterval);
                resolve(name);
            }
        }, 1000);
    });
}

async function runNameAssistant(assistantID,threadId) {
    console.log('Running assistant for thread: ' + threadId);
    const response = await openai.beta.threads.runs.create(
        threadId,
        {
            assistant_id: assistantID
        }
    );

    const runId = response.id;
    console.log('Run ID:', runId);

    const nameGen = await waitForNameCompletion(threadId, runId);
    return nameGen;
}

async function handleOpenAINameAssistant(senderName) {
    const threadId = 'thread_z88KPYbsJ6IAMwPuXtdCw84R';
    const assistantId = 'asst_lMkTF4mTO4aFKTHUUcSQsp1w';

    await addMessage(threadId, senderName);
    const response = await runNameAssistant(assistantId, threadId);

    return response;
}

async function checkingStatus(threadId, runId) {
    const runObject = await openai.beta.threads.runs.retrieve(
        threadId,
        runId
    );

    const status = runObject.status;
    console.log(runObject);
    console.log('Current status: ' + status);
    
    if(status == 'completed') {
        clearInterval(pollingInterval);

        const messagesList = await openai.beta.threads.messages.list(threadId);
        const latestMessage = messagesList.body.data[0].content;

        console.log("Latest Message:");
        console.log(latestMessage[0].text.value);
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

async function runAssistant(assistantID,threadId) {
    console.log('Running assistant for thread: ' + threadId);
    const response = await openai.beta.threads.runs.create(
        threadId,
        {
            assistant_id: assistantID
        }
    );

    const runId = response.id;
    console.log('Run ID:', runId);

    const answer = await waitForCompletion(threadId, runId);
    return answer;
}

async function handleOpenAIAssistant(message, threadID,assistantID) {
    await addMessage(threadID, message);
    const answer = await runAssistant(assistantID,threadID);
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
    console.log('Whapi response:', JSON.stringify(jsonResponse, null, 2));
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
                {key: 'thread_id', field_value: threadID}
            ],
        }
    };

    try {
        await axios.request(options);
    } catch (error) {
        console.error(error);
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


async function fetchConfigFromDatabase() {
    try {
        const docRef = db.collection('companies').doc('009');
        const doc = await docRef.get();
        if (!doc.exists) {
            console.log('No such document!');
            return;
        }
        ghlConfig = doc.data();
        console.log(doc.data);
    } catch (error) {
        console.error('Error fetching config:', error);
        throw error;
    }
}

module.exports = { handleNewMessagesBHQ };