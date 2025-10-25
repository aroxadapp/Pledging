import { API_BASE_URL, translations, USDT_CONTRACT_ADDRESS, USDC_CONTRACT_ADDRESS, WETH_CONTRACT_ADDRESS } from './constants.js';
import { userAddress, usdtContract, usdcContract, wethContract } from './wallet.js';
import { updateStatus, updateInterest, updateBalancesUI, stakingStartTime, claimedInterest, pledgedAmount, accountBalance, isServerAvailable, isDevMode } from './ui.js';

let localLastUpdated = 0;
let pendingUpdates = [];

export async function loadUserDataFromServer() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!userAddress) {
        console.log(`loadUserDataFromServer: No user address, skipping.`);
        return;
    }
    try {
        const response = await retry(() => fetch(`${API_BASE_URL}/api/all-data`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        }));
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error(`Invalid content type: ${contentType || 'none'}, expected application/json`);
        }
        const allData = await response.json();
        console.log(`loadUserDataFromServer: Received server data:`, allData);
        const userData = allData.users[userAddress] || {};
        const localData = JSON.parse(localStorage.getItem('userData') || '{}');
        localLastUpdated = localData.lastUpdated || 0;
        if (allData.lastUpdated > localLastUpdated) {
            stakingStartTime = userData.stakingStartTime ? parseInt(userData.stakingStartTime) : null;
            claimedInterest = userData.claimedInterest ? parseFloat(userData.claimedInterest) : 0;
            pledgedAmount = userData.pledgedAmount ? parseFloat(userData.pledgedAmount) : 0;
            accountBalance = userData.accountBalance || { USDT: 0, USDC: 0, WETH: 0 };
            localStorage.setItem('userData', JSON.stringify({
                stakingStartTime,
                claimedInterest,
                pledgedAmount,
                accountBalance,
                nextBenefitTime: userData.nextBenefitTime,
                lastUpdated: allData.lastUpdated
            }));
            console.log(`loadUserDataFromServer: Synced user data from server:`, userData);
            localLastUpdated = allData.lastUpdated;
            await updateInterest();
        } else {
            console.log(`loadUserDataFromServer: Local data is newer or equal, keeping local state.`);
        }
        const pledgeData = allData.pledges[userAddress] || {};
        if (pledgeData.isPledging) {
            const tokenSymbol = {
                [USDT_CONTRACT_ADDRESS]: 'USDT',
                [USDC_CONTRACT_ADDRESS]: 'USDC',
                [WETH_CONTRACT_ADDRESS]: 'WETH'
            }[pledgeData.token] || 'Unknown';
            const totalPledgedValue = document.getElementById('totalPledgedValue');
            if (totalPledgedValue) {
                totalPledgedValue.textContent = `${parseFloat(pledgeData.amount).toFixed(2)} ${tokenSymbol}`;
            }
        }
    } catch (error) {
        console.warn(`loadUserDataFromServer: Failed to load from server: ${error.message}`);
        const localData = JSON.parse(localStorage.getItem('userData') || '{}');
        stakingStartTime = localData.stakingStartTime || null;
        claimedInterest = localData.claimedInterest || 0;
        pledgedAmount = localData.pledgedAmount || 0;
        accountBalance = localData.accountBalance || { USDT: 0, USDC: 0, WETH: 0 };
        if (isDevMode) {
            updateStatus(translations[currentLang].offlineWarning, true);
        }
    }
}

