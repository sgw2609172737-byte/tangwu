'use strict';
const {app,BrowserWindow,shell,ipcMain}=require('electron');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {createStore}=require('./lib/local-training');
if(process.env.TANGWU_HEADLESS_TEST==='1'&&process.env.TANGWU_TEST_USER_DATA)app.setPath('userData',process.env.TANGWU_TEST_USER_DATA);
let win,training;
const entry=path.join(__dirname,'public/local.html');
function createWindow() {
  win=new BrowserWindow({width:1000,height:920,show:process.env.TANGWU_HEADLESS_TEST!=='1',autoHideMenuBar:true,
    backgroundColor:'#292735',title:'唐五 · 本地版',
    webPreferences:{contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,'preload.js')}});
  win.webContents.setWindowOpenHandler(({url})=>{
    if(url===pathToFileURL(path.join(__dirname,'public/artbook.html')).href)openArtbook();
    else if(/^https?:\/\//.test(url))shell.openExternal(url);
    return {action:'deny'};
  });
  win.webContents.on('will-navigate',(event,url)=>{if(url!==pathToFileURL(entry).href)event.preventDefault();});
  win.loadFile(entry);
}
function openArtbook() {
  const artbook=path.join(__dirname,'public/artbook.html');
  const gallery=new BrowserWindow({parent:win,width:1100,height:920,show:process.env.TANGWU_HEADLESS_TEST!=='1',autoHideMenuBar:true,
    backgroundColor:'#292735',webPreferences:{contextIsolation:true,nodeIntegration:false}});
  gallery.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  gallery.webContents.on('will-navigate',(event,url)=>{
    if(url===pathToFileURL(artbook).href)return;
    event.preventDefault();
    if(url===pathToFileURL(entry).href){gallery.close();if(win&&!win.isDestroyed()&&process.env.TANGWU_HEADLESS_TEST!=='1')win.focus();}
    else if(/^https?:\/\//.test(url))shell.openExternal(url);
  });
  gallery.loadFile(artbook);
}
const primary=app.requestSingleInstanceLock();
if(!primary)app.quit();
else {
app.on('second-instance',()=>{if(win&&!win.isDestroyed()){if(win.isMinimized())win.restore();if(process.env.TANGWU_HEADLESS_TEST!=='1'){win.show();win.focus();}}});
app.whenReady().then(()=>{
  // Portable records stay beside the EXE; installed/development builds use userData.
  const directory=process.env.PORTABLE_EXECUTABLE_DIR?path.join(process.env.PORTABLE_EXECUTABLE_DIR,'TangWu-data'):path.join(app.getPath('userData'),'training');
  training=createStore(path.join(directory,'human-records.json'));
  ipcMain.handle('tangwu:training',async(event,body)=>{
    if(event.sender!==win?.webContents||event.senderFrame?.url!==pathToFileURL(entry).href)throw Error('训练请求来源无效');
    try {return await training.request(body);}catch(e){return {ok:false,err:e.message,code:e.code===400?400:500};}
  });
  createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
}
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
