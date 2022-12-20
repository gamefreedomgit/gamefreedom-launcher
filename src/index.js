const { ipcRenderer }               = require('electron');

// 1. Buttons
const Button_Play                   = document.querySelector("#Button_Play");
const Button_Validate               = document.querySelector("#Button_Validate");
const Button_SelectDirectory        = document.querySelector("#Button_SelectDirectory");
const Button_SelectDirectory_Path   = document.querySelector("#Button_SelectDirectory_Path");
const Button_SelectDirectory_First  = document.querySelector("#Button_SelectDirectory_First");
const Button_Settings               = document.querySelector("#Button_Settings");
const Button_Settings_Exit          = document.querySelector("#Button_Settings_Exit");
const Button_Settings_Save          = document.querySelector("#Button_Settings_Save");
const Button_Minimize               = document.querySelector("#Button_Minimize");
const Button_Maximize               = document.querySelector("#Button_Maximize");
const Button_Exit                   = document.querySelector("#Button_Exit");
const Button_Restart                = document.querySelector("#Button_Restart");
const Button_Integrity              = document.querySelector("#Button_Integrity");

// 2. Progress Bars
const ProgressBar                   = document.querySelector("#ProgressBar");
const ProgressBar_Data_Or_Value     = document.querySelector("#ProgressBar_Data_Or_Value");

// 3. Modals
const Modal_Settings                = document.querySelector("app-settings");
const Modal_Notification_Update     = document.querySelector("app-notification-update");
const Modal_Notification_Integrity  = document.querySelector("app-notification-integrity-failed");
const Modal_FirstTimeSetup          = document.querySelector("app-install");
const Modal_Path                    = document.querySelector("app-path");

// 4. Misc
const GameLocationText              = document.querySelector("#GameLocationText");
const LauncherVersion               = document.querySelector("#LauncherVersion");

// 5. Messages
const Message_Update                = document.querySelector("#MessageUpdate");
const Message_Integrity             = document.querySelector("#MessageIntegrityFailed");

// 1. Buttons
// Button_Play
Button_Play.addEventListener('click', function(event)
{
    Button_Play.disabled = true;

    if (Button_Play.textContent != "Play")
    {
        Button_Play.textContent       = "Running";
        ipcRenderer.send('BeginDownloadOrValidate');
    }
    else
    {
        ipcRenderer.send('LaunchGame');
    }
});

ipcRenderer.on('SetPlayButtonState', function(event, state)
{
    Button_Play.disabled = state;
});

ipcRenderer.on('SetPlayButtonText', function(event, string)
{
    Button_Play.textContent = string;
});

// Button_Validate
Button_Validate.addEventListener('click', function()
{
    Button_Play.textContent    = "Running";
    Button_Play.disabled       = true;
    Button_Validate.disabled   = true;
    ProgressBar.hidden         = false;


    ipcRenderer.send('BeginDownloadOrValidate');
});

ipcRenderer.on('SetValidateButtonState', function(event, state)
{
    Button_Validate.disabled = state;
});

ipcRenderer.on('SetValidateButtonText', function(event, string)
{
    Button_Validate.innerHTML = string;
});

// Button_SelectDirectory
Button_SelectDirectory.addEventListener('click', function()
{
    ipcRenderer.send('SelectDirectory');
});

// Button_SelectDirectory_Path
Button_SelectDirectory_Path.addEventListener('click', function()
{
    ipcRenderer.send('SelectDirectory_Path');
});

ipcRenderer.on('ShowPathSetup', function(event)
{
    Show_Modal_Path(true);
});

ipcRenderer.on('ClosePathSetup', function(event)
{
    Show_Modal_Path(false);
});

function Show_Modal_Path(show = false)
{
    if (!Modal_Path)
        return;

    var exists = Modal_Path.classList.contains('show');

    if (show)
    {
        if (!exists)
            Modal_Path.classList.add('show');
    }
    else
    {
        if (exists)
            Modal_Path.classList.remove('show');
    }
}

// Button_SelectDirectory_First
Button_SelectDirectory_First.addEventListener('click', function()
{
    ipcRenderer.send('SelectDirectory_First');
});

function Show_Modal_FirstTimeSetup(show = false)
{
    if (!Modal_FirstTimeSetup)
        return;

    var exists = Modal_FirstTimeSetup.classList.contains('show');

    if (show)
    {
        if (!exists)
            Modal_FirstTimeSetup.classList.add('show');
    }
    else
    {
        if (exists)
            Modal_FirstTimeSetup.classList.remove('show');
    }
}

