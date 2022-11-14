const axios = require('axios')
const { get_duration } = require('./utils')
const moment = require('moment')
const { format, parseISO, formatISO, differenceInSeconds, endOfDay, addDays } = require('date-fns')
const intervalToDuration = require('date-fns/intervalToDuration')
const duraion_fns = require('duration-fns')


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

// function add_placeholders(pages_data) {
// 	const pages_with_placeholders = []
// 	let prev_end = 0
// 	let next_start = pages_data[0].meta.play_time.abs_start

// 	pages_data.forEach((page, i) => {
		
// 		let placeholder = {
// 			meta: {
// 				play_time: { 
// 					abs_start: prev_end,
// 					abs_end: next_start
// 				}
// 			},
// 			mp4: 'deep_brown_noise.mp4'
// 		}

// 		if (next_start > 0) {
// 			pages_with_placeholders.push(placeholder, page)
// 		}
		
// 		if ((i+1) < pages_data.length) {
// 			prev_end = pages_data[i].meta.play_time.abs_end
// 			next_start = pages_data[i+1].meta.play_time.abs_start	
// 		}

// 		// if last elem
// 		if (i === pages_data.length - 1 && pages_data[i].meta.play_time.abs_end < 86400) {
			
// 			let placeholder = {
// 				meta: {
// 					play_time: { 
// 						abs_start: prev_end,
// 						abs_end: next_start,
// 					}
// 				},
// 				mp4: 'deep_brown_noise.mp4'
// 			}
// 			placeholder.meta.play_time.abs_start = pages_data[i].meta.play_time.abs_end
// 			placeholder.meta.play_time.abs_end = 86400

// 			pages_with_placeholders.push(placeholder)
// 		}
// 	})

// 	return pages_with_placeholders
// }

function add_placeholders(pages_data) {
	const pages_with_placeholders = []
	let prev_end = 0
	let next_start = pages_data[0].meta.play_time.abs_start

	pages_data.forEach((page, i) => {
		
		let placeholder = {
			meta: {
				play_time: { 
					abs_start: prev_end,
					abs_end: next_start
				}
			},
			mp4: 'deep_brown_noise.mp4'
		}

		if (next_start > 0) {
			pages_with_placeholders.push(placeholder, page)
		}
		
		if ((i+1) < pages_data.length) {
			prev_end = pages_data[i].meta.play_time.abs_end
			next_start = pages_data[i+1].meta.play_time.abs_start	
		}

		// if last elem
		if (i === pages_data.length - 1 && pages_data[i].meta.play_time.abs_end < 86400) {
			
			let placeholder = {
				meta: {
					play_time: { 
						abs_start: prev_end,
						abs_end: next_start,
					}
				},
				mp4: 'deep_brown_noise.mp4'
			}
			placeholder.meta.play_time.abs_start = pages_data[i].meta.play_time.abs_end
			placeholder.meta.play_time.abs_end = 86400

			pages_with_placeholders.push(placeholder)
		}
	})

	return pages_with_placeholders
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

function generate_playlist(pages_data) {

	pages_data = set_abs_start_and_end(pages_data)

	pages_data = mark_pages_out_of_playlist_range(pages_data)
	
	pages_data = set_in_out_time(pages_data)

	// pages_data = set_in_duration(pages_data)

	// pages_data = add_placeholders(pages_data)
	
	pages_data.forEach(p => {
		console.log('p',p.meta)
	})

	
	// add_placeholders(pages_data)

	// pages_data = pages_with_play_time.sort((page1, page2) => {
	// 	return page1.meta.play_time.abs_in < page2.meta.play_time.abs_in
	// })


	// console.log(pages_data)
	// first_mp4_start = pages_data[0].meta.play_time.abs_in
	// placeholder_time = first_mp4_start
	// prev_abs_out = 0
	// while (i < total_duration) {
	// 	pages_data.forEach(page => {
	// 		if (page1.meta.play_time.abs_in < i) {
	// 			playlist.push({
	// 				in: 0,
	// 				out: duration,
	// 				duration,
	// 				source: page.mp4	
	// 			})
	// 		}

	// 		if 
	// 	})
	// }

	// while (i < total_duration) {
	// 	pages_data.forEach(page => {
	// 		// try to find mp4 in cash
	// 		let page_with_duration = duration_cash.filter(mp4 => mp4.path === page.mp4)[0]
			
	// 		let duraion
	// 		// if not found add video to cash
	// 		if (!page_with_duration) {
	// 			duration = get_duration(page.mp4)
	// 			duration_cash.push({
	// 				path: page.mp4,
	// 				duration: duration
	// 			})
	// 		} else {
	// 		// else get duration
	// 			duration = page_with_duration.duration
	// 		}

	// 		// add entry to playlist
	// 		playlist.push({
	// 			in: 0,
	// 			out: duration,
	// 			duration,
	// 			source: page.mp4	
	// 		})

	// 		i+=duration
	// 	})
	// }

	// return {
	// 	channel: "1",
	// 	date: moment().format('YYYY-MM-DD'),
	// 	program: playlist
	// }
}

module.exports = {
	save_ffplayout_playlist,
	delete_ffplayout_playlist,
	get_ffplayout_files_list,
	generate_playlist
}