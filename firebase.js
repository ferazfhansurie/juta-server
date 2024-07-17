const admin = require('firebase-admin'); // Pass module name as a string
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Decode the base64 environment variable to get the service account JSON
const serviceAccount = require('./sa_firebase.json');
const { config } = require('dotenv');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // Add your databaseURL if necessary
    // databaseURL: "https://your-database-url.firebaseio.com"
  });
}
class FirebaseWWebJS {
  constructor(config) {
      if (!config.serviceAccount) {
          throw new Error('Firestore service account is required');
      }
      
      initializeApp({
          credential: admin.credential.cert(serviceAccount)
      });
      
      this.db = getFirestore();
      this.collectionName = 'companies';
      this.docName = config.docName;
  }

  async sessionExists(options) {
      const docRef = this.db.collection(this.collectionName).doc(this.docName).collection('sessions').doc(options.session);
      const doc = await docRef.get();
      return doc.exists;
  }

  async save(options) {
      const { session, data } = options;
      await this.db.collection(this.collectionName).doc(this.docName).collection('sessions').doc(session).set(data);
  }

  async extract(options) {
      const docRef = this.db.collection(this.collectionName).doc(this.docName).collection('sessions').doc(options.session);
      const doc = await docRef.get();
      if (!doc.exists) {
          throw new Error('Session not found');
      }
      return doc.data();
  }

  async delete(options) {
      await this.db.collection(this.collectionName).doc(this.docName).collection('sessions').doc(options.session).delete();
  }
}

module.exports = admin, FirebaseWWebJS; // Use module.exports to export in CommonJS
