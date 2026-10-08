'use strict';
const {app,BrowserWindow,shell,ipcMain}=require('electron');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {createStore}=require('./lib/local-training');
if(process.env.TANGWU_HEADLESS_TEST==='1'&&process.env.TANGWU_TEST_USER_DATA)app.setPath('userData',process.env.TANGWU_TEST_USER_DATA);
let win,training;
const studyWindows=new Set();
const entry=path.join(__dirname,'public/local.html');
function workspaceURL(url){try{const parsed=new URL(url);if(parsed.protocol!=='file:')return null;for(const name of ['artbook.html','studio.html','rules.html'])if(parsed.pathname===new URL(pathToFileURL(path.join(__dirname,'public',name))).pathname)return {name,query:Object.fromEntries(parsed.searchParams)};}catch(_){}return null;}
function createWindow() {
  win=new BrowserWindow({width:1000,height:920,show:process.env.TANGWU_HEADLESS_TEST!=='1',autoHideMenuBar:true,
    backgroundColor:'#292735',title:'唐五 · 本地版',
    webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,'preload.js')}});
  win.webContents.setWindowOpenHandler(({url})=>{
    const page=workspaceURL(url);if(page)openWorkspace(page);
    else if(/^https?:\/\//.test(url))shell.openExternal(url);
    return {action:'deny'};
  });
  win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(entry).href)event.preventDefault();});
  win.loadFile(entry);
}
function openWorkspace(page) {
  const artbook=path.join(__dirname,'public',page.name);
  const gallery=new BrowserWindow({parent:win,width:page.name==='studio.html'?1400:1100,height:960,show:process.env.TANGWU_HEADLESS_TEST!=='1',autoHideMenuBar:true,
    backgroundColor:'#292735',webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,'studio-preload.js')}});
  const contents=gallery.webContents;studyWindows.add(contents);gallery.on('closed',()=>studyWindows.delete(contents));
  gallery.webContents.setWindowOpenHandler(({url})=>{const destination=workspaceURL(url);if(destination)openWorkspace(destination);else if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  gallery.webContents.on('will-navigate',(event,url)=>{
    if(workspaceURL(url))return;
    event.preventDefault();
    if(url===pathToFileURL(entry).href){gallery.close();if(win&&!win.isDestroyed()&&process.env.TANGWU_HEADLESS_TEST!=='1')win.focus();}
    else if(/^https?:\/\//.test(url))shell.openExternal(url);
  });
  gallery.loadFile(artbook,{query:page.query});
}
const primary=app.requestSingleInstanceLock();
if(!primary)app.quit();
else {
app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();if(process.env.TANGWU_HEADLESS_TEST!=='1'){win.show();win.focus();}}});
app.whenReady().then(()=>{
  // Portable records stay beside the EXE; installed/development builds use userData.
  const directory=process.env.PORTABLE_EXECUTABLE_DIR?path.join(process.env.PORTABLE_EXECUTABLE_DIR,'TangWu-data'):path.join(app.getPath('userData'),'training');
  training=createStore(path.join(directory,'human-records.json'));
  ipcMain.handle('tangwu:study-export',async(event)=>{
    if(!studyWindows.has(event.sender)||workspaceURL(event.senderFrame?.url)?.name!=='studio.html')throw Error('复盘请求来源无效');
    return training.request({op:'export'});
  });
  ipcMain.handle('tangwu:training',async(event,body)=>{
    if(event.sender!==win?.webContents||event.senderFrame?.url!==pathToFileURL(entry).href)throw Error('训练请求来源无效');
    try {return await training.request(body);}catch(e){return {ok:false,err:e.message,code:e.code===400?400:500};}
  });
  createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
}
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
