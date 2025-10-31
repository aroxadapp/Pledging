const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, setDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyALoso1ZAKtDrO09lfbyxyOHsX5cASPrZc",
  authDomain: "aroxa-mining.firebaseapp.com",
  projectId: "aroxa-mining"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function payoutInterest() {
  const now = Date.now();
  const nowET = new Date(now - 5 * 60 * 60 * 1000); // 美西時間
  if (![0, 12].includes(nowET.getHours())) {
    console.log("非發息時間，跳過");
    return;
  }

  const snap = await getDocs(collection(db, 'users'));
  let count = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (!data.isActive) continue;

    const pledged = parseFloat(data.pledgedAmount || 0);
    const interest = parseFloat(data.accountBalance?.interest || 0);
    const total = pledged + interest;
    const cycleInterest = total * (0.01 / 60);

    await setDoc(d.ref, {
      claimable: (data.claimable || 0) + cycleInterest,
      lastPayoutTime: now
    }, { merge: true });
    count++;
  }
  console.log(`利息發放完成！更新 ${count} 位用戶`);
}

payoutInterest().catch(console.error);
