import { translations } from './constants.js';
import { userAddress, usdtContract, usdcContract, wethContract } from './wallet.js';
import { saveUserData, loadUserDataFromServer } from './sse.js';

export let stakingStartTime = null;
export let claimedInterest = 0;
export let pledgedAmount = 0;
export let accountBalance = { USDT: 0, USDC: 0, WETH: 0 };
export let isServerAvailable = false;
export const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.isDevMode;

const connectButton = document.getElementById('connectButton');
const statusDiv = document.getElementById('status');
const startBtn = document.getElementById('startBtn');
const pledgeBtn = document.getElementById('pledgeBtn');
const pledgeAmountInput = document.getElementById('pledgeAmount');
const pledgeDuration = document.getElementById('pledgeDuration');
const pledgeToken = document.getElementById('pledgeToken');
const refreshWallet = document.getElementById('refreshWallet');
const walletTokenSelect = document.getElementById('walletTokenSelect');
const walletBalanceAmount = document.getElementById('walletBalanceAmount');
const accountBalanceValue = document.getElementById('accountBalanceValue');
const totalValue = document.getElementById('totalValue');
export let grossOutputValue = document.getElementById('grossOutputValue');
export let cumulativeValue = document.getElementById('cumulativeValue');
const nextBenefit = document.getElementById('nextBenefit');
const claimBtn = document.createElement('button');
claimBtn.id = 'claimButton';
const claimModal = document.getElementById('claimModal');
const closeModal = document.getElementById('closeModal');
const confirmClaim = document.getElementById('confirmClaim');
const cancelClaim = document.getElementById('cancelClaim');
const modalClaimableETH = document.getElementById('modalClaimableETH');
const modalEthPrice = document.getElementById('modalEthPrice');
const modalSelectedToken = document.getElementById('modalSelectedToken');
const modalEquivalentValue = document.getElementById('modalEquivalentValue');
const modalTitle = document.getElementById('modalTitle');
const languageSelect = document.getElementById('languageSelect');

const elements = {
    title: document.getElementById('title'),
    subtitle: document.getElementById('subtitle'),
    tabLiquidity: document.querySelector('.tab[data-tab="liquidity"]'),
    tabPledging: document.querySelector('.tab[data-tab="pledging"]'),
    grossOutputLabel: document.getElementById('grossOutputLabel'),
    cumulativeLabel: document.getElementById('cumulativeLabel'),
    walletBalanceLabel: document.getElementById('walletBalanceLabel'),
    accountBalanceLabel: document.getElementById('accountBalanceLabel'),
    compoundLabel: document.getElementById('compoundLabel'),
    startBtnText: startBtn,
    pledgeAmountLabel: document.getElementById('pledgeAmountLabel'),
    pledgeDurationLabel: document.getElementById('pledgeDurationLabel'),
    pledgeBtnText: pledgeBtn,
    totalPledgedLabel: document.getElementById('totalPledgedLabel'),
    expectedYieldLabel: document.getElementById('expectedYieldLabel'),
    apyLabel: document.getElementById('apyLabel'),
    lockedUntilLabel: document.getElementById('lockedUntilLabel')
};

let interestInterval = null;
let nextBenefitInterval = null;
let localLastUpdated = 0;
let pendingUpdates = [];

export function updateStatus(message, isWarning = false) {
    if (!statusDiv) {
        console.warn(`updateStatus: statusDiv 未找到，無法顯示狀態訊息: ${message}`);
        return;
    }
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (message === translations[currentLang].offlineWarning && !isDevMode) {
        statusDiv.innerHTML = '';
        statusDiv.style.display = 'none';
        console.log(`updateStatus: Suppressed offline warning in production: ${message}`);
        return;
    }
    statusDiv.innerHTML = message || '';
    statusDiv.style.display = message ? 'block' : 'none';
    statusDiv.style.color = isWarning ? '#FFD700' : '#FFFFFF';
    console.log(`updateStatus: ${isWarning ? 'Warning' : 'Info'}: ${message}`);
}

