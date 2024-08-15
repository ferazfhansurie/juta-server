// handleMessagesMSU.js
const OpenAI = require('openai');
const axios = require('axios').default;
const path = require('path');
const { URLSearchParams } = require('url');
const admin = require('../firebase.js');
const fs = require('fs');
const AsyncLock = require('async-lock');
const lock = new AsyncLock();

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
async function handleNewMessagesApplyRadar(req, res) {
    try {
        console.log('Handling new messages from ApplyRadar...');

        // Initial fetch of config
        await fetchConfigFromDatabase();

        const receivedMessages = req.body.messages;
        const messagePromises = [];

        for (const message of receivedMessages) {
            if (message.from_me) continue;
            if (!message.chat_id.includes("whatsapp")) continue;

            const lockKey = `chat_${message.chat_id}`;

            messagePromises.push(
                lock.acquire(lockKey, async () => {
                    return processMessage(message);
                }, { timeout: 30000 }) // 30 seconds timeout
            );
        }

        await Promise.all(messagePromises);

        res.send('All messages processed');
    } catch (e) {
        console.error('Error:', e.message);
        res.status(500).send(e.message);
    }
}

async function processMessage(message) {
    const sender = {
        to: message.chat_id,
        name: message.from_name
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
    const contactData = await getContactDataFromDatabaseByPhone(extractedNumber);
    const chat = await getChatMetadata(message.chat_id);
    let firebaseTags = [''];
   
    if (contactPresent !== null) {
        firebaseTags = contactPresent.tags ?? [''];
        const stopTag = contactPresent.tags ?? [];
        console.log(stopTag);
        if (stopTag.includes('stop bot')) {
            console.log('Bot stopped for this message');
            return;
        } else {
            contactID = contactPresent.id;
            contactName = contactPresent.fullNameLowerCase;
            console.log(contactID);
            console.log(contactPresent.id);
            const threadIdField = contactPresent.customFields.find(field => field.id === 'iXKFr1fQXsjAsrqLmjDD');
            if (threadIdField) {
                threadID = threadIdField.value;
            } else {
                const thread = await createThread();
                threadID = thread.id;
                await saveThreadIDGHL(contactID, threadID);
            }
        }
    } else {
        // await createContact(sender.name, extractedNumber);
        // await customWait(2500);
        // const contactPresent = await getContact(extractedNumber);
        // const stopTag = contactPresent.tags;
        // console.log(stopTag);
        // if (stopTag.includes('stop bot')) {
        //     console.log('Bot stopped for this message');
        //     return;
        // } else {
        //     contactID = contactPresent.id;
        //     contactName = contactPresent.fullNameLowerCase;
        //     console.log(contactID);
        //     console.log(contactPresent.id);
        //     const threadIdField = contactPresent.customFields.find(field => field.id === 'iXKFr1fQXsjAsrqLmjDD');
        //     if (threadIdField) {
        //         threadID = threadIdField.value;
        //     } else {
        //         const thread = await createThread();
        //         threadID = thread.id;
        //         await saveThreadIDGHL(contactID, threadID);
        //     }
        // }
        console.log('No contact available');
        return;
    }

    let contactPresent2 = await getContact(extractedNumber);
    console.log(message)
    const data = {
        additionalEmails: [],
        address1: null,
        assignedTo: null,
        businessId: null,
        phone: extractedNumber,
        tags: firebaseTags,
        chat: {
            chat_pic: chat.chat_pic ?? "",
            chat_pic_full: chat.chat_pic_full ?? "",
            contact_id: contactPresent2.id,
            id: message.chat_id,
            name: contactPresent2.firstName,
            not_spam: true,
            tags: firebaseTags,
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
        contactName: chat.name ?? extractedNumber,
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

    await addNotificationToUser('023', message);
    // Add the data to Firestore
    await db.collection('companies').doc('023').collection('contacts').doc(extractedNumber).set(data);

    currentStep = userState.get(sender.to) || steps.START;
    switch (currentStep) {
        case steps.START:
            if (message.type === 'text') {
                await handleTextMessage(message, sender, extractedNumber, contactName, threadID, contactID);
            } else if (message.type === 'document' ) {
                await handleDocumentMessage(message, sender, threadID);
            }else if (message.type === 'image') {
                await handleImageMessage(message, sender, threadID);
            }else {
                await sendWhapiRequest('messages/text', { to: sender.to, body: "Sorry, but we currently can't handle these types of files, we will forward your inquiry to our team!" });
                await sendWhapiRequest('messages/text', { to: sender.to, body: "In the meantime, if you have any questions, feel free to ask!" });
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
            await createContact(sender.name, extractedNumber);
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
                selectedOption.push(result.id);
            }
            if (message.action.votes[0] === selectedOption[0]) {
                const contactDetails = await getContact(extractedNumber);
                contactID = contactDetails.id;
                contactName = contactDetails.fullNameLowerCase;
                const thread = await createThread();
                threadID = thread.id;
                console.log('thread ID generated: ', threadID);
                await saveThreadIDGHL(contactID, threadID);
                query = `${message.text.body} user_name: ${contactName}`;
                answer = await handleOpenAIAssistant(query, threadID);
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
async function handleImageMessage(message, sender, threadID) {
    const query = message.image.caption ?? "The image you just received is an image containing my examination results. Please check my eligibility for MSU based on the results.";
    const imageUrl = message.image.link;

    try {
        // Create a message with the image attachment
        const response = await openai.beta.threads.messages.create(
            threadID,
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: query
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: imageUrl
                        }
                    }
                ]
            }
        );

        // Run the assistant to get a response
        const run = await openai.beta.threads.runs.create(
            threadID,
            { 
                assistant_id: "asst_XCacl9JStboccXkVGegQVAN9" // Replace with your actual assistant ID
            }
        );

        // Wait for the run to complete
        let runStatus = await openai.beta.threads.runs.retrieve(threadID, run.id);
        while (runStatus.status !== "completed") {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            runStatus = await openai.beta.threads.runs.retrieve(threadID, run.id);
        }

        // Retrieve the assistant's response
        const messages = await openai.beta.threads.messages.list(threadID);
        const assistantResponse = messages.data[0].content[0].text.value;

        await sendResponseParts(assistantResponse, sender.to);
    } catch (error) {
        console.error("Error in image processing:", error);
        await sendWhapiRequest('messages/text', { 
            to: sender.to, 
            body: "Sorry, I couldn't analyze that image. Could you try sending it again or asking a different question?" 
        });
    }
}
async function handleTextMessage(message, sender, extractedNumber, contactName, threadID, contactID) {
    const lockKey = `thread_${threadID}`;

    return lock.acquire(lockKey, async () => {
        if (message.text.body.includes('/resetbot')) {
            const thread = await createThread();
            threadID = thread.id;
            await saveThreadIDGHL(contactID, threadID);
            await sendWhapiRequest('messages/text', { to: sender.to, body: "Bot is now restarting with new thread." });
            return;
        }

        const query = `${message.text.body} user_name: ${contactName}`;
        const brochureFilePaths = {
            'mmu': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FMMU%20%20Campus%20Tour.mp4?alt=media&token=e97749d4-a2a2-43d8-8926-904f2e693906',
            'multimedia': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FMMU%20%20Campus%20Tour.mp4?alt=media&token=e97749d4-a2a2-43d8-8926-904f2e693906',
            'tenaga nasional': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FUNITEN%20Campus%20Tour.mp4?alt=media&token=7aa4dff3-53e2-46c7-989a-b8af0b008287',
            'uniten': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FUNITEN%20Campus%20Tour.mp4?alt=media&token=7aa4dff3-53e2-46c7-989a-b8af0b008287',
            'segi': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2FSEGi%20Campus%20Tour.mp4?alt=media&token=ed72c7bb-d7ef-43e8-9fc5-1b26375e79a1',
            'inti': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2Finti.mp4?alt=media&token=f6208fe6-10eb-4e33-91ee-eb116f0fe377',
            'apu': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2Fapu%20video.mp4?alt=media&token=d058e05c-5481-425e-a9f1-a03e65d51739',
            'asia pacific': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/ApplyRadar%2FVideo%2Fapu%20video.mp4?alt=media&token=d058e05c-5481-425e-a9f1-a03e65d51739',
        };
        const answer = await handleOpenAIAssistant(query, threadID);
        await sendResponseParts(answer, sender.to, brochureFilePaths, contactID);
    }, { timeout: 60000 }); // 60 seconds timeout
}

async function handleDocumentMessage(message, sender, threadID) {
    const lockKey = `thread_${threadID}`;

    return lock.acquire(lockKey, async () => {
        const query = message.document.caption ?? "";
        const documentDetails = {
            id: message.document.id,
            mime_type: message.document.mime_type,
            file_size: message.document.file_size,
            sha256: message.document.sha256,
            file_name: message.document.file_name,
            link: message.document.link,
            caption: message.document.caption
        };
        const answer = await handleOpenAIAssistantFile(query, threadID, documentDetails);
        await sendResponseParts(answer, sender.to);
    }, { timeout: 60000 }); // 60 seconds timeout
}

async function sendResponseParts(answer, to, brochureFilePaths = {}, contactID) {
    const parts = answer.split(/\s*\|\|\s*/);
    for (const part of parts) {
        if (part.trim()) {
            const cleanedPart = await removeTextInsideDelimiters(part);
            await sendWhapiRequest('messages/text', { to, body: cleanedPart });
            await handleSpecialResponses(part, to, brochureFilePaths, contactID);
        }
    }
}

async function handleSpecialResponses(part, to, brochureFilePaths, contactID) {
    
    for (const [key, filePath] of Object.entries(brochureFilePaths)) {
        console.log('part', part);
        console.log('key', key);
        if (part.includes(key) && part.includes("video")) {
            console.log(`${key} sending video, ${filePath}`);
            await sendWhapiRequest('messages/video', { to, media: filePath });
            addtagbookedGHL(contactID, "stop bot");
            break;
        }
    }

    if(part.includes("patience")) {
        addtagbookedGHL(contactID, "stop bot");
        return;
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

async function downloadFile(fileUrl, outputLocationPath) {
    const writer = fs.createWriteStream(outputLocationPath);
    const response = await axios({
        url: fileUrl,
        method: 'GET',
        responseType: 'stream'
    });

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function uploadFile(filePath, purpose) {
    try {
        const response = await openai.files.create({
            file: fs.createReadStream(filePath),
            purpose: purpose
        });
        return response;
    } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
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
        const response = await axios.request(options);
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

async function addMessage(threadId, message, documentDetails = null) {
    console.log('Adding a new message to thread: ' + threadId);

    const requestBody = {
        role: "user",
        content: message
    };

    if (documentDetails) {
        const fileExtension = path.extname(documentDetails.file_name);
        const tempFilePath = path.join(__dirname, `tempfile${fileExtension}`);
        await downloadFile(documentDetails.link, tempFilePath);
        const uploadedFile = await uploadFile(tempFilePath, 'assistants');
        requestBody.attachments = [
            {
                file_id: uploadedFile.id,
                tools: [
                    {
                        type: "file_search",
                    }
                ]
            }
        ];

        // Clean up the downloaded file
        fs.unlinkSync(tempFilePath);
    }

    const response = await openai.beta.threads.messages.create(threadId, requestBody);
    return response;
}

async function addMessageAssistant(threadId, message, documentDetails = null) {
    console.log('Adding a new message to thread: ' + threadId);

    const requestBody = {
        role: "assistant",
        content: message
    };

    if (documentDetails) {
        const fileExtension = path.extname(documentDetails.file_name);
        const tempFilePath = path.join(__dirname, `tempfile${fileExtension}`);
        await downloadFile(documentDetails.link, tempFilePath);
        const uploadedFile = await uploadFile(tempFilePath, 'assistants');
        requestBody.attachments = [
            {
                file_id: uploadedFile.id,
                tools: [
                    {
                        type: "file_search",
                    }
                ]
            }
        ];

        // Clean up the downloaded file
        fs.unlinkSync(tempFilePath);
    }

    const response = await openai.beta.threads.messages.create(threadId, requestBody);
    return response;
}

async function removeTextInsideDelimiters(text) {
    // Use a regular expression to find and remove the text inside the delimiters
    const cleanedText = text.replace(/【.*?】/g, '');
    return cleanedText;
}

async function callWebhook(webhook, senderText, senderNumber, senderName) {
    console.log('Calling webhook...');
    const webhookUrl = webhook;
    const body = JSON.stringify({ senderText, senderNumber, senderName }); // Include sender's text in the request body
    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: body
    });
    let responseData = "";
    if (response.status === 200) {
        responseData = await response.text(); // Dapatkan respons sebagai teks
    } else {
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
    
    if (status == 'completed') {
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

async function runNameAssistant(assistantID, threadId) {
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
    const assistantId = 'asst_XCacl9JStboccXkVGegQVAN9';

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
    
    if (status == 'completed') {
        clearInterval(pollingInterval);
        try {
            const messagesList = await openai.beta.threads.messages.list(threadId);
            const latestMessage = messagesList.body.data[0].content;

            console.log("Latest Message:");
            console.log(latestMessage[0].text.value);
            const answer = latestMessage[0].text.value;
            return answer;
        } catch (error) {
            console.log("error from Applyradar: " + error)
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

async function runAssistant(assistantID, threadId) {
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

async function runAssistantFile(assistantID, threadId) {
    console.log('Running assistant for thread: ' + threadId);
    const response = await openai.beta.threads.runs.create(
        threadId,
        {
            assistant_id: assistantID,
            instructions: "The file you just received is a document containing my examination results. Please check my eligibility for MSU based on the results."
        }
    );

    const runId = response.id;
    console.log('Run ID:', runId);

    const answer = await waitForCompletion(threadId, runId);
    return answer;
}

const rateLimitMap = new Map();
const messageQueue = new Map();
const processingThreads = new Set();

async function handleOpenAIAssistant(message, threadID) {
    const assistantId = 'asst_XCacl9JStboccXkVGegQVAN9';
    
    // Add message to queue
    if (!messageQueue.has(threadID)) {
        messageQueue.set(threadID, []);
    }
    messageQueue.get(threadID).push(message);

    // If the thread is already being processed, return a promise that will resolve when it's this message's turn
    if (processingThreads.has(threadID)) {
        return new Promise((resolve) => {
            const checkQueue = setInterval(() => {
                if (messageQueue.get(threadID)[0] === message) {
                    clearInterval(checkQueue);
                    resolve(processQueue(threadID, assistantId));
                }
            }, 100);
        });
    }

    // If the thread is not being processed, start processing
    processingThreads.add(threadID);
    return processQueue(threadID, assistantId);
}

async function handleOpenAIAssistantFile(message, threadID, documentDetails = null) {
    const assistantId = 'asst_XCacl9JStboccXkVGegQVAN9';
    await addMessage(threadID, message, documentDetails);
    const answer = await runAssistantFile(assistantId, threadID);
    return answer;
}

async function processQueue(threadID, assistantId) {
    while (messageQueue.get(threadID).length > 0) {
        const currentMessage = messageQueue.get(threadID)[0];
        
        // Check if we've made a request for this threadID recently
        const lastRequestTime = rateLimitMap.get(threadID) || 0;
        const currentTime = Date.now();
        const timeSinceLastRequest = currentTime - lastRequestTime;

        // If less than 5 seconds have passed since the last request, wait
        if (timeSinceLastRequest < 5000) {
            const waitTime = 5000 - timeSinceLastRequest;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // Update the last request time for this threadID
        rateLimitMap.set(threadID, Date.now());

        // Add message to the thread
        await addMessage(threadID, currentMessage);

        // Run the assistant
        const run = await openai.beta.threads.runs.create(
            threadID,
            { assistant_id: assistantId }
        );

        // Wait for the run to complete
        let runStatus = await openai.beta.threads.runs.retrieve(threadID, run.id);
        while (runStatus.status !== "completed") {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            runStatus = await openai.beta.threads.runs.retrieve(threadID, run.id);
        }

        // Retrieve the assistant's response
        const messages = await openai.beta.threads.messages.list(threadID);
        const answer = messages.data[0].content[0].text.value;

        // Remove processed message from queue
        messageQueue.get(threadID).shift();

        // If this was the last message in the queue, remove the thread from processing
        if (messageQueue.get(threadID).length === 0) {
            processingThreads.delete(threadID);
        }

        // Return answer for the current message
        return answer;
    }
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
        const docRef = db.collection('companies').doc('023');
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

module.exports = { handleNewMessagesApplyRadar };
