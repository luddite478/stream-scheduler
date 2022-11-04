const axios = require('axios')
const { get_duration } = require('./utils')
const moment = require('moment')

async function save_ffplayout_playlist(ffplayout_playlist) {
	try {

		const { FFPAPI_TOKEN, FFPLAYOUT_IP, FFPLAYOUT_PORT} = process.env

		const res = await axios({
			method: 'post',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/api/playlist/1/`,
			headers: { 
				'Authorization': `Bearer ${FFPAPI_TOKEN}`,
			},
			data: ffplayout_playlist
		})

		console.log(res.data)

	} catch (e) {
		console.log('update_ffplayout_playlist: error with code', e)
	}
}

async function delete_ffplayout_playlist(date) {
	try {

		const { FFPAPI_TOKEN, FFPLAYOUT_IP, FFPLAYOUT_PORT} = process.env

		const res = await axios({
			method: 'delete',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/api/playlist/1/${date}`,
			headers: { 
				'Authorization': `Bearer ${FFPAPI_TOKEN}`,
			}
		})

		console.log(res.data)

	} catch (e) {
		console.log('update_ffplayout_playlist: error with code', e)
	}
}

async function get_ffplayout_files_list() {
	try {

		const { FFPAPI_TOKEN, FFPLAYOUT_IP, FFPLAYOUT_PORT} = process.env

		const res = await axios({
			method: 'post',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/api/file/1/browse/`,
			headers: { 
				'Authorization': `Bearer ${FFPAPI_TOKEN}`,
			},
			data: { 'source': '/' }
		})

		return res.data.files

	} catch (e) {
		console.log('get_ffplayout_files_list: error with code', e)
	}
}

function generate_ffplayout_playlist(pages_data, total_duration=86400, params) {

	const playlist = []
	const duration_cash = [] // otherwise we need to call ffprobe every iteration
	let i = 0
	while (i < total_duration) {
		pages_data.forEach(page => {
			let page_with_duration = duration_cash.filter(mp4 => mp4.path === page.mp4)[0]
			
			let duraion
			if (!page_with_duration) {
				duration = get_duration(page.mp4)
				duration_cash.push({
					path: page.mp4,
					duration: duration
				})
			} else {
				duration = page_with_duration.duration
			}

			playlist.push({
				in: 0,
				out: duration,
				duration,
				source: page.mp4	
			})

			i+=duration
		})
	}

	return {
		channel: "1",
		date: moment().format('YYYY-MM-DD'),
		program: playlist
	}
}

module.exports = {
	save_ffplayout_playlist,
	delete_ffplayout_playlist,
	get_ffplayout_files_list,
	generate_ffplayout_playlist
}