export function resetState(showMsg = true) {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    console.log(`resetState: Executing state reset...`);
    stakingStartTime = null;
    claimedInterest = 0;
    pledgedAmount = 0;
    accountBalance = { USDT: 0, USDC: 0, WETH: 0 };
    if (interestInterval) {
        clearInterval(interestInterval);
        console.log(`resetState: Cleared interest interval: ${interestInterval}`);
    }
    if (nextBenefitInterval) {
        clearInterval(nextBenefitInterval);
        console.log(`resetState: Cleared next benefit interval: ${nextBenefitInterval}`);
    }
    localStorage.clear();
    console.log(`resetState: Local storage cleared.`);
    if (startBtn) {
        startBtn.style.display = 'block';
        startBtn.textContent = translations[currentLang]?.startBtnText || 'Start';
    }
    const existingClaimBtn = document.getElementById('claimButton');
    if (existingClaimBtn) {
        existingClaimBtn.remove();
        console.log(`resetState: Removed claim button.`);
    }
    if (connectButton) {
        connectButton.classList.remove('connected');
        connectButton.textContent = 'Connect';
        connectButton.title = 'Connect Wallet';
        console.log(`resetState: Reset connect button state.`);
    }
    disableInteractiveElements(true);
    if (walletBalanceAmount) walletBalanceAmount.textContent = '0.000';
    if (walletTokenSelect) walletTokenSelect.value = 'USDT';
    if (accountBalanceValue) accountBalanceValue.textContent = '0.000 USDT';
    if (grossOutputValue) grossOutputValue.textContent = '0 ETH';
    if (cumulativeValue) cumulativeValue.textContent = '0 ETH';
    if (showMsg) updateStatus(translations[currentLang].noWallet, true);
}

export function disableInteractiveElements(disable = false) {
    if (startBtn) startBtn.disabled = disable;
    if (pledgeBtn) pledgeBtn.disabled = disable;
    if (pledgeAmountInput) pledgeAmountInput.disabled = disable;
    if (pledgeDuration) pledgeDuration.disabled = disable;
    if (pledgeToken) pledgeToken.disabled = disable;
    if (refreshWallet) {
        refreshWallet.style.pointerEvents = disable ? 'none' : 'auto';
        refreshWallet.style.color = disable ? '#999' : '#ff00ff';
    }
    if (claimBtn) claimBtn.disabled = disable;
    console.log(`disableInteractiveElements: Interactive elements ${disable ? 'disabled' : 'enabled'}.`);
}

export function updateBalancesUI(walletBalances) {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!walletTokenSelect) {
        console.warn(`updateBalancesUI: walletTokenSelect is missing`);
        return;
    }
    if (!window.ethers || !window.ethers.utils) {
        console.error(`updateBalancesUI: Ethers.js utils 未載入。請檢查 CDN 或網絡。`);
        updateStatus(translations[currentLang].ethersError, true);
        return;
    }
    const selectedToken = walletTokenSelect.value;
    const decimals = { USDT: 6, USDC: 6, WETH: 18 };
    const walletTokenBigInt = walletBalances[selectedToken.toLowerCase()] || 0n;
    const formattedWalletBalance = window.ethers.utils.formatUnits(walletTokenBigInt, decimals[selectedToken]);
    if (walletBalanceAmount) {
        walletBalanceAmount.textContent = parseFloat(formattedWalletBalance).toFixed(3);
        console.log(`updateBalancesUI: Updated wallet balance for ${selectedToken}: ${formattedWalletBalance}`);
    }
    const claimedBalance = accountBalance[selectedToken] || 0;
    const pledgeData = JSON.parse(localStorage.getItem('userData') || '{}').pledgedAmount || 0;
    const totalAccountBalance = parseFloat(formattedWalletBalance) + claimedBalance + (selectedToken === pledgeToken.value ? pledgeData : 0);
    if (accountBalanceValue) {
        accountBalanceValue.textContent = `${totalAccountBalance.toFixed(3)} ${selectedToken}`;
        console.log(`updateBalancesUI: Updated account balance for ${selectedToken}: ${totalAccountBalance}`);
    }
    if (parseFloat(formattedWalletBalance) < 0.001) {
        updateStatus(`Notice: Your ${selectedToken} balance is zero.`, true);
    } else if (statusDiv && statusDiv.style.color === 'rgb(255, 215, 0)') {
        updateStatus("");
    }
}

