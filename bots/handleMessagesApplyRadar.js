// handleMessagesApplyRadar.js
const OpenAI = require('openai');
const axios = require('axios').default;

const { URLSearchParams } = require('url');
const admin = require('../firebase.js');
const db = admin.firestore();

let ghlConfig = {};

// Schedule the task to run every 12 hours

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
            console.log('No matching documents.');
            return;
        }

        // Add the new message to the notifications subcollection of the user's document
        querySnapshot.forEach(async (doc) => {
            const userRef = doc.ref;
            const notificationsRef = userRef.collection('notifications');
            const updatedMessage = { ...message, read: false };
        
            await notificationsRef.add(updatedMessage);
            console.log(`Notification ${message} added to user with companyId: ${companyId}`);
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
async function handleNewMessagesApplyRadar(req, res) {
    try {
        console.log('Handling new messages from ApplyRadar...');
        // Initial fetch of config
        const receivedMessages = req.body.messages;
        for (const message of receivedMessages) {
            if (message.from_me) break;
            await fetchConfigFromDatabase();
            if(!message.chat_id.includes("whatsapp")){
                break;
            }

            const sender = {
                to: message.chat_id,
                name:message.from_name
            };

            let contactID;
            let contactName;
            let threadID;
            let query;
            let answer;
            let parts;
            let pollParams;
            let currentStep;
            const senderTo = sender.to;
            const extractedNumber = '+' + senderTo.match(/\d+/)[0];
            let contactPresent = await getContact(extractedNumber);
            const chat = await getChatMetadata(message.chat_id);
            const contactData = await getContactDataFromDatabaseByPhone(extractedNumber);
            
            if (contactPresent !== null) {
                const stopTag = contactPresent.tags;
                console.log(stopTag);
                if (message.from_me){
                    if(stopTag.includes('idle')){
                    removeTagBookedGHL(contactPresent.id,'idle');
                    }
                    break;
                }
                if(stopTag.includes('stop bot')){
                    console.log('Bot stopped for this message');
                    continue;
                }else {
                    contactID = contactPresent.id;
                    contactName = contactPresent.fullNameLowerCase;
                    const threadIdField = contactPresent.customFields.find(field => field.id === 'iXKFr1fQXsjAsrqLmjDD');
                
                    if (threadIdField) {
                        threadID = threadIdField.value;
                        if(threadID){
                            threadID = threadIdField.value;
                        } else {
                            const thread = await createThread();
                            threadID = thread.id;
                            await saveThreadIDGHL(contactID,threadID);
                        }
                    } else {
                        const thread = await createThread();
                        threadID = thread.id;
                        await saveThreadIDGHL(contactID,threadID);
                    }
                }
            }else{
                // await createContact(sender.name,extractedNumber);
                // await customWait(2500);
                // const contactPresent = await getContact(extractedNumber);
                // const stopTag = contactPresent.tags;
                // if (message.from_me){
                //     if(stopTag.includes('idle')){
                //     removeTagBookedGHL(contactPresent.id,'idle');
                //     }
                //     break;
                // }
                // console.log(stopTag);

                // contactID = contactPresent.id;
                // contactName = contactPresent.fullNameLowerCase;

                // const threadIdField = contactPresent.customFields.find(field => field.id === 'iXKFr1fQXsjAsrqLmjDD');
                // if (threadIdField) {
                //     threadID = threadIdField.value;
                // } else {
                //     const thread = await createThread();
                //     threadID = thread.id;
                //     await saveThreadIDGHL(contactID,threadID);
                // }
                // console.log('sent new contact to create new contact');
            }   
          contactPresent = await getContact(extractedNumber);
            let firebaseTags =[]
            if(contactData){
                firebaseTags=   contactData.tags??[];
            }
            
            const data = {
             additionalEmails: [],
             address1: null,
             assignedTo: null,
             businessId: null,
             phone:extractedNumber,
             tags:firebaseTags,
             chat: {
                 chat_pic: chat.chat_pic ?? "",
                 chat_pic_full: chat.chat_pic_full ?? "",
                 contact_id: contactPresent.id,
                 id: message.chat_id,
                 name: contactPresent.firstName,
                 not_spam: true,
                 tags: contactPresent.tags??[],
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
             contactName: chat.name??extractedNumber,
             country: contactPresent.country ?? "",
             customFields: contactPresent.customFields ?? {},
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
            
            await addNotificationToUser('023', message);
            // Add the data to Firestore
      await db.collection('companies').doc('023').collection('contacts').doc(extractedNumber).set(data);       
            if(firebaseTags !== undefined){
                if(firebaseTags.includes('stop bot')){
                    console.log('bot stop');
                break;
                }
            }
            currentStep = userState.get(sender.to) || steps.START;
            switch (currentStep) {
                case steps.START:
                    var context = "";
                    if (message.context?.quoted_content?.body != null) {
                        context = message.context.quoted_content.body;
                        query = `${message.text.body} user_name: ${contactName} user replied to your previous message: ${context}`;
                    } else {
                        query = `${message.text.body} user_name: ${contactName} `;
                    }
                    
                    const universityFilePaths = {
                        'mmu': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FMMU%20%20Campus%20Tour.mp4?alt=media&token=e97749d4-a2a2-43d8-8926-904f2e693906',
                        'multimedia': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FMMU%20%20Campus%20Tour.mp4?alt=media&token=e97749d4-a2a2-43d8-8926-904f2e693906',
                        'tenaga nasional': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FUNITEN%20Campus%20Tour.mp4?alt=media&token=7aa4dff3-53e2-46c7-989a-b8af0b008287',
                        'uniten': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FUNITEN%20Campus%20Tour.mp4?alt=media&token=7aa4dff3-53e2-46c7-989a-b8af0b008287',
                        'segi': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FSEGi%20Campus%20Tour.mp4?alt=media&token=ed72c7bb-d7ef-43e8-9fc5-1b26375e79a1',
                        'inti': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2Finti.mp4?alt=media&token=f6208fe6-10eb-4e33-91ee-eb116f0fe377',
                        'apu': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2Fapu%20video.mp4?alt=media&token=d058e05c-5481-425e-a9f1-a03e65d51739',
                        'asia pacific': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2Fapu%20video.mp4?alt=media&token=d058e05c-5481-425e-a9f1-a03e65d51739',
                    };
                    answer= await handleOpenAIAssistant(query,threadID);
                    parts = answer.split(/\s*\|\|\s*/);
                    
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i].trim();   
                        const check = part.toLowerCase();
                     
                        if (part) {
                            await addtagbookedGHL(contactID, 'idle');
                            await sendWhapiRequest('messages/text', { to: sender.to, body: part });
                            
                            if (check.includes('patience')) {
                                await addtagbookedGHL(contactID, 'stop bot');
                            } 
                            if(check.includes('get back to you as soon as possible')){
                                console.log('check includes');
                            
                               await callWebhook("https://hook.us1.make.com/qoq6221v2t26u0m6o37ftj1tnl0anyut",check,threadID);
                            }

                            for (const [key, filePath] of Object.entries(universityFilePaths)) {
                                if (check.includes(key) && check.includes('video')) {
                                    console.log(`${key} sending file`);
                                    await sendWhapiRequest('messages/video', { to: sender.to, media: filePath});
                                    continue;
                                }
                            }
                      
                        }
                    }
                    console.log('Response sent.');
                    userState.set(sender.to, steps.START);
                    break;                
                case steps.NEW_CONTACT:
                    await sendWhapiRequest('messages/text', { to: sender.to, body: 'Sebelum kita mula boleh saya dapatkan nama?' });
                    userState.set(sender.to, steps.START);
                    break;
                case steps.CREATE_CONTACT:
                    const name = `${message.text.body} default_name: ${sender.name}`;
                    await createContact(sender.name,extractedNumber);
                    pollParams = {
                        to: sender.to,
                        title: 'Are you dreaming of your next getaway?',
                        options: ['Yes'],
                        count: 1,
                        view_once: true
                    };
                    webhook = await sendWhapiRequest('/messages/poll', pollParams);
                    await customWait(2500);
                    userState.set(sender.to, steps.POLL);
                    break;
                case steps.POLL:
                    let selectedOption = [];
                    for (const result of webhook.message.poll.results) {
                        selectedOption.push (result.id);
                    }    
                    if(message.action.votes[0]=== selectedOption[0]){
                        const contactDetails = await getContact(extractedNumber);
                        contactID = contactDetails.id;
                        contactName = contactDetails.fullNameLowerCase;
                        const thread = await createThread();
                        threadID = thread.id;
                        console.log('thread ID generated: ', threadID);
                        await saveThreadIDGHL(contactID,threadID);
                        query = `${message.text.body} user_name: ${contactName}`;
                        answer = await handleOpenAIAssistant(query,threadID);
                        parts = answer.split(/\s*\|\|\s*/);
                        for (let i = 0; i < parts.length; i++) {
                            const part = parts[i].trim();                
                            if (part) {
                                await sendWhapiRequest('messages/text', { to: sender.to, body: part });
                                console.log('Part sent:', part);
                            }
                        }
                        console.log('Response sent.');
                        userState.set(sender.to, steps.START);
                        break;
                    }
                default:
                    // Handle unrecognized step
                    console.error('Unrecognized step:', currentStep);
                    break;
            }
        }

        res.send('All messages processed');
    } catch (e) {
        console.error('Error:', e.message);
        res.send(e.message);
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
async function callNotification(webhook,senderText,name) {
    console.log('calling notification')
    const webhookUrl = webhook;
    const body = JSON.stringify({ senderText,name}); // Include sender's text in the request body
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
        const contactsRef = db.collection('companies').doc('023').collection('contacts');
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
async function checkingNameStatus(threadId, runId) {
    const runObject = await openai.beta.threads.runs.retrieve(
        threadId,
        runId
    );

    const status = runObject.status;
    if(status == 'completed') {
        clearInterval(pollingInterval);

        const messagesList = await openai.beta.threads.messages.list(threadId);
        const latestMessage = messagesList.body.data[0].content;
        const nameGen = latestMessage[0].text.value;
        return nameGen;
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
    const response = await openai.beta.threads.runs.create(
        threadId,
        {
            assistant_id: assistantID
        }
    );

    const runId = response.id;

    const nameGen = await waitForNameCompletion(threadId, runId);
    return nameGen;
}

async function handleOpenAINameAssistant(senderName) {
    const threadId = 'thread_z88KPYbsJ6IAMwPuXtdCw84R';
    const assistantId = 'asst_dkA9uxVwvyUoSPS0eLg4Lrv9';

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
    if(status == 'completed') {
        clearInterval(pollingInterval);
        try{
            const messagesList = await openai.beta.threads.messages.list(threadId);
            const latestMessage = messagesList.body.data[0].content;

            console.log("Latest Message:");
            console.log(latestMessage[0].text.value);
            const answer = latestMessage[0].text.value;
            return answer;
        } catch(error){
            console.log("error from handleNewMessagesApplyRadar: "+error)
        }
        
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

    const answer = await waitForCompletion(threadId, runId);
    return answer;
}

async function handleOpenAIAssistant(message, threadID) {
    const assistantId ='asst_XCacl9JStboccXkVGegQVAN9';
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
async function sendWhapiRequest2(endpoint, params = {}, method = 'POST') {
    console.log('Sending request to Whapi.Cloud...');
    const options = {
        method: method,
        headers: {
            Authorization: `Bearer ${ghlConfig.whapiToken2}`,
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
        const docRef = db.collection('companies').doc('023');
        const doc = await docRef.get();
        if (!doc.exists) {
            console.log('No such document!');
            return;
        }
        ghlConfig = doc.data();
    } catch (error) {
        console.error('Error fetching config:', error);
        throw error;
    }
}

module.exports = { handleNewMessagesApplyRadar };