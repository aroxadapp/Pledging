// get-secret.js
const { initializeApp } = require("firebase/app");
const { getFirestore, doc, getDoc } = require("firebase/firestore");

// 使用您的 Firebase 設定
const firebaseConfig = {
  apiKey: "AIzaSyALoso1ZAKtDrO09lfbyxyOHsX5cASPrZc",
  authDomain: "aroxa-mining.firebaseapp.com",
  projectId: "aroxa-mining",
  storageBucket: "aroxa-mining.firebasestorage.app",
  messagingSenderId: "596688766295",
  appId: "1:596688766295:web:5f2c5d65bf414f9dc7aa12"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function getPayoutSecret() {
  try {
    const snap = await getDoc(doc(db, 'secrets', 'payout'));
    if (snap.exists()) {
      console.log(snap.data().token);
    } else {
      console.error('PAYOUT_SECRET not found in Firestore');
      process.exit(1);
    }
  } catch (error) {
    console.error('Firestore error:', error.message);
    process.exit(1);
  }
}

getPayoutSecret();
