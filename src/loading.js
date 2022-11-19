const { ipcRenderer, ipcMain, dialog } = require('electron');

const text_state_1 = document.querySelector('#text_state_1');
const text_state_2 = document.querySelector('#text_state_2');

text_state_1.textContent = 'Initiating';
text_state_2.textContent = 'Setting things up...';

text_state_1.hidden = false;
text_state_2.hidden = false;

ipcRenderer.on('setStateButtonText', function(event, string)
{
    if (text_state_1)
    {
        text_state_1.textContent = string;
        text_state_1.hidden = false;
    }
})

ipcRenderer.on('setStateModeButtonText', function(event, string)
{
    if (text_state_2)
    {
        text_state_2.textContent = string;
        text_state_2.hidden = false;
    }
})