export function updateTotalFunds() {
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

export async function updateInterest() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!grossOutputValue || !cumulativeValue) {
        console.warn(`updateInterest: Missing DOM elements:`, { grossOutputValue: !!grossOutputValue, cumulativeValue: !!cumulativeValue });
        const acquired = await retryDOMAcquisition();
        if (!acquired) {
            console.error(`updateInterest: Failed to re-acquire DOM elements, skipping update.`);
            updateStatus(translations[currentLang].error + ': Failed to update UI due to missing DOM elements', true);
            return;
        }
    }
    if (!userAddress) {
        console.log(`updateInterest: Skipping due to missing userAddress:`, { userAddress });
        grossOutputValue.textContent = '0 ETH';
        cumulativeValue.textContent = '0 ETH';
        return;
    }

    let finalGrossOutput = 0;
    let finalCumulative = 0;
    let overrideApplied = false;

    if (isServerAvailable) {
        try {
            const response = await retry(() => fetch(`${API_BASE_URL}/api/all-data`, {
                cache: 'no-cache'
            }));
            if (response.ok) {
                const allData = await response.json();
                console.log(`updateInterest: Received server data:`, allData);
                if (allData.lastUpdated > localLastUpdated) {
                    const userOverrides = allData.overrides[userAddress] || {};
                    const userData = allData.users[userAddress] || {};
                    if (userOverrides.grossOutput != null && userOverrides.cumulative != null) {
                        finalGrossOutput = Number(userOverrides.grossOutput);
                        finalCumulative = Number(userOverrides.cumulative);
                        if (!isNaN(finalGrossOutput) && !isNaN(finalCumulative)) {
                            overrideApplied = true;
                            console.log(`updateInterest: Admin override applied:`, { finalGrossOutput, finalCumulative });
                        }
                    }
                    stakingStartTime = userData.stakingStartTime ? parseInt(userData.stakingStartTime) : stakingStartTime;
                    claimedInterest = userData.claimedInterest ? parseFloat(userData.claimedInterest) : claimedInterest;
                    pledgedAmount = userData.pledgedAmount ? parseFloat(userData.pledgedAmount) : pledgedAmount;
                    accountBalance = userData.accountBalance || accountBalance;
                    localLastUpdated = allData.lastUpdated;
                    localStorage.setItem('userData', JSON.stringify({
                        stakingStartTime,
                        claimedInterest,
                        pledgedAmount,
                        accountBalance,
                        nextBenefitTime: userData.nextBenefitTime,
                        lastUpdated: allData.lastUpdated
                    }));
                    console.log(`updateInterest: Synced data from server:`, userData);
                } else {
                    console.log(`updateInterest: Server data not newer, skipping sync.`);
                }
            } else {
                throw new Error(`HTTP error: ${response.status}`);
            }
        } catch (error) {
            console.warn(`updateInterest: Fetch error, using local data: ${error.message}`);
            isServerAvailable = false;
            updateStatus(translations[currentLang].offlineWarning, true);
        }
    }

    if (!overrideApplied && stakingStartTime && pledgedAmount > 0) {
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - stakingStartTime) / 1000);
        const baseInterestRate = 0.000001;
        const interestRate = baseInterestRate * pledgedAmount;
        finalGrossOutput = elapsedSeconds * interestRate;
        finalCumulative = finalGrossOutput - claimedInterest;
        console.log(`updateInterest: Using local calculation:`, { finalGrossOutput, finalCumulative, pledgedAmount, elapsedSeconds });
    }

    if (grossOutputValue && cumulativeValue) {
        grossOutputValue.textContent = `${Number(finalGrossOutput).toFixed(7)} ETH`;
        cumulativeValue.textContent = `${Number(finalCumulative).toFixed(7)} ETH`;
        console.log(`updateInterest: Updated UI - Gross Output: ${finalGrossOutput.toFixed(7)} ETH, Cumulative: ${finalCumulative.toFixed(7)} ETH`);
    } else {
        console.error(`updateInterest: Failed to update UI, DOM elements missing:`, { grossOutputValue: !!grossOutputValue, cumulativeValue: !!cumulativeValue });
        updateStatus(translations[currentLang].error + ': Failed to update UI due to missing DOM elements', true);
    }
}

