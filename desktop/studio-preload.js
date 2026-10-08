'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('TWStudioImport',Object.freeze({readRecords:()=>ipcRenderer.invoke('tangwu:study-export')}));
