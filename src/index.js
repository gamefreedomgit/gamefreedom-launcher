const { ipcRenderer, ipcMain, dialog } = require('electron');
const open_file_explorer               = require('open-file-explorer');
const app_data_path                    = require('appdata-path');
const electronSquirrelStartup          = require('electron-squirrel-startup');

const playButton                 = document.querySelector("#playButton");
const expacSelect                = document.querySelector('#expacSelect');
const dropdownOptions            = document.querySelectorAll('.dropup-content a');
const downloadInfo               = document.querySelector(".downloadInfo");
const downloadBar                = document.querySelector(".download_progress");
const progressBar                = document.querySelector(".progress-bar");
const gameLocationText           = document.querySelector("#gameLocationText");
const settings_modal             = document.querySelector("app-settings");
const first_time_setup           = document.querySelector("app-install");
const firstDirectoryButton       = document.querySelector("#firstSelectDirectory");
const directoryButton            = document.querySelector("#selectDirectory");
const clearCacheButton           = document.querySelector("#clearCacheButton");
const settingsButton             = document.querySelector("#settingsButton");
const settingsSave               = document.querySelector("#settingsSave");
const settingsExit               = document.querySelector("#settingsExit");
const settingsCancel             = document.querySelector("#settingsCancel");
const minimizeButton             = document.querySelector("#minimizeButton");
const exitButton                 = document.querySelector("#exitButton");
const version                    = document.getElementById('version');
const updateNotification         = document.getElementById("updateNotification");
const updateRestartButton        = document.getElementById('updateRestartButton');
const updateCloseButton          = document.getElementById('updateCloseButton');
const verifySelectedGame         = document.getElementById('verifySelectedGame');

var userSettings;
var clearCacheOnSave;

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

function handleOptionSelected(element)
{
    if (expacSelect)
        expacSelect.textContent = element.target.textContent;

    ipcRenderer.send('expacSelected', element.target.textContent);
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

    if (expacSelect)
        expacSelect.disabled = state;
})

ipcRenderer.on('setPlayButtonText', function(event, string)
{
    if (playButton)
        playButton.textContent = string;
})

ipcRenderer.on('setExpacSelectText', function(event, string)
{
    if (expacSelect)
        expacSelect.textContent = string;
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

ipcRenderer.on('setGameLocation', function(event, location)
{
    console.log('Updating game location to: ' + location);

    gameLocationText.value = location;
    userSettings.gameLocation = location;
})

ipcRenderer.on('setUserSettings', function(event, settings)
{
    userSettings = settings;
    gameLocationText.value = userSettings.gameLocation;
})

ipcRenderer.on('hideProgressBar', function(event, bool)
{
    progressBar.hidden = bool;
})

playButton.addEventListener('click', function(event)
{
    playButton.disabled = true;
    console.log("Clicked on update/download button");
    if (playButton.textContent == "Download" || playButton.textContent == "Update")
    {
        //expacSelect.disabled   = true;
        downloadBar.hidden     = false;
        playButton.textContent = "Please wait...";

        progressBar.removeAttribute('hidden');
        ipcRenderer.send('beginDownload');
        console.log("Began download");
    }
    else
    {
        ipcRenderer.send("launchGame");
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

verifySelectedGame.addEventListener('click', function()
{
    expacSelect.disabled   = true;
    playButton.disabled    = true;
    downloadBar.hidden     = false;
    playButton.textContent = "Please wait...";

    progressBar.removeAttribute('hidden');
    ipcRenderer.send('beginVerify');
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

settingsButton.addEventListener('click', function()
{
    show_modal_settings(true);
})

settingsExit.addEventListener('click', function()
{
    show_modal_settings(false);
})

settingsSave.addEventListener('click', function()
{
    show_modal_settings(false);

    if (clearCacheOnSave)
    {
        ipcRenderer.send("clearCache");
        clearCacheOnSave = false;
    }

    ipcRenderer.send("saveUserSettings", userSettings);
})

settingsCancel.addEventListener('click', function()
{
    // TODO: Check and clear unsaved picks in case they persist upon next reopening of settings modal
    show_modal_settings(false);
})

clearCacheButton.addEventListener('click', function()
{
    ipcRenderer.send("clearCache");
})

ipcRenderer.send('app_version');

ipcRenderer.on('app_version', function(event, arg)
{
  ipcRenderer.removeAllListeners('app_version');
  version.innerText = 'Version ' + arg.version;
});

updateCloseButton.addEventListener('click', function()
{
    updateNotification.classList.remove('active');
})
  
updateRestartButton.addEventListener('click', function()
{
    ipcRenderer.send('restart_app');
})

ipcRenderer.on('update_available', function()
{
    ipcRenderer.removeAllListeners('update_available');
    message.innerText = 'A launcher update is available. Downloading now...';
    updateNotification.classList.add('active');
});
  
ipcRenderer.on('update_downloaded', function()
{
    ipcRenderer.removeAllListeners('update_downloaded');
    message.innerText = 'Update downloaded, and needs to be installed. Restart now?';
    updateRestartButton.removeAttribute('hidden');
    updateNotification.classList.add('active');
});

dropdownOptions.forEach(option => option.addEventListener('click', handleOptionSelected));
