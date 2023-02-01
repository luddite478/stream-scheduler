const axios = require('axios')
const { get_duration } = require('./utils')
const moment = require('moment')
const { format, parseISO, formatISO, differenceInSeconds, endOfDay, addDays } = require('date-fns')
const intervalToDuration = require('date-fns/intervalToDuration')
const duraion_fns = require('duration-fns')


async function save_ffplayout_playlist(ffplayout_playlist, token) {
	try {

		const { FFPAPI_TOKEN, FFPLAYOUT_IP, FFPLAYOUT_PORT} = process.env

		const res = await axios({
			method: 'post',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/api/playlist/1/`,
			headers: { 
				'Authorization': `Bearer ${token}`,
			},
			data: ffplayout_playlist
		})

		console.log('\n', res.data)

	} catch (e) {
		console.log('update_ffplayout_playlist: error with code', e)
	}
}

async function delete_ffplayout_playlist(date, token) {
	try {

		const { FFPAPI_TOKEN, FFPLAYOUT_IP, FFPLAYOUT_PORT} = process.env

		const res = await axios({
			method: 'delete',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/api/playlist/1/${date}`,
			headers: { 
				'Authorization': `Bearer ${token}`,
			}
		})

		console.log(res.data)

	} catch (e) {
		console.log('update_ffplayout_playlist: error with code', e)
	}
}

async function get_ffplayout_files_list(token) {
	try {

		const { FFPAPI_TOKEN, FFPLAYOUT_IP, FFPLAYOUT_PORT} = process.env

		const res = await axios({
			method: 'post',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/api/file/1/browse/`,
			headers: { 
				'Authorization': `Bearer ${token}`,
			},
			data: { 'source': '/' }
		})

		return res.data.files

	} catch (e) {
		console.log('get_ffplayout_files_list: error with code', e)
	}
}

async function reset_player_state(token) {
	try {

		const { FFPLAYOUT_IP, FFPLAYOUT_PORT} = process.env

		const res = await axios({
			method: 'post',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/api/control/1/playout/`,
			headers: { 
				'Authorization': `Bearer ${token}`,
			},
			data: { 'command': 'reset' }
		})

		console.log('\n',res.data.result)
		
		return res.data.result

	} catch (e) {
		console.log('reset_player_state: error with code', e)
	}
}

async function get_token() {
	try {

		const { 
			FFPLAYOUT_IP, 
			FFPLAYOUT_PORT,
			FFPLAYOUT_USERNAME,
			FFPLAYOUT_PASSWORD
		} = process.env
		// const FFPLAYOUT_IP = '127.0.0.1'
		const res = await axios({
			method: 'post',
			url: `http://${FFPLAYOUT_IP}:${FFPLAYOUT_PORT}/auth/login/`,
			data: { 
				'username': FFPLAYOUT_USERNAME,
				'password': FFPLAYOUT_PASSWORD
			}
		})
		console.log('token res',res)
		return res.data.user.token

	} catch (e) {
		console.log('get_token: error with code', e)
	}
}

function mark_pages_out_of_playlist_range(pages_data) {
	const today_yyyy_mm_dd = format(parseISO(formatISO(new Date())), "yyyy-MM-dd")
	
	return pages_data.map(page => {
		if (page.meta.play_time.abs_start < 0) {
			console.log(`Page with id ${page.meta.id} is out of start point by ${page.meta.play_time.abs_start} sec`)
			page.meta.play_time.out_range_start = page.meta.play_time.abs_start  
		}
		if (page.meta.play_time.abs_end > 86400) {
			console.log(`Page with id ${page.meta.id} is out of end point by ${page.meta.play_time.abs_end - 86400} sec`)
			page.meta.play_time.out_range_end = page.meta.play_time.abs_end - 86400
		}
		return page
	})
}

function set_abs_start_and_end(pages_data) {

	const today_yyyy_mm_dd = format(parseISO(formatISO(new Date())), "yyyy-MM-dd")
	const pages_without_play_time = []
	const pages_with_play_time = []

	pages_data.forEach(page => {
		if (!page.meta.play_time) {
			console.log(`\nNo play time selected for page with id ${page.meta.id}, skipping...`)
			pages_without_play_time.push(page) // TODO
			return 

		} else {
			page.meta.play_time.abs_start  = get_time_interval_sec(page.meta.play_time.start,`${today_yyyy_mm_dd}T06:00:00.000+04:00`)
			page.meta.play_time.abs_end    = get_time_interval_sec(page.meta.play_time.end,`${today_yyyy_mm_dd}T06:00:00.000+04:00`)
			pages_with_play_time.push(page)
		}
	})

	return pages_with_play_time
}

