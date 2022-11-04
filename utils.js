const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const axios = require('axios')

function get_duration(file) {
	try {

	    const args = [
	    	'-i', file,
	    	'-show_entries', 'format=duration',
	    	'-v', 'quiet',
	    	'-of', 'csv=p=0'
	    ]

		const proc = spawnSync('ffprobe', args)
		return Number(proc.stdout.toString().trim())

	} catch(e) {
		console.log(`Can not get duration of the file ${file}:`, e)
	}
}

async function download_file(fileUrl, outputLocationPath) {
 	const writer = fs.createWriteStream(outputLocationPath)

	return axios({
		method: 'get',
		url: fileUrl,
		responseType: 'stream',
	}).then(response => {

    //ensure that the user can call `then()` only when the file has
    //been downloaded entirely.
		return new Promise((resolve, reject) => {
			response.data.pipe(writer)
				let error = null
				writer.on('error', err => {
					error = err;
					writer.close();
					reject(err)
				})

				writer.on('close', () => {
					if (!error) {
						resolve(true)
					}
			//no need to call the reject here, as it will have been called in the
			//'error' stream;
			})
		})
	})
}

module.exports = {
	get_duration,
	download_file
}