export async function saveUserData(data = null, addToPending = true) {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!userAddress) {
        console.log(`saveUserData: No user address available, skipping save.`);
        return;
    }
    const dataToSave = data || {
        stakingStartTime,
        claimedInterest,
        pledgedAmount,
        accountBalance,
        grossOutput: parseFloat(document.getElementById('grossOutputValue')?.textContent?.replace(' ETH', '') || '0'),
        cumulative: parseFloat(document.getElementById('cumulativeValue')?.textContent?.replace(' ETH', '') || '0'),
        nextBenefitTime: localStorage.getItem('nextBenefitTime'),
        lastUpdated: Date.now(),
        source: 'index.html'
    };
    if (!isServerAvailable) {
        if (addToPending) {
            pendingUpdates.push({ timestamp: Date.now(), data: dataToSave });
            localStorage.setItem('userData', JSON.stringify(dataToSave));
            if (isDevMode) {
                updateStatus(translations[currentLang].offlineWarning, true);
            }
        }
        return;
    }
    try {
        const response = await retry(() => fetch(`${API_BASE_URL}/api/user-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'bypass-tunnel-reminder': 'true'
            },
            body: JSON.stringify({ address: userAddress, data: dataToSave })
        }));
        if (!response.ok) throw new Error(`Failed to save user data, status: ${response.status}`);
        console.log(`saveUserData: User data sent to server successfully.`);
        localStorage.setItem('userData', JSON.stringify(dataToSave));
        localLastUpdated = dataToSave.lastUpdated;
        updateStatus(translations[currentLang].dataSent);
    } catch (error) {
        console.warn(`saveUserData: Could not send user data to server: ${error.message}`);
        if (addToPending) {
            pendingUpdates.push({ timestamp: Date.now(), data: dataToSave });
            localStorage.setItem('userData', JSON.stringify(dataToSave));
            if (isDevMode) {
                updateStatus(translations[currentLang].offlineWarning, true);
            }
        }
    }
}

async function checkServerStatus() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    try {
        const response = await fetch(`${API_BASE_URL}/api/status`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
        if (response.ok) {
            const { status, lastUpdated } = await response.json();
            isServerAvailable = status === 'available';
            if (isServerAvailable && pendingUpdates.length > 0) {
                await syncPendingUpdates(lastUpdated);
            }
            console.log(`checkServerStatus: Server is ${isServerAvailable ? 'available' : 'unavailable'}, last updated: ${lastUpdated}`);
            return isServerAvailable;
        }
    } catch (error) {
        console.warn(`checkServerStatus: Server is unavailable: ${error.message}`);
        isServerAvailable = false;
        if (isDevMode) {
            updateStatus(translations[currentLang].offlineWarning, true);
        }
    }
    return false;
}

async function syncPendingUpdates(serverLastUpdated) {
    for (const update of pendingUpdates) {
        if (update.timestamp > serverLastUpdated) {
            await saveUserData(update.data, false);
            console.log(`syncPendingUpdates: Synced update with timestamp: ${update.timestamp}`);
        } else {
            console.log(`syncPendingUpdates: Skipped outdated update with timestamp: ${update.timestamp}`);
        }
    }
    pendingUpdates = [];
}

export function setupSSE() {
    const currentLang = localStorage.getItem('language') || 'zh-Hant';
    if (!userAddress) {
        console.log(`setupSSE: No user address, skipping SSE setup.`);
        return;
    }
    let retryCount = 0;
    const maxRetries = 5;
    const baseRetryDelay = 10000;
    let fallbackPollingInterval = null;

    async function diagnoseSSEError() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/sse`, {
                method: 'GET',
                headers: { 'bypass-tunnel-reminder': 'true' }
            });
            const contentType = response headers.get('content-type') || 'none';
            const body = await response.text();
            console.error(`diagnoseSSEError: Response details - Status: ${response.status}, Content-Type: ${contentType}, Body: ${body.slice(0, 200)}...`);
            return { status: response.status, contentType, body };
        } catch (error) {
            console.error(`diagnoseSSEError: Failed to fetch SSE endpoint: ${error.message}`);
            return null;
        }
    }

    function startFallbackPolling() {
        if (fallbackPollingInterval) return;
        console.log(`setupSSE: Starting fallback polling due to SSE failure`);
        fallbackPollingInterval = setInterval(async () => {
            try {
                await loadUserDataFromServer();
                await updateInterest();
                console.log(`setupSSE: Fallback polling executed, lastUpdated: ${localLastUpdated}`);
            } catch (error) {
                console.error(`setupSSE: Fallback polling failed: ${error.message}`);
            }
        }, 5000);
    }

    function connectSSE() {
        const source = new EventSource(`${API_BASE_URL}/api/sse`, {
            headers: { 'bypass-tunnel-reminder': 'true' }
        });
        source.onmessage = async (event) => {
            try {
                console.log(`SSE: Raw message received: ${event.data}`);
                const parsed = JSON.parse(event.data);
                const eventType = parsed.event;
                const data = parsed.data || (eventType === 'ping' ? { timestamp: parsed.timestamp } : {});
                if (!eventType) {
                    throw new Error('Invalid SSE message format: missing event');
                }
                console.log(`SSE: Received event: ${eventType}`, data);
                if (eventType === 'dataUpdate' && data.users && data.users[userAddress]) {
                    console.log(`SSE: Received data update for address: ${userAddress}`, data.users[userAddress]);
                    if (data.lastUpdated > localLastUpdated) {
                        localLastUpdated = data.lastUpdated;
                        await loadUserDataFromServer();
                        await updateInterest();
                        const balances = {
                            usdt: userAddress ? await retry(() => usdtContract.balanceOf(userAddress)).catch(() => 0n) : 0n,
                            usdc: userAddress ? await retry(() => usdcContract.balanceOf(userAddress)).catch(() => 0n) : 0n,
                            weth: userAddress ? await retry(() => wethContract.balanceOf(userAddress)).catch(() => 0n) : 0n
                        };
                        updateBalancesUI(balances);
                    }
                } else if (eventType === 'ping') {
                    console.log(`SSE: Received ping, timestamp: ${data.timestamp || 'unknown'}`);
                } else if (eventType === 'error') {
                    console.warn(`SSE: Server reported error: ${data.message || 'unknown'}`);
                    updateStatus(`SSE error: ${data.message || 'unknown'}`, true);
                }
                retryCount = 0;
                if (fallbackPollingInterval) {
                    clearInterval(fallbackPollingInterval);
                    fallbackPollingInterval = null;
                    console.log(`setupSSE: Stopped fallback polling due to successful SSE connection`);
                }
            } catch (error) {
                console.error(`SSE: Error parsing message: ${error.message}, raw data: ${event.data}`);
            }
        };
        source.onerror = async () => {
            console.warn(`SSE: Connection error, attempt ${retryCount + 1}/${maxRetries}, reconnecting after ${baseRetryDelay * (retryCount + 1)}ms...`);
            source.close();
            isServerAvailable = false;
            const diag = await diagnoseSSEError();
            if (diag) {
                updateStatus(`SSE error: Server returned ${diag.contentType}. HTTP ${diag.status}. ${diag.contentType.includes('text/html') ? 'Likely tunnel reminder page. Try local testing or visit https://ventilative-lenten-brielle.ngrok-free.dev to click Continue.' : 'Check backend configuration.'}`, true);
            } else {
                updateStatus(translations[currentLang].offlineWarning, true);
            }
            if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(connectSSE, baseRetryDelay * (retryCount + 1));
            } else {
                console.error(`SSE: Max retries (${maxRetries}) reached, switching to fallback polling.`);
                updateStatus(translations[currentLang].sseFailed, true);
                startFallbackPolling();
            }
        };
        console.log(`SSE: Connection established for address: ${userAddress || 'unknown'}, API_BASE_URL: ${API_BASE_URL}`);
    }
    connectSSE();
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