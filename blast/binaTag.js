const fetch = require('node-fetch');
const admin = require('../firebase.js');
const db = admin.firestore();
const OpenAI = require('openai');
const moment = require('moment-timezone');

let ghlConfig = {};
const openai = new OpenAI({
    apiKey: process.env.OPENAIKEY,
});
async function fetchConfigFromDatabase(idSubstring) {
    try {
        const docRef = db.collection('companies').doc(idSubstring);
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

const axios = require('axios');

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

async function handleBinaTag(req, res) {
    console.log('bina webhook');
    console.log(req.body);
    const idSubstring = '001';

    await fetchConfigFromDatabase(idSubstring);

    const { requestType, phone, first_name } = req.body;

    if (!phone || !first_name) {
        return res.status(400).json({ error: 'Phone number, name, and quote date are required' });
    }

    let phoneWithPlus = phone.replace(/\s+|-/g, '');
    if (!phoneWithPlus.startsWith('+')) {
        phoneWithPlus = "+" + phoneWithPlus;
    }
    const phoneWithoutPlus = phoneWithPlus.replace('+', '');

    const chatId = `${phoneWithoutPlus}@c.us`;

    console.log(chatId);
    try {
        switch (requestType) {
            case 'addBeforeQuote':
                await scheduleFollowUpBeforeQuoteMessages(chatId, idSubstring, first_name, phoneWithPlus);
                res.json({ success: true });
                break;
            case 'addAfterQuote':
                await scheduleFollowUpAfterQuoteMessages(chatId, idSubstring, first_name);
                res.json({ success: true });
                break;
            case 'removeBeforeQuote':
                await removeScheduledMessages(chatId, idSubstring);
                res.json({ success: true });
            case 'removeAfterQuote':
                await removeScheduledMessages(chatId, idSubstring);
                res.json({ success: true });
                break;
            default:
                res.status(400).json({ error: 'Invalid request type' });
        }
    } catch (error) {
        res.status(500).json({ phone: phoneWithPlus, first_name, success: false, error: error.message });
    }
}

async function scheduleFollowUpAfterQuoteMessages(chatId, idSubstring, customerName) {
    const dailyMessages = [
        [
            `Hello, ${customerName}, have you reviewed the quotation and photos we sent you?`,
            "If you have any questions, feel free to ask in this group ya... 😊"
        ],
        [
            "Regarding the quotation we sent you the other day…",
            "Is there anything you would like us to explain to you in more detail? 🤔"
        ],
        [
            "Good day,",
            "We can schedule your work within the next two weeks",
            "We'd like to know if you're interested in repairing your roof? 🧐"
        ],
        [
            "Hi",
            "You can ask questions about your roof quotation in this group yaa",
            "Mr. Kelvin, who came to inspect your roof that day, can answer any technical questions regarding your roof 👌"
        ],
        [
            "Hello, although the quotation is valid for only 14 days, but if you're interested in proceeding with the roof repair, please let us know",
            "We can see what we can do to adjust the quotation for you again 😊",
        ]
    ];

    for (let day = 0; day < dailyMessages.length; day++) {
        for (let i = 0; i < dailyMessages[day].length; i++) {
            // Schedule messages every 2 hours
            const scheduledTime = moment().add(day, 'days').add(i * 2, 'hours').set({hour: 10, minute: 0, second: 0});
            const message = dailyMessages[day][i];
            
            await scheduleReminderMessage(message, scheduledTime.toDate(), chatId, idSubstring);
        }
    }
}


async function scheduleFollowUpBeforeQuoteMessages(chatId, idSubstring, customerName, contactNumber) {
    const baseMessage = `Quotation reminder for ${customerName}, ${contactNumber}`;

    // Schedule the message once a day for 10 days
    for (let day = 1; day <= 10; day++) {
        const message = `Day ${day} ${baseMessage}`;
        const scheduledTime = moment().add(day, 'days').set({hour: 10, minute: 0, second: 0}); // Set to 10:00 AM each day
        await scheduleReminderMessage(message, scheduledTime.toDate(), '60135186862@c.us', idSubstring);
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
        messages: [
            {
              chatId: chatId,
              message: eventSummary
            }
          ],        
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

  async function removeScheduledMessages(chatId, idSubstring) {
    try {
        const scheduledMessagesRef = db.collection('companies').doc(idSubstring).collection('scheduledMessages');
        
        const snapshot = await scheduledMessagesRef
            .where('chatIds', 'array-contains', chatId)
            .where('status', '!=', 'completed')
            .get();
        
        for (const doc of snapshot.docs) {
            const messageId = doc.id;
            const messageData = doc.data();
            
            // Prepare the updated message data
            const updatedMessage = {
                ...messageData,
                status: 'completed',
                chatIds: messageData.chatIds.filter(id => id !== chatId)
            };
            
            // Ensure scheduledTime is properly formatted
            if (updatedMessage.scheduledTime && typeof updatedMessage.scheduledTime === 'object') {
                updatedMessage.scheduledTime = {
                    seconds: Math.floor(updatedMessage.scheduledTime.seconds),
                    nanoseconds: updatedMessage.scheduledTime.nanoseconds || 0
                };
            } else {
                // If scheduledTime is missing or invalid, use the current time
                updatedMessage.scheduledTime = {
                    seconds: Math.floor(Date.now() / 1000),
                    nanoseconds: 0
                };
            }
            
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





module.exports = { handleBinaTag };