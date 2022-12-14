fs = require('fs');

var logFile = "launcher.log";

const getDateString = () =>
{
    var d = new Date(Date.now());
    var dateString = d.getFullYear() + "-" + ('0' + (d.getMonth()+1)).slice(-2) + "-" + ( '0' + d.getDate()).slice(-2) + " " +
    ('0' + (d.getHours())).slice(-2) + ":" + ('0' + (d.getMinutes())).slice(-2) + ":" + ('0' + (d.getSeconds())).slice(-2);

    return dateString;
}

module.exports = {
    write: async function(data)
    {
        data = "[" + getDateString() + "] " + data;

        try
        {
            fs.appendFile(logFile, data + "\n", {flag:'a+'}, (err) => {
                if (err) throw err;
            });

            console.log(data);
        }
        catch(e)
        {
            console.log( "ERROR: Unable to write data to log: " + e );
            throw new Error(e);
        }
    },

    error: async function(data)
    {
        data = "[" + getDateString() + "] " + data;

        try
        {
            fs.appendFile(logFile, data + "\n", {flag:'a+'}, (err) => {
                if (err) throw err;
            });

            console.log(data);
            console.trace('Stack Walk: ');
        }
        catch(e)
        {
            console.log( "ERROR: Unable to write data to log: " + e );
            throw new Error(e);
        }
    }
};
