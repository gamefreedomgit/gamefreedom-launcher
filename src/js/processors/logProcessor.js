fs = require('fs');

var logFile = "./launcher.log";

const getDateString = () =>
{
    var d = new Date(Date.now());
    var dateString = d.getFullYear() + "-" + ('0' + (d.getMonth()+1)).slice(-2) + "-" + ( '0' + d.getDate()).slice(-2) + " " +
    ('0' + (d.getHours())).slice(-2) + ":" + ('0' + (d.getMinutes())).slice(-2) + ":" + ('0' + (d.getSeconds())).slice(-2);

    return dateString;
}

module.exports = {
	write: function( data )
	{
		data = "[" + getDateString() + "] " + data;

		try {
			if(fs.existsAsync(logFile))
			{
				fs.appendFile(logFile, data + "\n", function ( err ) {
					if (err) throw err;
				});
			
				console.log( data );
			}
			else
			{
				fs.writeFile('launcher.log', '', err => {throw new Error(err);})
			}
		}
		catch(e)
		{
            console.log( "ERROR: Unable to write data to log: " + e );
            throw new Error(e);
		}
	},

	error: function( data )
	{
		data = "[" + getDateString() + "] " + data;

		try {
			fs.appendFile(logFile, data + "\n", function ( err ) {
				if (err) throw err;
			})
			console.log( data );
			console.trace('Stack Walk: ');
		}catch(e)
		{
            console.log( "[SERVER] ERROR: Unable to write data to log: " + e.stack || e );
		}
	}
};