const fetch = require('node-fetch');
const admin = require('../firebase.js');
const db = admin.firestore();
const OpenAI = require('openai');
let ghlConfig = {};
const openai = new OpenAI({
    apiKey: process.env.OPENAIKEY,
});
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
async function handleApplyRadarBlast(req, res) {
    console.log('blasting apply radar');
    console.log(req.body);
    await fetchConfigFromDatabase();
    const whapiToken = ghlConfig.whapiToken;

    if (!whapiToken) {
        return res.status(500).json({ error: 'Whapi token not found in configuration' });
    }

    const { phone, first_name, threadid } = req.body;

    if (!phone || !first_name || !threadid) {
        return res.status(400).json({ error: 'Phone number, name, and threadID are required' });
    }

    const chatId = `${phone.replace(/^\+/, '')}@s.whatsapp.net`;
    console.log(chatId);
    console.log(first_name);
    try {
        const message = createMessage(first_name);
        const result = await sendWhapiRequest('messages/text', { to: chatId, body: message });
        // Add message to assistant
        await addMessageAssistant(threadid, `You sent this to the user: ${message}. Please remember this for the next interaction. Do not re-send this query to the user, this is only for you to remember the interaction.`);
        
        res.json({ phone, first_name, success: true, result });
    } catch (error) {
        console.error(`Error sending message to ${phone}:`, error);
        res.status(500).json({ phone, first_name, success: false, error: error.message });
    }
}
async function addMessageAssistant(threadId, message) {
    const response = await openai.beta.threads.messages.create(
        threadId,
        {
            role: "assistant",
            content: message
        }
    );
    console.log(response);
    return response;
}
function createMessage(name) {
    return `*Greetings from ApplyRadar*

Dear ${name}
We got your enquiry regarding study abroad earlier.
Are you still interested?
Reply:
Yes
No`;
}

module.exports = { handleApplyRadarBlast };