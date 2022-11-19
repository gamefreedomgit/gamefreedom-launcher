const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

class Database {

    instance = undefined;
    adapter = undefined;
    db = undefined;

    constructor() {
        // Sync database locally
        this.adapter = new FileSync("db.json");
        this.db = low(this.adapter);
    }

    start() {
        // Set some defaults (required if your JSON file is empty)
        this.db.defaults({ downloads: [], user: {} }).write();
    }

    addDownload(download) {
        this.db.get('downloads')
            .push(download)
            .write();
    }

    getLatestDownload() {
        const id = this.db.get('downloads').size()
        return this.db.get('downloads').find({id:id}).value();
    }
    
    getDownloads() {
        return this.db.get('downloads').value();
    }

    getDownload(id){
        return this.db.get('downloads').find({id:id}).value();
    }

    getDownloadByVersion(version)
    {
        return this.db.get('downloads').find({version:version}).value();
    }
}

class Singleton {

    constructor() {
        if (!Singleton.instance) {
            Singleton.instance = new Database();
        }
    }

    getInstance() {
        return Singleton.instance;
    }

}


module.exports = Singleton;