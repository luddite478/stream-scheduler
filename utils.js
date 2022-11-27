const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const { parseISO, differenceInSeconds } = require('date-fns')

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

function get_codec_name(file) {
	try {

	    const args = [
	    	'-v', '0',
	    	'-select_streams', 'a',
	    	'-show_entries', 'stream=codec_name',
	    	'-of', 'default=nk=1:nw=1',
	    	file
	    ]

		const proc = spawnSync('ffprobe', args)
	
		return proc.stdout.toString().trim()

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

function is_json_string(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

function get_time_interval_sec(start, end) {
	return differenceInSeconds(
		parseISO(start), 
		parseISO(end)
	)
}

module.exports = {
	get_duration,
	download_file,
	is_json_string,
	get_time_interval_sec,
	get_codec_name
}