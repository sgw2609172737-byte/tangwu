'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('TWDesktopTraining',Object.freeze({
  request:body=>ipcRenderer.invoke('tangwu:training',body),
}));
