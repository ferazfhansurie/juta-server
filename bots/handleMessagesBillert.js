// handleMessagesBillert.js
const OpenAI = require('openai');
const axios = require('axios').default;
const Bottleneck = require('bottleneck');
const { URLSearchParams } = require('url');
const admin = require('../firebase.js');
const db = admin.firestore();

let ghlConfig = {};
const limiter = new Bottleneck({
    minTime: 1000 // Minimum time between each request in milliseconds
  });
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
async function handleNewMessagesBillert(req, res) {
    try {
        console.log('Handling new messages from Billert...');

        // Initial fetch of config
        await fetchConfigFromDatabase();

        const receivedMessages = req.body.messages;
        for (const message of receivedMessages) {
        
            if (message.from_me) break;

         const chat = await getChatMetadata(message.chat_id);

            const sender = {
                to: message.chat_id,
                name:message.from_name
            };
            if(!message.chat_id.includes("whatsapp")){
                break;
            }
           
            const companyRef = db.collection('message').doc(message.chat_id);

            // Get the current messages array
            const doc = await companyRef.get();
            const currentMessages = doc.data()?.messages || [];
            
            // Add the new message to the messages array
            const updatedMessages = [...currentMessages, message];
            
            // Set the entire document with the updated messages array
            await companyRef.set({
                messages: updatedMessages
            });
            //await callWebhookNotification('https://hook.us1.make.com/m5lglcshlq8528ib7ubxf0qsu4utpwur',sender.name,message.text.body);

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
            const contactPresent = await getContact(extractedNumber);
            const contactData = await getContactDataFromDatabaseByPhone(extractedNumber);
            if (contactPresent !== null) {
                const stopTag = contactPresent.tags;
   
                if(stopTag.includes('stop bot')){
                    console.log('Bot stopped for this message');
                    continue;
                }else {
                    contactID = contactPresent.id;
                    const teamNames = teams.flat();
                    console.log(stopTag);
                    console.log(teamNames);
                    const hasTeamTag = stopTag.some(tag => teamNames.includes(tag));
                    console.log(hasTeamTag);
                    if (!hasTeamTag) {
                        await tagContact(contactID,sender);
                    }
                  
                }
            }else{
                //const savedName = await handleOpenAINameAssistant(sender.name);
               await createContact(extractedNumber);
               let currentTeamIndex = await getCurrentTeamIndex();
               // Call the function to add the tag
               let assigned = teams[currentTeamIndex][0];
               let number = teams[currentTeamIndex][1];
               function capitalizeFirstLetter(string) {
                   return string.charAt(0).toUpperCase() + string.slice(1);
               }
               // Capitalize the first letter of the assigned name
               assigned = capitalizeFirstLetter(assigned);
               
               const message = `Hi Terima Kasih kerana berminat untuk semak kelayakan dengan Farah.\n\n` +
               `Team Farah akan bantu Tuan/Puan/Encik/Cik untuk buat semakan dengan lebih lanjut.\n\n` +
               `Sebentar lagi team Farah nama dia ${assigned} akan WhatsApp cik, atau cik boleh terus WhatsApp ${assigned} dengan segera di nombor ${number}`;
               
               await sendWhapiRequest('messages/text', { 
                   to: sender.to, 
                   body: message 
               });
               if(assigned == 'Hilmi'){
                   const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/Hilmi%20Intro%20Picture.png?alt=media&token=52947d47-30a3-4d5b-aaef-b67f9637eea9';
                   console.log("test")
                   // Send the image
                   await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
               }else if(assigned == 'Stanie'){
                   const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/Stanie%20Intro%20Picture.png?alt=media&token=65b13831-a719-4633-85c3-970127cab485';
                   console.log("test")
                   // Send the image
                   await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
               }else if(assigned == 'Zara'){
                   const imagePath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/Zara%20Intro%20Picture.png?alt=media&token=7fbe7906-bf7c-446f-976a-51186d08f2c2';
                   console.log("test")
                   // Send the image
                   await sendWhapiRequest('messages/image', { to: sender.to, media: imagePath });
               }
               function getCurrentDate() {
                   const date = new Date();
                   const day = String(date.getDate()).padStart(2, '0');
                   const month = String(date.getMonth() + 1).padStart(2, '0');
                   const year = date.getFullYear();
                   return `${day}/${month}/${year}`;
               }
               const agentId = number.split('+')[1]+'@s.whatsapp.net';
               const currentDate = getCurrentDate();
               const custNumber = sender.to.split('@')[0];
               const message2 = `Hi *${assigned}*\n\n` +
               `Anda terima Leads baru 🚀\n\n` +
               `No Phone : *+${custNumber}*\n\n`+
               `Tarikh : *${currentDate}*\n\n`+
               `Good Luck !`;
               console.log(agentId);
               await sendWhapiRequest('messages/text', { 
                   to: agentId, 
                   body: message2 
               });
               
               console.log('creating new');
            
               const contactPresent = await getContact(extractedNumber);
               customWait(5000);
               await addTag(contactPresent.id, assigned);
           
               // Update the team index
               currentTeamIndex = (currentTeamIndex + 1) % teams.length;
           
               // Save the current team index to Firestore
               await updateCurrentTeamIndex(currentTeamIndex);
          
    
                const stopTag = contactPresent.tags;
        
                if(stopTag.includes('stop bot')){
                    console.log('Bot stopped for this message');
                    continue;
                }else {
                    contactID = contactPresent.id;
                    contactName = contactPresent.fullNameLowerCase;
            
                }
                 // Create the data object

                console.log('sent new contact to create new contact');
 
            
            }
            const contactPresent2 = await getContact(extractedNumber);
            const firebaseTags = contactData.tags??[];
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
                contactName: message.from_name,
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
            await addNotificationToUser('011',message);
            // Add the data to Firestore
      await db.collection('companies').doc('011').collection('contacts').doc(extractedNumber).set(data);
            break;
            currentStep = userState.get(sender.to) || steps.START;
            switch (currentStep) {
                case steps.START:
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
                case steps.NEW_CONTACT:
                    await sendWhapiRequest('messages/text', { to: sender.to, body: 'Sebelum kita mula boleh saya dapatkan nama?' });
                    userState.set(sender.to, steps.START);
                    break;
                case steps.CREATE_CONTACT:
                    const name = `${message.text.body} default_name: ${sender.name}`;
                    const savedName = await handleOpenAINameAssistant(name);
                    await createContact(savedName,extractedNumber);
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
                        query =`${message.text.body} user_name: ${contactName}`;
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
async function callWebhookNotification(webhook,name,message) {

    const webhookUrl = webhook;
    const body = JSON.stringify({ name,message }); // Include sender's text in the request body
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
async function callWebhook(webhook,senderText,senderNumber,senderName) {
    console.log('Calling webhook...');
    const webhookUrl = webhook;
    const body = JSON.stringify({ senderText,senderNumber,senderName }); // Include sender's text in the request body
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
    const assistantId = 'asst_bFQpgPcgRiP8jaKihKwkhQAn';

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

async function runAssistant(assistantID,threadId) {

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
    const assistantId = 'asst_bFQpgPcgRiP8jaKihKwkhQAn';
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

async function createContact(number){
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
      const response = await limiter.schedule(() => axios.request(options));
      return(response.data.contact);
    } catch (error) {
        console.error(error);
    }
}

const teams = [
    ["hilmi","+60146531563"],
    [ "stanie","+60177527459"],
    ["zara","+60149704722"],

   
];

async function getCurrentTeamIndex() {
    const doc = await db.collection('companies').doc('011').get();
    return doc.exists ? doc.data().teamIndex : 0;
}

async function updateCurrentTeamIndex(index) {
    await db.collection('companies').doc('011').update({ teamIndex: index });
}

async function addTag(contactID, tag) {

    // Replace the console.log with your actual implementation
    await addtagbookedGHL(contactID, tag);
}

async function tagContact(contactID,sender) {
    let currentTeamIndex = await getCurrentTeamIndex();
    // Call the function to add the tag
 
    await addTag(contactID, assigned);

    // Update the team index
    currentTeamIndex = (currentTeamIndex + 1) % teams.length;

    // Save the current team index to Firestore
    await updateCurrentTeamIndex(currentTeamIndex);
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
async function addtagbookedGHL(contactID, tags) {
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
            tags: [...new Set([...previousTags, tags])]// Ensure tags are unique
        }
    };

    try {
        const response = await axios.request(options);
    } catch (error) {
        console.error('Error adding tag to contact:', error.response ? error.response.data : error);
    }
}
async function fetchConfigFromDatabase() {
    try {
        const docRef = db.collection('companies').doc('011');
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

module.exports = { handleNewMessagesBillert };