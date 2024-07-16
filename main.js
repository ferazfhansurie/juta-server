const { Client, LocalAuth } = require('whatsapp-web.js');
require('dotenv').config();
const qrcode = require('qrcode-terminal');
const { handleNewMessagesTemplateWweb } = require('./bots/handleMessagesTemplateWweb');
const { handleNewMessagesTemplateWweb2 } = require('./bots/handleMessagesTemplateWweb2');

async function initializeBot(botName, handleMessages) {
    console.log(`DEBUG: Initializing bot: ${botName}`);
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: botName,
        }),
        puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });

    return new Promise((resolve, reject) => {
        let qrCodeScanned = false;

        client.on('loading_screen', (percent, message) => {
            console.log(`${botName} - LOADING SCREEN`, percent, message);
        });

        client.on('qr', (qr) => {
            if (!qrCodeScanned) {
                qrCodeScanned = true;
                console.log(`${botName} - QR RECEIVED. Please scan the following QR code:`);
                qrcode.generate(qr, { small: true });
            }
        });

        client.on('authenticated', () => {
            console.log(`${botName} - AUTHENTICATED`);
        });

        client.on('auth_failure', msg => {
            console.error(`${botName} - AUTHENTICATION FAILURE`, msg);
            reject(new Error(`Authentication failed for ${botName}: ${msg}`));
        });

        client.on('ready', () => {
            console.log(`${botName} - READY`);
            setupMessageHandler(client, handleMessages);
            resolve(client);
        });

        client.on('error', (error) => {
            console.error(`${botName} - CLIENT ERROR:`, error);
            reject(error);
        });

        console.log(`DEBUG: Initializing client for ${botName}`);
        client.initialize().catch(reject);
    });
}

function setupMessageHandler(client, handleMessages) {
    console.log('DEBUG: Setting up message handler');
    client.on('message', async (msg) => {
        console.log('DEBUG: Message received', msg);
        try {
            console.log('DEBUG: Calling handleMessages function');
            await handleMessages(client, msg);
            console.log('DEBUG: handleMessages function completed');
        } catch (error) {
            console.error('ERROR in message handling:', error);
        }
    });
}

async function initializeBots(bots) {
    for (const [botName, handleMessages] of Object.entries(bots)) {
        try {
            console.log(`DEBUG: Starting initialization for ${botName}`);
            const client = await initializeBot(botName, handleMessages);
            console.log(`DEBUG: Bot ${botName} initialized successfully`);
        } catch (error) {
            console.error(`Error initializing bot ${botName}:`, error);
        }
    }
}

async function main() {
    const bots = {
        '025': handleNewMessagesTemplateWweb,
        '026': handleNewMessagesTemplateWweb2,
    };

    await initializeBots(bots);
    console.log('DEBUG: All bots initialization completed');
}

main();