const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('../sportspace-af6b4-firebase-adminsdk-fbsvc-fafbfe972d.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

const exportDir = path.join(__dirname, '../data_export');
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir);
}

async function exportFirestore() {
  console.log('Fetching collections...');
  const collections = await db.listCollections();
  
  for (const collection of collections) {
    console.log(`Exporting collection: ${collection.id}...`);
    const snapshot = await collection.get();
    const data = [];
    
    snapshot.forEach(doc => {
      data.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    fs.writeFileSync(
      path.join(exportDir, `${collection.id}.json`),
      JSON.stringify(data, null, 2)
    );
    console.log(`✅ Saved ${data.length} documents to ${collection.id}.json`);
  }
}

async function exportAuthUsers() {
  console.log('Exporting Auth users...');
  let allUsers = [];
  let pageToken = undefined;

  do {
    const listUsersResult = await auth.listUsers(1000, pageToken);
    const users = listUsersResult.users.map(userRecord => userRecord.toJSON());
    allUsers = allUsers.concat(users);
    pageToken = listUsersResult.pageToken;
  } while (pageToken);

  fs.writeFileSync(
    path.join(exportDir, 'auth_users.json'),
    JSON.stringify(allUsers, null, 2)
  );
  console.log(`✅ Saved ${allUsers.length} users to auth_users.json`);
}

async function main() {
  try {
    await exportFirestore();
    await exportAuthUsers();
    console.log('🎉 Export completed successfully!');
  } catch (error) {
    console.error('❌ Error during export:', error);
  }
}

main();
