// handleMessagesMSU.js
const OpenAI = require('openai');
const axios = require('axios').default;

const { URLSearchParams } = require('url');
const admin = require('../firebase.js');
const db = admin.firestore();

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
async function handleNewMessagesMSU(req, res) {
    try {
        console.log('Handling new messages from MSU...');

        // Initial fetch of config
        await fetchConfigFromDatabase();

        const receivedMessages = req.body.messages;
        for (const message of receivedMessages) {
        
            if (message.from_me) break;
          
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
            const contactPresent = await getContact(extractedNumber);
            const idleTag = contactPresent.tags
            if (idleTag && idleTag.includes('idle')) {
                await removeTagBookedGHL(contactPresent.id,'idle');
            }
            if (contactPresent !== null) {
                const stopTag = contactPresent.tags;
                console.log(stopTag);
                if(stopTag.includes('stop bot')){
                    console.log('Bot stopped for this message');
                    continue;
                }else {
                    contactID = contactPresent.id;
                    contactName = contactPresent.fullNameLowerCase;
                    console.log(contactID);
                    console.log(contactPresent.id);
                    const threadIdField = contactPresent.customFields.find(field => field.id === 'IrpD9F1cqKdWoO5XYwYq');
                    if (threadIdField) {
                        threadID = threadIdField.value;
                    } else {
                        const thread = await createThread();
                        threadID = thread.id;
                        await saveThreadIDGHL(contactID,threadID);
                    }
                }
            }else{
   
                await createContact(sender.name,extractedNumber);
                await customWait(2500);
                const contactPresent = await getContact(extractedNumber);
                const stopTag = contactPresent.tags;
                console.log(stopTag);
                if(stopTag.includes('stop bot')){
                    console.log('Bot stopped for this message');
                    continue;
                }else {
                    contactID = contactPresent.id;
                    contactName = contactPresent.fullNameLowerCase;
                    console.log(contactID);
                    console.log(contactPresent.id);
                    const threadIdField = contactPresent.customFields.find(field => field.id === 'IrpD9F1cqKdWoO5XYwYq');
                    if (threadIdField) {
                        threadID = threadIdField.value;
                    } else {
                        const thread = await createThread();
                        threadID = thread.id;
                        await saveThreadIDGHL(contactID,threadID);
                    }
                }
          
                console.log('sent new contact to create new contact');
            }
            if(message.text.body.toLowerCase().includes('cod') || message.text.body.toLowerCase().includes('bank in')){
                await addtagbookedGHL(contactID, 'closed');
            }
            currentStep = userState.get(sender.to) || steps.START;
            switch (currentStep) {
                case steps.START:
                    
                    query = `${message.text.body} user_name: ${contactName}`;
                    const brochureFilePaths = {
                        'Pharmacy': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUPharmacy.pdf?alt=media&token=c62cb344-2e92-4f1b-a6b0-e7ab0f5ae4f6',
                        'Business Management': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUBusinessManagement.pdf?alt=media&token=ac8f2ebb-111e-4c5a-a278-72ed0d747243',
                        'Education Social Sciences': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUEducationandSocialSciences.pdf?alt=media&token=6a3e95b8-80cc-4224-ad09-82014e3100c1',
                        'Edu Socsc': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUEducationandSocialSciences.pdf?alt=media&token=6a3e95b8-80cc-4224-ad09-82014e3100c1',
                        'Medicine': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUInternationalMedicalSchool.pdf?alt=media&token=5925b4cb-b8cf-4b65-98fc-4818b71ef480',
                        'Hospitality Creativearts': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUHospitalityandCreativeArts.pdf?alt=media&token=a84d92f2-462a-4a81-87ec-b4b376e4c581',
                        'Hospitality And Creative Arts': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUHospitalityandCreativeArts.pdf?alt=media&token=a84d92f2-462a-4a81-87ec-b4b376e4c581',
                        'Information Science Engine': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUInformationSciencesandEngineering.pdf?alt=media&token=7c1aa152-72b4-4504-9e3b-9e92e982a563',
                        'Information Science': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUInformationSciencesandEngineering.pdf?alt=media&token=7c1aa152-72b4-4504-9e3b-9e92e982a563',
                        'Engineering': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUInformationSciencesandEngineering.pdf?alt=media&token=7c1aa152-72b4-4504-9e3b-9e92e982a563',
                        'Health And Life Sciences': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUHealthandLifeSciences.pdf?alt=media&token=5f57551a-dfd1-4456-bf61-9e0bc4312fe1',
                        'Informationsc Engin': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUInformationSciencesandEngineering.pdf?alt=media&token=7c1aa152-72b4-4504-9e3b-9e92e982a563',
                        'Health Lifesc': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSUHealthandLifeSciences.pdf?alt=media&token=5f57551a-dfd1-4456-bf61-9e0bc4312fe1',
                    };
                    answer = await handleOpenAIAssistant(query,threadID);
                    parts = answer.split(/\s*\|\|\s*/);
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i].trim();                
                        if (part) {
                            if(part.includes("【"))
                            {
                                const cleanedPart = await removeTextInsideDelimiters(part)
                                await sendWhapiRequest('messages/text', { to: sender.to, body: cleanedPart });
                                if(part.includes('Sit back, relax and enjoy our campus tour!') || part.includes('Jom lihat fasiliti-fasiliti terkini')){
                                    console.log('sending vid');
                                    const vidPath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSU%20campus%20tour%20smaller%20size.mp4?alt=media&token=efb9496e-f2a8-4210-8892-5f3f21b9a061';
                                    // Send the video
                                    await sendWhapiRequest('messages/video', { to: sender.to, media: vidPath });
                                }    
                                if(part.includes('Check out our food video!') || part.includes('Jom makan makan!')){
                                    const vidPath2 = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSU%20FOOD%208%20small%20size.mp4?alt=media&token=0b7131c0-ca99-4fe2-8260-fe0004f9ee96';
                                    // Send the video
                                    await sendWhapiRequest('messages/video', { to: sender.to, media: vidPath2 });
                                }
                                for (const [key, filePath] of Object.entries(brochureFilePaths)) {
                                    if (part.includes(key) && part.includes("Brochure")) {
                                        console.log(`${key} sending file, ${filePath}`);
                                        await sendWhapiRequest('messages/document', { to: sender.to, media: filePath, filename: `${key}.pdf`});
                                        break;
                                    }
                                }      
                            }else{
                                await sendWhapiRequest('messages/text', { to: sender.to, body: part });
                                if(part.includes('Sit back, relax and enjoy our campus tour!') || part.includes('Jom lihat fasiliti-fasiliti terkini')){
                                    console.log('sending vid');
                                    const vidPath = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSU%20campus%20tour%20smaller%20size.mp4?alt=media&token=efb9496e-f2a8-4210-8892-5f3f21b9a061';
                                    // Send the video
                                    await sendWhapiRequest('messages/video', { to: sender.to, media: vidPath });
                                }    
                                if(part.includes('Check out our food video!') || part.includes('Jom makan makan!')){
                                    const vidPath2 = 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/MSU%20FOOD%208%20small%20size.mp4?alt=media&token=0b7131c0-ca99-4fe2-8260-fe0004f9ee96';
                                    // Send the video
                                    await sendWhapiRequest('messages/video', { to: sender.to, media: vidPath2 });
                                }
                                if(part.includes('enjoy reading about the exciting')){
                                    // Add 'idle' tag to GHL
                                    await addtagbookedGHL(contactID, 'idle');
                                    
                                    // Start a timer for 1 hour
                                    setTimeout(async () => {
                                        // Check if the 'idle' tag is still present after 1 hour
                                        const contactPresent = await getContact(extractedNumber);
                                        const idleTags = contactPresent.tags
                                        if (idleTags && idleTags.includes('idle')) {
                                            // If 'idle' tag is still present, you can perform additional actions here
                                            console.log(`User ${contactID} has been idle for 1 hour`);
                                            await sendWhapiRequest('messages/text', { to: sender.to, body: "Would you like to check out our cool campus tour? It's got top-notch facilities and amazing student life." });

                                        }
                                    }, 60 * 60 * 1000); // 1 hour in milliseconds
                                }
                                for (const [key, filePath] of Object.entries(brochureFilePaths)) {
                                    if (part.includes(key) && part.includes("Brochure")) {
                                        console.log(`${key} sending file, ${filePath}`);
                                        await sendWhapiRequest('messages/document', { to: sender.to, media: filePath, filename: `${key}.pdf`});
                                        break;
                                    }
                                }      
                            }
                        }
                    }
                    console.log('Response sent.');
                    await addtagbookedGHL(contactID, 'replied');

                    userState.set(sender.to, steps.START);
                    break;                
                case steps.NEW_CONTACT:
                    await sendWhapiRequest('messages/text', { to: sender.to, body: 'Sebelum kita mula boleh saya dapatkan nama?' });
                    userState.set(sender.to, steps.START);
                    break;
                case steps.CREATE_CONTACT:
       
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
async function createThread() {
    console.log('Creating a new thread...');
    const thread = await openai.beta.threads.create();
    return thread;
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

async function removeTextInsideDelimiters(text) {
    // Use a regular expression to find and remove the text inside the delimiters
    const cleanedText = text.replace(/【.*?】/g, '');
    return cleanedText;
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
    const assistantId = 'asst_tqVuJyl8gR1ZmV7OdBdQBNEF';

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
        try{
            const messagesList = await openai.beta.threads.messages.list(threadId);
            const latestMessage = messagesList.body.data[0].content;

            console.log("Latest Message:");
            console.log(latestMessage[0].text.value);
            const answer = latestMessage[0].text.value;
            return answer;
        } catch(error){
            console.log("error from handleNewMessagesMSU: "+error)
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
    console.log('Run ID:', runId);

    const answer = await waitForCompletion(threadId, runId);
    return answer;
}

const rateLimitMap = new Map();

async function handleOpenAIAssistant(message, threadID) {
    const assistantId = 'asst_tqVuJyl8gR1ZmV7OdBdQBNEF';
    
    // Check if we've made a request for this threadID recently
    const lastRequestTime = rateLimitMap.get(threadID) || 0;
    const currentTime = Date.now();
    const timeSinceLastRequest = currentTime - lastRequestTime;

    // If less than 5 seconds have passed since the last request, wait
    if (timeSinceLastRequest < 5000) {
        console.log(`Rate limiting: Waiting ${5000 - timeSinceLastRequest}ms before next request for threadID ${threadID}`);
        await new Promise(resolve => setTimeout(resolve, 5000 - timeSinceLastRequest));
    }

    // Update the last request time for this threadID
    rateLimitMap.set(threadID, Date.now());

    await addMessage(threadID, message);
    const answer = await runAssistant(assistantId, threadID);
    return answer;
}

async function sendWhapiRequest(endpoint, params = {}, method = 'POST') {
    console.log('Sending request to Whapi.Cloud...');
    const options = {
        method: method,
        headers: {
            Authorization: `Bearer ${ghlConfig.whapi_token}`,
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
        const docRef = db.collection('companies').doc('021');
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

module.exports = { handleNewMessagesMSU };
