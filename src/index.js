const { ipcRenderer, ipcMain, dialog  } = require('electron');
const open_file_explorer                = require('open-file-explorer');
const app_data_path                     = require('appdata-path');
const electronSquirrelStartup           = require('electron-squirrel-startup');

const playButton                 = document.querySelector("#playButton");
const verifyButton               = document.querySelector("#verifyButton");
const dropdownOptions            = document.querySelectorAll('.dropup-content a');
const downloadBar                = document.querySelector(".download_progress");
const progressBar                = document.querySelector(".progress-bar");
const gameLocationText           = document.querySelector("#gameLocationText");
const settings_modal             = document.querySelector("app-settings");
const first_time_setup           = document.querySelector("app-install");
const firstDirectoryButton       = document.querySelector("#firstSelectDirectory");
const directoryButton            = document.querySelector("#selectDirectory");
const settingsButton             = document.querySelector("#settingsButton");
const settingsSave               = document.querySelector("#settingsSave");
const settingsExit               = document.querySelector("#settingsExit");
const minimizeButton             = document.querySelector("#minimizeButton");
const exitButton                 = document.querySelector("#exitButton");
const version                    = document.getElementById('version');
const updateNotification         = document.querySelector("app-notification");
const updateRestartButton        = document.querySelector('#updateRestartButton');

//ipcRenderer.showErrorBox = function(title, content) {
//    console.log(`${title}\n${content}`);
//};


var webview = document.querySelector('webview');
if (webview)
{
    webview.addEventListener('dom-ready', function()
    {
        webview.insertCSS('app-navigation { padding-top: 35px; }');
    });
}

ipcRenderer.on('showFirstTimeSetup', function(event)
{
    show_first_time_setup(true);
})

ipcRenderer.on('closeFirstTimeSetup', function(event)
{
    show_first_time_setup(false);
})

ipcRenderer.on('setPlayButtonState', function(event, state)
{
    if (playButton)
        playButton.disabled = state;
})

ipcRenderer.on('setPlayButtonText', function(event, string)
{
    if (playButton)
        playButton.textContent = string;
})

ipcRenderer.on('setProgressText', function(event, string)
{
    if (progressBar)
        progressBar.setAttribute("dataLabel", string);
})

ipcRenderer.on('setProgressBarPercent', function(event, percent)
{
    if (percent >= 0 && percent <= 100)
        progressBar.value = percent;
})

ipcRenderer.on('setGameLocation', function(event, string)
{
    console.log('Updating game location to: ' + string);
    gameLocationText.value           = string;
    global.userSettings.gameLocation = string;
})

ipcRenderer.on('hideProgressBar', function(event, bool)
{
    progressBar.hidden = bool;
})

playButton.addEventListener('click', function(event)
{
    playButton.disabled = true;
    console.log("Clicked on update/download button");
    if (playButton.textContent != "Play")
    {
        downloadBar.hidden     = false;
        playButton.textContent = "Running";

        progressBar.removeAttribute('hidden');
        ipcRenderer.send('beginDownload');
        console.log("Began download");
    }
    else
    {
        ipcRenderer.send('launchGame');
    }
})

firstDirectoryButton.addEventListener('click', function()
{
    ipcRenderer.send('firstSelectDirectory');
})

directoryButton.addEventListener('click', function()
{
    ipcRenderer.send('selectDirectory');
})

exitButton.addEventListener('click', function()
{
    if (global.movingInProgress != true)
    {
        ipcRenderer.send('quit');
    }
    else
    {
        ipcRenderer.send('error_moving_files');
    }
})

minimizeButton.addEventListener('click', function()
{
    ipcRenderer.send('minimize');
})

verifyButton.addEventListener('click', function()
{
    playButton.disabled    = true;
    verifyButton.disabled  = true;
    downloadBar.hidden     = false;
    playButton.textContent = "Running";

    progressBar.removeAttribute('hidden');
    ipcRenderer.send('beginVerify');
})

ipcRenderer.on('setVerifyButtonState', function(event, state)
{
    if (verifyButton)
        verifyButton.disabled = state;
})

ipcRenderer.on('setVerifyButtonText', function(event, string)
{
    if (verifyButton)
        verifyButton.innerHTML = string;
})

function show_modal_settings(show = false)
{
    console.log("Clicked on settings button");

    if (!settings_modal)
        return;

    var exists = settings_modal.classList.contains('show');

    if (show)
    {
        if (!exists)
            settings_modal.classList.add('show');
    }
    else
    {
        if (exists)
            settings_modal.classList.remove('show');
    }
}

function show_first_time_setup(show = false)
{
    if (!first_time_setup)
        return;

    var exists = first_time_setup.classList.contains('show');

    if (show)
    {
        if (!exists)
            first_time_setup.classList.add('show');
    }
    else
    {
        if (exists)
            first_time_setup.classList.remove('show');
    }
}

function show_notification(show = false)
{
    console.error("0");

    if (!updateNotification)
        return;
        console.error("1");

    var exists = updateNotification.classList.contains('show');

    if (show)
    {
        if (!exists)
            updateNotification.classList.add('show');
    }
    else
    {
        if (exists)
            updateNotification.classList.remove('show');
    }
}

settingsButton.addEventListener('click', function()
{
    show_modal_settings(true);
})

// TODO: Check and clear unsaved picks in case they persist upon next reopening of settings modal
settingsExit.addEventListener('click', function()
{
    show_modal_settings(false);
})

settingsSave.addEventListener('click', function()
{
    show_modal_settings(false);
})

ipcRenderer.send('app_version');

ipcRenderer.on('app_version', function(event, arg)
{
  ipcRenderer.removeAllListeners('app_version');
  version.innerText = 'Version: ' + arg.version;
});

updateRestartButton.addEventListener('click', function()
{
    ipcRenderer.send('restart_app');
})

ipcRenderer.on('update_available', function()
{
    ipcRenderer.removeAllListeners('update_available');
    message.innerText = 'A launcher update is available. Downloading now...';
    show_notification(true);
});

ipcRenderer.on('update_downloaded', function()
{
    ipcRenderer.removeAllListeners('update_downloaded');
    message.innerText = 'Update downloaded, and needs to be installed. Update?';
    updateRestartButton.removeAttribute('hidden');
    show_notification(true);
});

dropdownOptions.forEach(option => option.addEventListener('click', handleOptionSelected));
