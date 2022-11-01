const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

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

module.exports = {
	get_duration
}