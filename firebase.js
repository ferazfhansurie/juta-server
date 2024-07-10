const admin = require('firebase-admin'); // Pass module name as a string

// Decode the base64 environment variable to get the service account JSON
const serviceAccount = require('./sa_firebase.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // Add your databaseURL if necessary
    // databaseURL: "https://your-database-url.firebaseio.com"
  });
}

module.exports = admin; // Use module.exports to export in CommonJS
