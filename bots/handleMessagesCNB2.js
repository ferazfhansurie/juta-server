// handleMessagesCNB2.js
const OpenAI = require('openai');
const axios = require('axios').default;

const { URLSearchParams } = require('url');
const admin = require('../firebase.js');
const db = admin.firestore();
const { Client, MessageMedia } = require('whatsapp-web.js');
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
async function handleNewMessagesCNB2(client, msg, botName) {
    try {
        console.log('Handling new messages from CNB2...');

        // Initial fetch of config
        await fetchConfigFromDatabase();
     //   client.sendMessage(msg.from, 'part');
        if (msg.fromMe) return;

        if(!msg.from.includes("whatsapp")){
            return;
        }

        const sender = {
            to: msg.from,
            name: msg.notifyName
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
        //let contactPresent = await getContact(extractedNumber);
        const chat = await msg.getChat();
        const contactData = await getContactDataFromDatabaseByPhone(extractedNumber);
        console.log(contactData)
   
        if (contactData !== null) {
            const stopTag = contactData.tags;
            console.log(stopTag);
            if (msg.fromMe){
                if(stopTag.includes('idle')){
                }
                return;
            }
            if(stopTag.includes('stop bot')){
                console.log('Bot stopped for this message');
                return;
            }else {
                contactID = extractedNumber;
                contactName = msg.notifyName ?? extractedNumber;
            
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
            contactName = msg.notifyName ?? extractedNumber;
         
            const thread = await createThread();
            threadID = thread.id;
            console.log(threadID);
            await saveThreadIDFirebase(contactID, threadID, idSubstring)
            console.log('sent new contact to create new contact');

            

        }
        let firebaseTags = []
        if(contactData){
            firebaseTags = contactData.tags ?? [];
        }
        
        let type = '';
            if(msg.type == 'chat'){
                type ='text'
              }else{
                type = msg.type;
              }
              const contact = await chat.getContact();
            
            if(extractedNumber.includes('status')){
                return;
            }
            const data = {
                additionalEmails: [],
                address1: null,
                assignedTo: null,
                businessId: null,
                phone:extractedNumber,
                tags:firebaseTags,
                chat: {
                    contact_id: extractedNumber,
                    id: msg.from,
                    name: contact.name || contact.pushname || extractedNumber,
                    not_spam: true,
                    tags: firebaseTags,
                    timestamp: chat.timestamp || Date.now(),
                    type: 'contact',
                    unreadCount: 0,
                    last_message: {
                        chat_id: msg.from,
                        from: msg.from ?? "",
                        from_me: msg.fromMe ?? false,
                        id: msg._data.id.id ?? "",
                        source: chat.deviceType ?? "",
                        status: "delivered",
                        text: {
                            body:msg.body ?? ""
                        },
                        timestamp: msg.timestamp ?? 0,
                        type: type,
                    },
                },
                chat_id: msg.from,
                city: null,
                companyName: null,
                contactName: contact.name || contact.pushname ||  extractedNumber,
                threadid: threadID ?? "",
                last_message: {
                    chat_id: msg.from,
                    from: msg.from ?? "",
                    from_me: msg.fromMe ?? false,
                    id: msg._data.id.id ?? "",
                    source: chat.deviceType ?? "",
                    status: "delivered",
                    text: {
                        body:msg.body ?? ""
                    },
                    timestamp: msg.timestamp ?? 0,
                    type: type,
                },
            };
            const message =  {
                chat_id: msg.from,
                from: msg.from ?? "",
                from_me: msg.fromMe ?? false,
                id: msg._data.id.id ?? "",
                source: chat.deviceType ?? "",
                status: "delivered",
                text: {
                    body:msg.body ?? ""
                },
                timestamp: msg.timestamp ?? 0,
                type: type,
            };
            const messageData = {
                chat_id: msg.from,
                from: msg.from ?? "",
                from_me: msg.fromMe ?? false,
                id: msg.id._serialized ?? "",
                source: chat.deviceType ?? "",
                status: "delivered",
                text: {
                    body:msg.body ?? ""
                },
                timestamp: msg.timestamp ?? 0,
                type: type,
              };
              
              const contactRef = db.collection('companies').doc(idSubstring).collection('contacts').doc(extractedNumber);
              //await contactRef.set(contactData, { merge: true });
              const messagesRef = contactRef.collection('messages');
          
              const messageDoc = messagesRef.doc(msg.id._serialized);
              await messageDoc.set(messageData, { merge: true });
            //   console.log(msg);
           await addNotificationToUser(idSubstring, messageData);
            
            // Add the data to Firestore
            await db.collection('companies').doc(idSubstring).collection('contacts').doc(extractedNumber).set(data, {merge: true});    
      
        if (msg.body.includes('/resetbot')) {
            const thread = await createThread();
            threadID = thread.id;
            await saveThreadIDGHL(contactID,threadID);
            await client.sendMessage(msg.from, "Bot is now restarting with new thread.");
            return;
        }
        
        if(firebaseTags.includes('stop bot')){
            console.log('bot stop');
            return;
        }

        currentStep = userState.get(sender.to) || steps.START;
        switch (currentStep) {
            case steps.START:
                var context = "";
                if (msg.hasQuotedMsg) {
                    const quotedMsg = await msg.getQuotedMessage();
                    context = quotedMsg.body;
                    query = `${msg.body} user_name: ${contactName} user replied to your previous message: ${context}`;
                } else {
                    query = `${msg.body} user_name: ${contactName} `;
                }
                const carpetTileFilePaths = {
                    'atria-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FAtria%20Leaflet.pdf?alt=media&token=73303523-9c3c-4935-bd14-1004b45a7f58',
                        'mw-moscow-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FMoscow%20St%20Petersburg%20Leaflet.pdf?alt=media&token=d5dfa885-1cf1-4232-aaf4-aa0c61aaa4f9',
                        'palette-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FPalette%20Leaflet.pdf?alt=media&token=625df591-76ce-4aac-a2f4-cca73f8706f4',
                        'pe-saintpetersburg-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FMoscow%20St%20Petersburg%20Leaflet.pdf?alt=media&token=d5dfa885-1cf1-4232-aaf4-aa0c61aaa4f9',
                        'canvas(new)-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FCanvas%20Leaflet.pdf?alt=media&token=377c77a6-c4d0-4778-9e37-b4a80a88ca0b',
                        'spark(new)-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FSpark%20Leaflet.pdf?alt=media&token=43756f59-08c9-4c10-9030-900acecdf3c4',
                        'brs-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FBRS%20Leaflet.pdf?alt=media&token=a9259cc5-7c7c-4860-97e3-65aae607c214',
                        'vlt-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FVLT%20Leaflet.pdf?alt=media&token=2289c5a0-d4bd-469f-bf27-eedb26d28051',
                        'bonn-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FBonn%20Leaflet.pdf?alt=media&token=004bdc9a-8d9e-446b-9f02-774d3e9bc1d0',
                        'phantom(new)-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FPhantom%20Leaflet.pdf?alt=media&token=9eadd923-c352-4b90-a5a6-7b523c934721',
                        'roma-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FRoma%20Leaflet%20(online).pdf?alt=media&token=7e68447b-7a98-4ed9-b168-e4bd5cda52c1',
                        'rhythm-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FRhythm%20Leaflet.pdf?alt=media&token=5b09b936-2223-4631-a48f-f877a2d17681',
                        'proearth-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FPro%20Earth%20Leaflet.pdf?alt=media&token=54d5ad6b-64d0-438e-98ac-5f6ca844fc53',
                        '3c-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2F3C%20Leaflet.pdf.pdf?alt=media&token=d40a927e-6383-478c-8447-960f24a34769',
                        'eno-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FENO%20Leaflet.pdf?alt=media&token=fbb321a6-9928-4401-ac63-68185a192d9a',
                        'alta-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FAlta%20leaflet.pdf?alt=media&token=595b3ebc-85db-48c4-8f79-8b75cc33754a',
                        'ndnewdelhi-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FNew%20Delhi%20Leaflet.pdf?alt=media&token=ad3bb24d-31d9-48dc-90fd-3d81c75eff19',
                        'colourtone-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FColourtone%20Leaflet.pdf?alt=media&token=6fc90919-1e29-4748-b9dd-e6ab83536515',
                        'starlight-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FStarlight%20Leaflet.pdf?alt=media&token=7955ba92-9a51-46ed-ac48-39ce3770cd3e',
                        'landscape-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FLandscape%20Leaflet.pdf?alt=media&token=eb1fbdf5-55be-453f-aa62-a17f9a2084be',
                        'liverpoollvp-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FLiverpool%20Leaflet.pdf?alt=media&token=aed6f0f4-b2d1-4bb3-a67f-e948047aa7eb',
                        'colourplus-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FColour%20Plus%20Leaflet.pdf?alt=media&token=1996713f-3af7-4d98-9368-ad6b9a34715a',
                        'aberdeen-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FAberdeen%20Leaflet.pdf?alt=media&token=6af44f4f-d7b5-46a2-888e-b9fe3e94758b',
                        'saipan-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Tile%2FSaipan%20Leaflet.pdf?alt=media&token=5f2f7c29-854e-42b0-bdb4-3af1781ce3bd',
                        'superloop-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FSuper%20Loop%20leaflet.pdf?alt=media&token=26d89c55-d0c4-4772-8859-6c07d5217b68',
                        'newloop-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FNew%20Loop%20Leaflet.pdf?alt=media&token=dc5ca05e-da6b-4b33-9a36-f572f80162fb',
                        'matahari-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FMatahari%20Leaflet.pdf?alt=media&token=4899ca90-3657-47d8-8bcb-18cb76e910bc',
                        'camb-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FCamb%20Leaflet.pdf?alt=media&token=1f68e3fd-645b-4f5c-a95e-70fbb8581359',
                        'patriot-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FPatriot%20Leaflet.pdf?alt=media&token=7a8785b9-e2d1-4552-87bf-7c522abee65a',
                        'heavyloop-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FHeavy%20Loop%20Leaflet.pdf?alt=media&token=dcc81e88-a851-44af-8159-b1b0477114e6',
                        'cloud-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FCloud%20Leaflet.pdf?alt=media&token=6b2ab550-231e-46f9-b0a0-a0ac64e9b97d',
                        'taurus-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FTaurus%20Leaflet.pdf?alt=media&token=90438fde-cdb8-4579-92ab-636a0015c2aa',
                        'transit-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FTransit%20Leaflet.pdf?alt=media&token=138bcf28-30ee-493f-acb1-b1ac41eeb7ef',
                        'canon-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FCanon%20Leaflet.pdf?alt=media&token=7523912d-efe7-4d2e-b22e-3aff13b670f5',
                        'metro-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FMetro%20Leaflet.pdf?alt=media&token=e22dc654-1a5f-415f-8b8d-18e6f335e927',
                        'tokyo-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FTokyo%20Leaflet.pdf?alt=media&token=5fff3ac7-e3ad-4bd8-b168-2447b281654b',
                        'villa-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FVilla%20Leaflet.pdf?alt=media&token=beb33a50-2311-4daa-9478-db1f9291d538',
                        'grandcanyon-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FGrand%20Canyon%20Leaflet.pdf?alt=media&token=89899c88-2e28-4473-9767-16c814675342',
                        'glitter-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FGlitter%20Leaflet.pdf?alt=media&token=b0864bcf-a168-4fae-a3c7-79187af2323e',
                        'mirage-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FMirage%20Leaflet.pdf.pdf?alt=media&token=4d1e1152-a519-480d-92d8-1a3bf0785518',
                        'impression-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FImpression%20Leaflet.pdf?alt=media&token=42cd7154-99a8-45e9-87c3-d238951b017b',
                        'timber-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FTimber%20Leaflet.pdf?alt=media&token=a82d78c6-c446-4dce-9bd8-b0cffaaf0039',
                        'rainbow-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FRainbow%20Leaflet.pdf?alt=media&token=b11ec600-6ab9-4b85-be4b-e8206ea5df7e',
                        'chamber-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FChamber%20Leaflet.pdf?alt=media&token=b798657c-845b-4ea0-b5c6-f40da2fe7960',
                        'nile-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FNile%20Leaflet.pdf.pdf?alt=media&token=5a5e1ea8-3ade-49f6-ab9b-8a8f24a5cfe5',
                        'sahara-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FSahara%20Leaflet.pdf?alt=media&token=fe9ed83b-cf1b-4959-842f-1f1bbcad004f',
                        'nybroadway2-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FNY%20Broadway%202%20Leaflet.pdf?alt=media&token=9dd5dc2e-b3d9-463f-8b52-00bad5d4fe54',
                        'element-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FElement%20Leaflet.pdf?alt=media&token=98444455-4706-40cf-80e2-2eca4ac6f0dd',
                        'vello-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FVello%20Leaflet.pdf?alt=media&token=9743d1e4-4c73-48fa-8ff3-e623ebab84d5',
                        'imperial-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FImperial%20Leaflet.pdf?alt=media&token=1b7ff207-d96b-47e1-95b5-7fbcd09a9700',
                        'luxe-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FLuxe%20Leaflet.pdf?alt=media&token=83991260-95a8-4aca-8266-ffce50fc950c',
                        'empire-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FEmpire%20Leaflet_page-0001.pdf?alt=media&token=e54d812e-061f-401b-8f43-81c6ad22861a',
                        'madinahmosque-thepriceper': 'https://firebasestorage.googleapis.com/v0/b/onboarding-a5fcb.appspot.com/o/CNB%2FPDF%2FCarpet%20Rolls%2FMadinah%20Leaflet.pdf?alt=media&token=8f9c58e3-4147-435f-8a5d-696fdc995738',
                        'dywood-thepriceper': 'URL_FOR_DY_WOOD',
                        'redwoodnew-thepriceper': 'URL_FOR_REDWOOD_NEW',
                        'implexdeluxe-thepriceper': 'URL_FOR_IMPLEX_DELUXE',
                        'woodland-thepriceper': 'URL_FOR_WOODLAND',
                        'woodlink-thepriceper': 'URL_FOR_WOODLINK',
                        'widewood-thepriceper': 'URL_FOR_WIDE_WOOD',
                        'pebblestone-thepriceper': 'URL_FOR_PEBBLE_STONE',
                        'woodtek-thepriceper': 'URL_FOR_WOODTEK',
                        'grandwood-thepriceper': 'URL_FOR_GRAND_WOOD',
                        '7mmgrass-thepriceper': 'URL_FOR_7MM_GRASS',
                        'meadow-thepriceper': 'URL_FOR_MEADOW',
                        'prado15mmw/uvstabalizer-thepriceper': 'URL_FOR_PRADO_15MM',
                        'nobel25mmw/uvstabalizer-thepriceper': 'URL_FOR_NOBEL_25MM',
                        '10mmw/uvstabalizer-thepriceper': 'URL_FOR_10MM_W_UV',
                        '10mm(white)w/uvstabalizer-thepriceper': 'URL_FOR_10MM_WHITE',
                        'softturf25mm(green)-thepriceper': 'URL_FOR_SOFTTURF_25MM_GREEN',
                        'softturf25mm(yellow)-thepriceper': 'URL_FOR_SOFTTURF_25MM_YELLOW',
                        '35mm(green)w/uvstabilizer-thepriceper': 'URL_FOR_35MM_GREEN',
                        '35mm(yellow)w/uvstabilizer-thepriceper': 'URL_FOR_35MM_YELLOW',
                };
                answer = await handleOpenAIAssistant(query, threadID);
                parts = answer.split(/\s*\|\|\s*/);
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i].trim();   
                    const check = part.toLowerCase();
                    const carpetCheck = check.replace(/\s+/g, '');             
                    if (part) {
                        await addtagbookedFirebase(contactID, 'idle');
                        const sentMessage = await client.sendMessage(msg.from, part);
                        console.log(sentMessage)
                        if (check.includes('patience')) {
                            
                            await addtagbookedFirebase(contactID, 'stop bot');
                        } 
                        if(check.includes('get back to you as soon as possible')){
                            console.log('check includes');
                            await callWebhook("https://hook.us1.make.com/qoq6221v2t26u0m6o37ftj1tnl0anyut", check, threadID);
                        }
                        console.log(carpetCheck);
                        for (const [key, filePath] of Object.entries(carpetTileFilePaths)) {
                            if (carpetCheck.includes(key)) {
                                console.log(`${key} sending file`);
                                const media = await MessageMedia.fromUrl(filePath);
                                await client.sendMessage(msg.from, media, {caption: `${extractProductName(key)}.pdf`});
                            }
                        }
                    }
                }
                console.log('Response sent.');
                userState.set(sender.to, steps.START);
                break;
            case steps.NEW_CONTACT:
                await client.sendMessage(msg.from, 'Sebelum kita mula boleh saya dapatkan nama?');
                userState.set(sender.to, steps.START);
                break;
            case steps.CREATE_CONTACT:
                const name = `${msg.body} default_name: ${sender.name}`;
                const savedName = await handleOpenAINameAssistant(name);
                await createContact(savedName, extractedNumber);
                pollParams = {
                    title: 'Are you dreaming of your next getaway?',
                    options: ['Yes'],
                };
                await client.sendMessage(msg.from, pollParams);
                await customWait(2500);
                userState.set(sender.to, steps.POLL);
                break;
            case steps.POLL:
                // Handle poll response (this might need to be adjusted based on how polls work with whatsapp-web.js)
                const contactDetails = await getContact(extractedNumber);
                contactID = contactDetails.id;
                contactName = contactDetails.fullNameLowerCase;
                const thread = await createThread();
                threadID = thread.id;
                console.log('thread ID generated: ', threadID);
                await saveThreadIDGHL(contactID, threadID);
                query = `${msg.body} user_name: ${contactName}`;
                answer = await handleOpenAIAssistant(query, threadID);
                parts = answer.split(/\s*\|\|\s*/);
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i].trim();                
                    if (part) {
                        await client.sendMessage(msg.from, part);
                        console.log('Part sent:', part);
                    }
                }
                console.log('Response sent.');
                userState.set(sender.to, steps.START);
                break;
            default:
                console.error('Unrecognized step:', currentStep);
                break;
        }

        return 'All messages processed';
    } catch (e) {
        console.error('Error:', e.message);
        return e.message;
    }
}
const extractProductName = (str) => {
    const match = str.split('-')[0];
    return match ? match.trim() : null;
};

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
        const contactsRef = db.collection('companies').doc('020').collection('contacts');
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
            console.log("error from handleNewMessagescnb: "+error)
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
    const assistantId = 'asst_dkA9uxVwvyUoSPS0eLg4Lrv9';
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
        const docRef = db.collection('companies').doc('020');
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

module.exports = { handleNewMessagesCNB2 };