export async function activateStakingUI() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    const storedStartTime = localStorage.getItem('stakingStartTime');
    if (storedStartTime) {
        stakingStartTime = parseInt(storedStartTime);
        console.log(`activateStakingUI: Restored staking start time: ${stakingStartTime}`);
    } else {
        stakingStartTime = Date.now();
        localStorage.setItem('stakingStartTime', stakingStartTime.toString());
        console.log(`activateStakingUI: Set new staking start time: ${stakingStartTime}`);
    }
    claimedInterest = parseFloat(localStorage.getItem('claimedInterest')) || 0;
    pledgedAmount = parseFloat(localStorage.getItem('pledgedAmount')) || 0;
    const storedAccountBalance = JSON.parse(localStorage.getItem('accountBalance'));
    if (storedAccountBalance) {
        accountBalance = storedAccountBalance;
        console.log(`activateStakingUI: Restored account balance:`, accountBalance);
    }
    if (startBtn) startBtn.style.display = 'none';
    if (document.getElementById('claimButton')) return;
    claimBtn.textContent = translations[currentLang]?.claimBtnText || 'Claim';
    claimBtn.className = 'start-btn';
    claimBtn.style.marginTop = '10px';
    claimBtn.disabled = false;
    const placeholder = document.getElementById('claimButtonPlaceholder');
    placeholder ? placeholder.appendChild(claimBtn) : document.getElementById('liquidity').appendChild(claimBtn);
    console.log(`activateStakingUI: Added claim button to UI.`);
    if (!claimBtn.hasEventListener) {
        claimBtn.addEventListener('click', claimInterest);
        claimBtn.hasEventListener = true;
        console.log(`activateStakingUI: Added event listener to claim button.`);
    }
    if (interestInterval) clearInterval(interestInterval);
    interestInterval = setInterval(updateInterest, 5000);
    console.log(`activateStakingUI: Set interest interval: ${interestInterval}`);
    if (nextBenefitInterval) clearInterval(nextBenefitInterval);
    nextBenefitInterval = setInterval(updateNextBenefitTimer, 1000);
    console.log(`activateStakingUI: Set next benefit interval: ${nextBenefitInterval}`);
    await saveUserData();
}