function set_in_out_time(pages_data) {
	const pages_data_with_duration = []
	const duration_cash = []
	pages_data.forEach(page => {
		// try to find mp4 in cash
		let page_with_duration = duration_cash.filter(mp4 => mp4.path === page.mp4)[0]
		
		let duraion
		// if not found add video to cash
		if (!page_with_duration) {
			duration = get_duration(page.mp4)
			duration_cash.push({
				path: page.mp4,
				duration: duration
			})
		} else {
			// else get duration
			duration = page_with_duration.duration
		}

		page.meta.play_time.duration = duration
		pages_data_with_duration.push(page)
	})

	return pages_data_with_duration
}


function add_placeholders(date, pages_data) {
	const { PLACEHOLDER_PATH } = process.env
	let pages_with_placeholders = []

	let prev_end = 0
	const day_start  = new Date(date)
	day_start.setTime(day_start.getTime() + (6-4)*60*60*1000) // +6 playlist -4 UTC
	let duration = (new Date(pages_data[0].meta.play_time.start) - day_start)/1000

	pages_data.forEach((page, i) => {
		let placeholder = {
			meta: {
				play_time: { 
					duration: duration,
					playlist_day: date
				}
			},
			mp4: PLACEHOLDER_PATH
		}

		if (duration > 0) {
			pages_with_placeholders = pages_with_placeholders.concat(placeholder)
		} 
		pages_with_placeholders = pages_with_placeholders.concat(page)
			
		if ((i+1) < pages_data.length) {
			prev_end = placeholder.meta.play_time.duration + page.meta.play_time.duration
			const next_start = (new Date(pages_data[i+1].meta.play_time.start) - day_start)/1000
			duration = next_start - prev_end
		}
	})

	// add last placeholder to the end
	let duration_sum = 0
	pages_with_placeholders.forEach(page => duration_sum+=page.meta.play_time.duration)
	if (duration_sum < 86400) {
		pages_with_placeholders.push({
			meta: {
				play_time: {
					duration: 86400-duration_sum,
					playlist_day: date
				}		
			},
			mp4: PLACEHOLDER_PATH
		})
	}
	return pages_with_placeholders
}

function generate_playlists(pages_data) {
	// find dates in pages data
	const dates = [...new Set(
			pages_data.map(page => page.meta.play_time.playlist_day
		)
	)]

	const date_page_mapping = dates.map(date => {
		const date_pages = []
		pages_data.forEach(page => {
			if (page.meta.play_time.playlist_day === date){
				date_pages.push(page)
			}
		})

		return {
			date,
			pages: date_pages
		}
	})

	const date_page_mapping_with_placeholders = date_page_mapping.map(d => {
		return {
			date: d.date,
			pages: add_placeholders(d.date, d.pages)
		}
	})

	// Generate ffplayout playlist
	const playlists = date_page_mapping_with_placeholders.map(d => {
		return {
			program: d.pages.map(p => {
				return {
					in: 0,
					out: p.meta.play_time.duration,
					duration: p.meta.play_time.duration,
					source: p.mp4
				}
			}),
			date: d.date,
			channel: '1'
		}
	})

	return playlists
}

function set_pages_playlist_dates(pages_data) {

	const pages_with_playlist_dates = []
	pages_data.forEach(page => {
		const page_start = page.meta.play_time.start
		const page_end   = page.meta.play_time.end

		let yyyy_mm_dd_start = new Date(page_start.split('T')[0])

		// if night hours of playlist
		if (new Date(page.meta.play_time.start).getHours() < 6) {
			yyyy_mm_dd_start = new Date(yyyy_mm_dd_start.setDate(yyyy_mm_dd_start.getDate()-1))
		}
		 																	    // +6 playlist -4 UTC
		const playlist_day_start = new Date(new Date(yyyy_mm_dd_start).getTime() + (2*60*60*1000))	
		const playlist_day_end   = new Date(new Date(yyyy_mm_dd_start).getTime() + (26*60*60*1000))

		if (new Date(page.meta.play_time.start) >= playlist_day_start &&
			new Date(page.meta.play_time.end) < playlist_day_end) {
			page.meta.play_time.playlist_day = yyyy_mm_dd_start.toISOString().split('T')[0]
		} else {
			console.log('\nset_pages_playlist_dates: out of range')
		}
		pages_with_playlist_dates.push(page)
	})

	return pages_with_playlist_dates
}

module.exports = {
	save_ffplayout_playlist,
	delete_ffplayout_playlist,
	get_ffplayout_files_list,
	generate_playlists,
	set_pages_playlist_dates,
	reset_player_state,
	get_token
}