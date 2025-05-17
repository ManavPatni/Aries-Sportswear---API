const path = require('path');
const axios = require('axios');

// Function to upload file buffer to server
const uploadToServer = async (buffer, filePath) => {
    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const accessKey = process.env.BUNNY_ACCESS_KEY;
    if (!storageZone || !accessKey) {
        throw new Error('Bunny.net configuration is missing');
    }
    const url = `https://sg.storage.bunnycdn.com/${storageZone}${filePath}`;
    try {
        await axios.put(url, buffer, {
            headers: {
                'AccessKey': accessKey,
                'Content-Type': 'application/octet-stream',
            },
        });
    } catch (error) {
        throw new Error('Failed to upload to server: ' + error.message);
    }
};

// Function to delete file from server
const deleteFromServer = async (filePath) => {
    const storageZone = process.env.BUNNY_STORAGE_ZONE;
    const accessKey = process.env.BUNNY_ACCESS_KEY;
    if (!storageZone || !accessKey) {
        throw new Error('Bunny.net configuration is missing');
    }
    const url = `https://sg.storage.bunnycdn.com/${storageZone}${filePath}`;
    try {
        await axios.delete(url, {
            headers: {
                'AccessKey': accessKey,
            },
        });
    } catch (error) {
        console.error('Failed to delete file from server:', error);
        // Deletion failure is logged but does not interrupt the process
    }
};
  
module.exports = {
    uploadToServer,
    deleteFromServer
}