export async function claimInterest() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    await loadUserDataFromServer();
    const claimableETHString = cumulativeValue?.textContent?.replace(' ETH', '').trim() || '0';
    const claimableETH = parseFloat(claimableETHString);
    console.log(`claimInterest: Raw claimableETHString: ${claimableETHString}, Parsed: ${claimableETH}`);
    if (isNaN(claimableETH) || claimableETH < 0.0000001) {
        updateStatus(translations[currentLang].noClaimable, true);
        return;
    }

    const prices = await getEthPrices();
    if (!prices || prices.usd === 0) {
        updateStatus(translations[currentLang].priceError, true);
        return;
    }

    const selectedToken = walletTokenSelect.value;
    let ethToTokenRate = prices[selectedToken.toLowerCase()];
    if (isNaN(ethToTokenRate) || ethToTokenRate === 0) {
        ethToTokenRate = selectedToken === 'WETH' ? 1 : prices.usd;
        console.warn(`claimInterest: Fallback rate for ${selectedToken}: ${ethToTokenRate}`);
    }
    const valueInToken = claimableETH * ethToTokenRate;
    console.log(`claimInterest: Claim details:`, { claimableETH, selectedToken, ethToTokenRate, valueInToken, prices });

    if (isNaN(valueInToken) || valueInToken <= 0) {
        updateStatus(translations[currentLang].invalidCalc, true);
        return;
    }

    if (modalClaimableETH && modalEthPrice && modalSelectedToken && modalEquivalentValue && modalTitle) {
        modalClaimableETH.textContent = `${claimableETH.toFixed(7)} ETH`;
        modalEthPrice.textContent = `$${prices.usd.toFixed(2)}`;
        modalSelectedToken.textContent = selectedToken;
        modalEquivalentValue.textContent = `${valueInToken.toFixed(3)} ${selectedToken}`;
        modalTitle.textContent = translations[currentLang]?.claimBtnText || 'Claim Interest';
        claimModal.style.display = 'flex';
    } else {
        console.error(`claimInterest: Modal elements missing:`, {
            modalClaimableETH: !!modalClaimableETH,
            modalEthPrice: !!modalEthPrice,
            modalSelectedToken: !!modalSelectedToken,
            modalEquivalentValue: !!modalEquivalentValue,
            modalTitle: !!modalTitle
        });
    }
}

export async function getEthPrices() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    try {
        updateStatus(translations[currentLang].fetchingBalances);
        const response = await retry(() => fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,usdt'));
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const usdPrice = data.ethereum?.usd || 0;
        const usdtPrice = data.ethereum?.usdt || usdPrice;
        const prices = {
            usd: usdPrice,
            usdt: usdtPrice,
            usdc: usdPrice,
            weth: usdPrice
        };
        console.log(`getEthPrices: Processed prices:`, prices);
        updateStatus("");
        return prices;
    } catch (error) {
        console.error(`getEthPrices: Could not fetch ETH price: ${error.message}`);
        updateStatus(translations[currentLang].priceError, true);
        return null;
    }
}

export function updateLanguage(lang) {
    localStorage.setItem('language', lang);
    languageSelect.value = lang;
    for (let key in elements) {
        if (elements[key] && translations[lang]?.[key]) {
            elements[key].textContent = translations[lang][key];
        }
    }
    if (claimBtn.parentNode) {
        claimBtn.textContent = translations[lang]?.claimBtnText || 'Claim';
    }
    if (modalTitle) {
        modalTitle.textContent = translations[lang]?.claimBtnText || 'Claim Interest';
    }
    updateNextBenefitTimer();
    console.log(`updateLanguage: Switched to language: ${lang}`);
}

export function updateNextBenefitTimer() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!nextBenefit) return;
    const nextBenefitTimestamp = parseInt(localStorage.getItem('nextBenefitTime'));
    const label = (translations[currentLang]?.nextBenefit || "Next Benefit: 00:00:00").split(':')[0];
    if (!nextBenefitTimestamp) {
        nextBenefit.textContent = `${label}: 00:00:00`;
        console.log(`updateNextBenefitTimer: No next benefit time set.`);
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
        console.log(`updateNextBenefitTimer: Updated next benefit time: ${newNextBenefitTimestamp}`);
    }
    const totalSeconds = Math.floor(diff / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    nextBenefit.textContent = `${label}: ${hours}:${minutes}:${seconds}`;
    console.log(`updateNextBenefitTimer: Updated timer: ${hours}:${minutes}:${seconds}`);
}

export function setInitialNextBenefitTime() {
    if (localStorage.getItem('nextBenefitTime')) return;
    console.log(`setInitialNextBenefitTime: Setting initial benefit countdown target based on US Eastern Time...`);
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
    console.log(`setInitialNextBenefitTime: Set next benefit time: ${finalNextBenefitTimestamp}`);
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

async function retryDOMAcquisition(maxAttempts = 3, delayMs = 500) {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    let attempts = 0;
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