ipcRenderer.on('ShowFirstTimeSetup', function(event)
{
    Show_Modal_FirstTimeSetup(true);
});

ipcRenderer.on('CloseFirstTimeSetup', function(event)
{
    Show_Modal_FirstTimeSetup(false);
});

// Button_Settings
Button_Settings.addEventListener('click', function()
{
    Show_Modal_Settings(true);
});

// Button_Settings_Exit
// TODO: Check and clear unsaved picks in case they persist upon next reopening of settings modal
Button_Settings_Exit.addEventListener('click', function()
{
    Show_Modal_Settings(false);
});

// Button_Settings_Save
Button_Settings_Save.addEventListener('click', function()
{
    Show_Modal_Settings(false);
});

// Button_Minimize
Button_Minimize.addEventListener('click', function()
{
    ipcRenderer.send('minimize');
});

// Button_Maximize
Button_Maximize.addEventListener('click', function()
{
    ipcRenderer.send('maximize');
});

// Button_Exit
Button_Exit.addEventListener('click', function()
{
    ipcRenderer.send('quit');
});

// Button_Restart
Button_Restart.addEventListener('click', function()
{
    ipcRenderer.send('restart_app');
});

// Button_Integrity
Button_Integrity.addEventListener('click', function()
{
    Show_Notification_Integrity(false);
    ipcRenderer.send('BeginDownloadOrValidate');
});

// 2. Progress Bars
// ProgressBar_Data_Or_Value
ipcRenderer.on('SetDataProgressBar', function(event, percent, data, hide)
{
    if (percent >= 0 && percent <= 100)
        ProgressBar_Data_Or_Value.value = percent;

    if (data)
        ProgressBar_Data_Or_Value.setAttribute("dataLabel", data);

    ProgressBar.hidden = hide;
});

// 3. Modals
// Modal_Settings
function Show_Modal_Settings(show = false)
{
    if (!Modal_Settings)
        return;

    var exists = Modal_Settings.classList.contains('show');

    if (show)
    {
        if (!exists)
            Modal_Settings.classList.add('show');
    }
    else
    {
        if (exists)
            Modal_Settings.classList.remove('show');
    }
}

// Modal_Notification_Update
function Show_Notification_Update(show = false)
{
    if (!Modal_Notification_Update)
        return;

    var exists = Modal_Notification_Update.classList.contains('show');

    if (show)
    {
        if (!exists)
            Modal_Notification_Update.classList.add('show');
    }
    else
    {
        if (exists)
            Modal_Notification_Update.classList.remove('show');
    }
}

// Modal_Notification_Integrity
function Show_Notification_Integrity(show = false)
{
    if (!Modal_Notification_Integrity)
        return;

    var exists = Modal_Notification_Integrity.classList.contains('show');

    if (show)
    {
        if (!exists)
            Modal_Notification_Integrity.classList.add('show');
    }
    else
    {
        if (exists)
            Modal_Notification_Integrity.classList.remove('show');
    }
}

// 4. Misc
// GameLocationText
ipcRenderer.on('SetGameLocation', function(event, string)
{
    GameLocationText.value           = string;
    global.userSettings.gameLocation = string;
});

// Version
ipcRenderer.on('app_version', function(event, arg)
{
  ipcRenderer.removeAllListeners('app_version');
  LauncherVersion.innerText = 'Version: ' + arg.version;
});

ipcRenderer.send('app_version');

ipcRenderer.on('update_available', function()
{
    ipcRenderer.removeAllListeners('update_available');
    Message_Update.innerText = 'A launcher update is available. Downloading now...';
    Show_Notification_Update(true);
});

ipcRenderer.on('update_downloaded', function()
{
    ipcRenderer.removeAllListeners('update_downloaded');
    Message_Update.innerText = 'Update downloaded, and needs to be installed. Update?';
    Button_Restart.removeAttribute('hidden');
    Show_Notification_Update(true);
});

ipcRenderer.on('integrity_failed', function()
{
    Message_Integrity.innerText = 'The integrity check of your game files has failed. You need to validate game files to repair them.';
    Show_Notification_Integrity(true);
});

// webview
// var webview = document.querySelector('webview');
// if (webview)
// {
//     webview.addEventListener('dom-ready', function()
//     {
//         webview.insertCSS('app-navigation { padding-top: 35px; }')
//     });
// }
